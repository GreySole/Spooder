import fs from 'fs';
import path from 'path';
import { Request, Response, Router } from 'express';
import { KeyedObject, userDir } from '../../Types';
import { webLog } from '../Logging';
import { EventService } from '../service/EventService';
import { runTriggerNow } from '../service/event/EventGraphExecutor';
import ModuleService from '../service/ModuleService';
import ModuleUIService from '../service/ModuleUIService';
import NodeRegistryService from '../service/NodeRegistryService';
import PluginService from '../service/PluginService';
import { collectOperationNodes } from './EventRoutes';

// What a moderator can do to the event graphs. Everything here is scoped to the groups the owner
// marked mod-editable (EventService.getModGroups): events in any other group can't be read,
// changed, moved into or out of, or fired, whatever a request names. The owner's own editor uses
// the unrestricted /events routes; these exist so the mod UI never needs them.

type Guard = (req: Request) => string;

export function registerModEventRoutes(router: Router, validateUser: Guard) {
  function guarded(handler: (req: Request, res: Response) => void | Promise<void>) {
    return (req: Request, res: Response) => {
      if (validateUser(req) !== 'ok') {
        res.status(401).send({ status: 'unauthorized' });
        return;
      }
      return handler(req, res);
    };
  }

  const inModGroup = (group: unknown) =>
    typeof group === 'string' && EventService.getModGroups().includes(group);

  router.get(
    '/event_graphs',
    guarded((req, res) => {
      const all = EventService.getGraphs();
      const graphs: KeyedObject = {};
      for (const id in all) {
        if (inModGroup(all[id].group)) {
          graphs[id] = all[id];
        }
      }
      res.send({
        graphs,
        groups: EventService.getGroups().filter((group) => inModGroup(group)),
        disabledGroups: [],
      });
    }),
  );

  router.post(
    '/save_event_graphs',
    guarded((req, res) => {
      const submitted = req.body?.graphs;
      if (typeof submitted !== 'object' || submitted === null || Array.isArray(submitted)) {
        res.status(400).send({ status: 'error', message: 'No graphs to save.' });
        return;
      }
      const all = EventService.getGraphs();

      for (const id in submitted) {
        // Into the mod groups only - a graph can't be created in, or moved into, anything else.
        if (!inModGroup(submitted[id]?.group)) {
          res.status(403).send({
            status: 'error',
            message: `'${id}' is not in a group moderators can edit.`,
          });
          return;
        }
        // And not over an event the owner keeps outside them.
        if (all[id] && !inModGroup(all[id].group)) {
          res.status(403).send({
            status: 'error',
            message: `'${id}' belongs to an event moderators can't edit.`,
          });
          return;
        }
      }

      // The owner's events stay exactly as they are. Mod-group events are replaced by what was
      // sent, so one left out of it is one the moderator deleted.
      const next: KeyedObject = {};
      for (const id in all) {
        if (!inModGroup(all[id].group)) {
          next[id] = all[id];
        }
      }
      Object.assign(next, submitted);

      EventService.saveEventGraphs(
        next as any,
        EventService.getGroups(),
        EventService.getDisabledGroups(),
      );
      res.send({ status: 'SAVE SUCCESS' });
      webLog('SAVED EVENT GRAPHS (moderator)');
    }),
  );

  router.post(
    '/event_graphs/:eventName/nodes/:nodeId/trigger_now',
    guarded((req, res) => {
      const eventName = req.params.eventName as string;
      const nodeId = req.params.nodeId as string;
      const graph = EventService.getGraphs()[eventName];
      // Same answer for a missing event and one outside the mod groups, so it can't be used to
      // probe which of the owner's events exist.
      const node = inModGroup(graph?.group) ? graph.nodes.find((n) => n.id === nodeId) : undefined;
      if (!graph || !node) {
        res.status(404).send({
          status: 'error',
          message: 'Trigger not found - save your changes and try again.',
        });
        return;
      }
      if (node.kind !== 'callback') {
        res.status(400).send({ status: 'error', message: 'That node is not a trigger.' });
        return;
      }
      res.send({ status: 'ok', ranActions: runTriggerNow(graph, eventName, nodeId) });
    }),
  );

  // What the editor builds its palette from - the same for every user.
  router.get(
    '/node_manifest',
    guarded((req, res) => {
      res.send(NodeRegistryService.getAllManifests());
    }),
  );

  router.get(
    '/operation_nodes',
    guarded((req, res) => {
      res.send(collectOperationNodes());
    }),
  );

  // Just enough to name a plugin in a plugin node's picker.
  router.get(
    '/plugins',
    guarded((req, res) => {
      const active = PluginService.getActivePlugins();
      const plugins: KeyedObject = {};
      for (const name in active) {
        plugins[name] = { name: active[name].name ? active[name].name : name };
      }
      res.send(plugins);
    }),
  );

  router.get(
    '/plugin_events_form',
    guarded((req, res) => {
      const pluginName = String(req.query.plugin ?? '');
      // Only a plugin that's actually loaded, so the name can't be used to read another path.
      if (!PluginService.getActivePlugins()[pluginName]) {
        res.send(null);
        return;
      }
      const eventsForm = path.join(userDir, 'plugins', pluginName, 'events-form.json');
      res.send(
        fs.existsSync(eventsForm) ? JSON.parse(fs.readFileSync(eventsForm, { encoding: 'utf8' })) : null,
      );
    }),
  );

  router.get(
    '/response_handlers',
    guarded((req, res) => {
      const handlers = ModuleService.getResponseHandlers();
      const described: KeyedObject = {};
      for (const name in handlers) {
        described[name] = handlers[name].descriptions;
      }
      res.send(described);
    }),
  );

  // The WebUI modules whose inspectors, test panels and pickers the mod UI's editor loads, the
  // same lists the owner's WebUI reads from /module.
  router.get(
    '/module_ui',
    guarded((req, res) => {
      res.send(ModuleUIService.getInstalled());
    }),
  );

  router.get(
    '/module_loaded',
    guarded((req, res) => {
      res.send(
        Object.keys({
          ...ModuleService.getStreamModules(),
          ...ModuleService.getCommunityModules(),
          ...ModuleService.getControlModules(),
        }),
      );
    }),
  );
}
