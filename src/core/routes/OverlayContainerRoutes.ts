import express, { Request, Response, Router } from 'express';
import ConfigService, { OverlayContainerEntry } from '../service/ConfigService';
import PluginService from '../service/PluginService';

const DEFAULT_LAYOUT = { x: 0, y: 0, width: 100, height: 100 };

function withLayoutDefaults(entry: Partial<OverlayContainerEntry>): OverlayContainerEntry {
  return {
    pluginName: entry.pluginName as string,
    enabled: entry.enabled ?? false,
    x: entry.x ?? DEFAULT_LAYOUT.x,
    y: entry.y ?? DEFAULT_LAYOUT.y,
    width: entry.width ?? DEFAULT_LAYOUT.width,
    height: entry.height ?? DEFAULT_LAYOUT.height,
  };
}

export function OverlayContainerRoutes() {
  const router = Router();
  router.use(express.json());
  const publicRouter = Router();

  function getContainerConfig(req: Request, res: Response) {
    const saved = ConfigService.getOverlayContainer();
    const activePlugins = PluginService.getActivePlugins();
    const overlayCapable = Object.values(activePlugins).filter((p) => p.hasOverlay);
    const validNames = new Set(overlayCapable.map((p) => p.dirname));

    const merged = saved.order.filter((entry) => validNames.has(entry.pluginName)).map(withLayoutDefaults);

    const knownNames = new Set(merged.map((entry) => entry.pluginName));
    for (const plugin of overlayCapable) {
      if (!knownNames.has(plugin.dirname)) {
        merged.push(withLayoutDefaults({ pluginName: plugin.dirname, enabled: false }));
      }
    }

    const enriched = merged.map((entry) => ({
      ...entry,
      displayName: activePlugins[entry.pluginName]?.name ?? entry.pluginName,
    }));

    res.send({ order: enriched });
  }

  function saveContainerConfig(req: Request, res: Response) {
    const body = req.body as { order: Partial<OverlayContainerEntry>[] };
    ConfigService.saveOverlayContainer({
      order: body.order.map(withLayoutDefaults),
    });
    res.send({ status: 'ok' });
  }

  router.get('/config', getContainerConfig);
  publicRouter.get('/config', getContainerConfig);

  router.post('/save', saveContainerConfig);

  return { local: router, public: publicRouter };
}
