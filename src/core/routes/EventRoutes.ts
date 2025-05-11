import { EventService } from '../service/EventService.ts';
import PluginService from '../service/PluginService.ts';
import { json, Request, Response } from 'express';
import express from 'express';
import { webLog } from '../Logging.ts';
import { KeyedObject } from 'src/Types.ts';
import {
  buildMockStreamMessage,
  checkResponseTrigger,
  verifyResponseScript,
} from 'src/core/util/ResponseUtil.ts';

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

  router.get('/chat_commands', (req: Request, res: Response) => {
    const events = EventService.getEvents();
    const chatCommands = {} as KeyedObject;
    for (let e in events) {
      if (events[e].triggers.chat?.enabled) {
        chatCommands[e] = { group: events[e].group, command: events[e].triggers.chat.command };
      }
    }
    res.send(chatCommands);
  });

  router.post('/save_events', async (req: Request, res: Response) => {
    EventService.saveEvents(req.body.events, req.body.groups);
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
