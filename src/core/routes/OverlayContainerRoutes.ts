import express, { Request, Response, Router } from 'express';
import ConfigService, {
  DEFAULT_OVERLAY_CANVAS,
  OverlayCanvasSize,
  OVERLAY_LAYOUT_NAME,
  OverlayLayer,
} from '../service/ConfigService';
import { getOverlayWidget, OVERLAY_WIDGETS, OverlayWidgetDef } from '../service/OverlayWidgets';
import { EventService } from '../service/EventService';
import EventStorageService from '../service/EventStorageService';
import PluginService from '../service/PluginService';

const DEFAULT_LAYOUT = { x: 0, y: 0, width: 100, height: 100 };

// Reduces a layer to what's storable and drops anything that can't be drawn: a plugin that
// isn't installed or has no overlay, or a widget type this build doesn't know. Widget settings
// are laid over the widget's defaults so a widget added before a setting existed still has it.
function normalizeLayer(
  layer: Partial<OverlayLayer>,
  overlayPlugins: Set<string>,
): OverlayLayer | null {
  const box = {
    x: Number.isFinite(Number(layer.x)) ? Number(layer.x) : DEFAULT_LAYOUT.x,
    y: Number.isFinite(Number(layer.y)) ? Number(layer.y) : DEFAULT_LAYOUT.y,
    width: Number.isFinite(Number(layer.width)) ? Number(layer.width) : DEFAULT_LAYOUT.width,
    height: Number.isFinite(Number(layer.height)) ? Number(layer.height) : DEFAULT_LAYOUT.height,
  };
  if (layer.type === 'plugin') {
    if (!layer.pluginName || !overlayPlugins.has(layer.pluginName)) {
      return null;
    }
    return { id: layer.pluginName, type: 'plugin', pluginName: layer.pluginName, ...box };
  }
  if (layer.type === 'widget') {
    const widget = layer.widgetType ? getOverlayWidget(layer.widgetType) : undefined;
    if (!widget || typeof layer.id !== 'string' || layer.id === '') {
      return null;
    }
    return {
      id: layer.id,
      type: 'widget',
      widgetType: widget.id,
      settings: { ...widget.defaults, ...(layer.settings ?? {}) },
      ...box,
    };
  }
  return null;
}

const SET_VALUE_NODES = new Set([
  'set_string_value',
  'set_number_value',
  'set_boolean_value',
  'set_array_value',
]);

// Keys each event holds or is set up to write: the ones its Set Value nodes name, plus whatever
// storage already contains (script-written keys, for one). Reading the graphs is what lets a
// temporary key show up before it has ever been written - it lives only in memory and only after
// a node has run. A key wired into a node from another node isn't known until it runs, so it
// only appears once written.
function collectEventKeys(): { [eventName: string]: string[] } {
  const keys: { [eventName: string]: Set<string> } = {};
  for (const [eventName, stored] of Object.entries(EventStorageService.listAllKeys())) {
    keys[eventName] = new Set(stored);
  }
  const graphs = EventService.getGraphs();
  for (const graphId in graphs) {
    for (const node of graphs[graphId].nodes ?? []) {
      if (node.moduleName !== 'core' || !SET_VALUE_NODES.has(node.nodeTypeId)) {
        continue;
      }
      const key = node.values?.key;
      if (typeof key !== 'string' || key === '') {
        continue;
      }
      // Same rule the node itself follows when it runs: no event named means its own.
      const target = node.values?.eventName || graphId;
      (keys[target] ??= new Set()).add(key);
    }
  }
  return Object.fromEntries(
    Object.entries(keys).map(([eventName, set]) => [eventName, [...set].sort()]),
  );
}

// Fills in the option lists that depend on what's installed or defined right now.
function withDynamicOptions(widgets: OverlayWidgetDef[]): OverlayWidgetDef[] {
  const graphs = EventService.getGraphs();
  const events = Object.keys(graphs)
    .map((id) => ({ label: graphs[id].name || id, value: id }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return widgets.map((widget) => ({
    ...widget,
    form: Object.fromEntries(
      Object.entries(widget.form).map(([field, def]) => [
        field,
        def.optionsFrom === 'events' ? { ...def, options: events } : def,
      ]),
    ),
  }));
}

function validCanvas(canvas: Partial<OverlayCanvasSize> | undefined): OverlayCanvasSize {
  const width = Math.round(Number(canvas?.width));
  const height = Math.round(Number(canvas?.height));
  const ok = (n: number) => Number.isFinite(n) && n >= 100 && n <= 16384;
  return ok(width) && ok(height) ? { width, height } : { ...DEFAULT_OVERLAY_CANVAS };
}

export function OverlayContainerRoutes() {
  const router = Router();
  router.use(express.json());
  const publicRouter = Router();

  function layoutNameFrom(value: unknown): string | null {
    const name = typeof value === 'string' ? value.toLowerCase() : '';
    return OVERLAY_LAYOUT_NAME.test(name) ? name : null;
  }

  function getContainerConfig(req: Request, res: Response) {
    const name = layoutNameFrom(req.query.layout);
    const saved = name ? ConfigService.getOverlayLayouts().layouts[name] : undefined;
    if (!name || !saved) {
      res.status(404).send({ error: 'No such overlay layout.' });
      return;
    }
    const activePlugins = PluginService.getActivePlugins();
    const overlayCapable = Object.values(activePlugins).filter((p) => p.hasOverlay);
    const overlayNames = new Set(overlayCapable.map((p) => p.dirname));

    const layers = (saved.layers ?? [])
      .map((layer) => normalizeLayer(layer, overlayNames))
      .filter((layer): layer is OverlayLayer => layer !== null)
      .map((layer) => ({
        ...layer,
        displayName:
          layer.type === 'plugin'
            ? (activePlugins[layer.pluginName!]?.name ?? layer.pluginName)
            : (getOverlayWidget(layer.widgetType!)?.label ?? layer.widgetType),
      }));

    res.send({
      layout: name,
      canvas: validCanvas(saved.canvas),
      layers,
      // What the editor can add: overlay plugins, and the built-in widgets.
      plugins: overlayCapable.map((p) => ({
        pluginName: p.dirname,
        displayName: p.name,
        category: p.overlayCategory,
      })),
      widgets: withDynamicOptions(OVERLAY_WIDGETS),
      // Keys each event holds, for widget fields that pick one (see optionsFrom: 'eventKeys').
      eventKeys: collectEventKeys(),
    });
  }

  // The initial value for a storage widget, read when its overlay loads (later changes arrive
  // over OSC). Public routes serve overlays too, so this only answers for event/key pairs a saved
  // widget actually points at, rather than exposing everything in event storage.
  function getStorageValue(req: Request, res: Response) {
    const eventName = String(req.query.event ?? '');
    const key = String(req.query.key ?? '');
    const referenced = Object.values(ConfigService.getOverlayLayouts().layouts).some((layout) =>
      (layout.layers ?? []).some(
        (layer) =>
          layer.type === 'widget' &&
          layer.widgetType?.startsWith('storage_') &&
          layer.settings?.eventName === eventName &&
          // A bar can also read its min and max from keys of the same event.
          (layer.settings?.key === key ||
            (layer.settings?.minFromKey === true && layer.settings?.minKey === key) ||
            (layer.settings?.maxFromKey === true && layer.settings?.maxKey === key)),
      ),
    );
    if (!referenced) {
      res.status(404).send({ error: 'No widget uses that value.' });
      return;
    }
    res.send({ value: EventStorageService.getRawValue(eventName, key, null) });
  }

  function getLayoutNames(req: Request, res: Response) {
    res.send({ layouts: Object.keys(ConfigService.getOverlayLayouts().layouts) });
  }

  // Saving under a name that doesn't exist yet creates it, so 'New layout' is just a save.
  function saveContainerConfig(req: Request, res: Response) {
    const body = req.body as {
      layout?: string;
      canvas?: Partial<OverlayCanvasSize>;
      layers: Partial<OverlayLayer>[];
    };
    const name = layoutNameFrom(body.layout);
    if (!name) {
      res.status(400).send({ error: 'Layout names may use letters, numbers, - and _ (up to 40).' });
      return;
    }
    const overlayNames = new Set(
      Object.values(PluginService.getActivePlugins())
        .filter((p) => p.hasOverlay)
        .map((p) => p.dirname),
    );
    const seen = new Set<string>();
    const layers = (body.layers ?? [])
      .map((layer) => normalizeLayer(layer, overlayNames))
      // One layer per id, so a plugin can't be placed twice.
      .filter((layer): layer is OverlayLayer => layer !== null && !seen.has(layer.id) && !!seen.add(layer.id));
    const all = ConfigService.getOverlayLayouts();
    ConfigService.saveOverlayLayouts({
      layouts: { ...all.layouts, [name]: { canvas: validCanvas(body.canvas), layers } },
    });
    res.send({ status: 'ok', layout: name });
  }

  function renameLayout(req: Request, res: Response) {
    const { from, to } = req.body as { from?: string; to?: string };
    const oldName = layoutNameFrom(from);
    const newName = layoutNameFrom(to);
    const all = ConfigService.getOverlayLayouts();
    if (!oldName || !newName || !all.layouts[oldName]) {
      res.status(400).send({ error: 'Invalid layout name.' });
      return;
    }
    if (all.layouts[newName]) {
      res.status(409).send({ error: 'A layout with that name already exists.' });
      return;
    }
    const { [oldName]: moved, ...rest } = all.layouts;
    ConfigService.saveOverlayLayouts({ layouts: { ...rest, [newName]: moved } });
    res.send({ status: 'ok', layout: newName });
  }

  function deleteLayout(req: Request, res: Response) {
    const name = layoutNameFrom((req.body as { layout?: string }).layout);
    const all = ConfigService.getOverlayLayouts();
    if (!name || !all.layouts[name]) {
      res.status(400).send({ error: 'Invalid layout name.' });
      return;
    }
    const { [name]: removed, ...rest } = all.layouts;
    ConfigService.saveOverlayLayouts({ layouts: rest });
    res.send({ status: 'ok' });
  }

  router.get('/config', getContainerConfig);
  publicRouter.get('/config', getContainerConfig);

  router.get('/storage', getStorageValue);
  publicRouter.get('/storage', getStorageValue);
  router.get('/layouts', getLayoutNames);
  router.post('/save', saveContainerConfig);
  router.post('/rename', renameLayout);
  router.post('/delete', deleteLayout);

  return { local: router, public: publicRouter };
}
