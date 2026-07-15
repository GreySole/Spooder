import { EventService } from '../service/EventService';
import ModuleService from '../service/ModuleService';
import NodeRegistryService from '../service/NodeRegistryService';
import OperationNodeService from '../service/OperationNodeService';
import PluginService from '../service/PluginService';
import { json, Request, Response } from 'express';
import express from 'express';
import { webLog } from '../Logging';
import { KeyedObject } from '../../Types';
import {
  buildMockStreamMessage,
  checkResponseTrigger,
  verifyResponseScript,
} from '../util/ResponseUtil';
import { triggerExistsAndEnabled } from '../util/EventTriggerUtil';

export function EventRoutes() {
  const router = express.Router();
  const publicRouter = express.Router();

  router.get('/event_table', async (req: Request, res: Response) => {
    res.send({
      events: EventService.getEvents(),
      groups: EventService.getGroups(),
      plugins: Object.keys(PluginService.getActivePlugins()),
    });
  });

  router.get('/event_graphs', async (req: Request, res: Response) => {
    res.send({
      graphs: EventService.getGraphs(),
      groups: EventService.getGroups(),
      disabledGroups: EventService.getDisabledGroups(),
      plugins: Object.keys(PluginService.getActivePlugins()),
    });
  });

  router.post('/save_event_graphs', async (req: Request, res: Response) => {
    EventService.saveEventGraphs(req.body.graphs, req.body.groups, req.body.disabledGroups);
    res.send({ status: 'SAVE SUCCESS' });
    webLog('SAVED EVENT GRAPHS');
  });

  router.get('/node_manifest', async (req: Request, res: Response) => {
    res.send(NodeRegistryService.getAllManifests());
  });

  router.get('/node_manifest/:moduleName', async (req: Request, res: Response) => {
    const moduleName = req.params.moduleName as string;
    const streamModule = ModuleService.getStreamModule(moduleName);
    const communityModule = ModuleService.getCommunityModule(moduleName);
    const controlModule = ModuleService.getControlModule(moduleName);
    const mod = streamModule ?? communityModule ?? controlModule;

    if (mod) {
      res.send({
        moduleName,
        triggers: mod.getTriggerNodes(),
        actions: mod.getActionNodes(),
      });
      return;
    }

    const pluginManifest = NodeRegistryService.getPluginManifest(moduleName);
    if (pluginManifest) {
      res.send(pluginManifest);
      return;
    }

    res.status(404).send({ status: 'error', message: `Module '${moduleName}' not found` });
  });

  router.get('/operation_nodes', async (req: Request, res: Response) => {
    res.send(OperationNodeService.getOperationNodes());
  });

  router.get('/chat_commands', (req: Request, res: Response) => {
    const events = EventService.getEvents();
    const chatCommands = {} as KeyedObject;
    for (let e in events) {
      if (triggerExistsAndEnabled(events[e], 'chat')) {
        chatCommands[e] = { group: events[e].group, command: events[e].triggers.chat.command };
      }
    }
    res.send(chatCommands);
  });

  router.post('/save_events', async (req: Request, res: Response) => {
    EventService.saveEvents(req.body.events, req.body.groups, req.body.disabledGroups);
    res.send({ status: 'SAVE SUCCESS' });
    webLog('SAVED COMMANDS');
  });

  async function verifyResponseScriptPOST(req: Request, res: Response) {
    console.log(req.body);
    const command = req.body.command;
    const script = req.body.script;
    const message = buildMockStreamMessage(req.body.message);
    const eventTemplate = {
      name: command,
      description: '',
      group: '_TestGroup',
      triggers: {
        chat: {
          enabled: true,
          command: command,
          search: false,
          vip: false,
          mod: false,
          sub: false,
          broadcaster: false,
        },
        osc: {
          enabled: false,
          handle: 'trigger',
          address: '/',
          type: 'single',
          condition: '==',
          value: '0',
          condition2: '==',
          value2: '0',
        },
        twitch: {
          enabled: false,
          type: 'redeem',
          reward: {
            id: '',
            override: false,
          },
        },
      },
      commands: [
        {
          type: 'response',
          message: script,
          delay: 0,
        },
      ],
      cooldown: 0,
      chatnotification: false,
      cooldownnotification: false,
    };
    let check = checkResponseTrigger(eventTemplate, message);
    if (check != null) {
      let response = await verifyResponseScript(
        command,
        check.message,
        check.extra as string[],
        script,
      );
      res.send(response);
    } else {
      res.send({
        status: 'error',
        response: 'The input text did not trigger the response.',
      });
    }
  }

  router.post('/verify_response_script', verifyResponseScriptPOST);

  return {
    local: router,
    public: publicRouter,
  };
}
