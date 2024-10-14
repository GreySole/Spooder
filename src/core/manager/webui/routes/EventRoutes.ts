import { checkResponseTrigger, EventManager, verifyResponseScript } from '../../EventManager.ts';
import PluginManager from '../../PluginManager.ts';
import { Request, Response } from 'express';
import ConfigManager from '../../ConfigManager.ts';
import ShareManager from '../../ShareManager.ts';
import OSCManager from '../../OSCManager.ts';
import express from 'express';
import { webLog } from '../../../Logging.ts';
import { KeyedObject } from 'src/Types.ts';

export function EventRoutes() {
  const router = express.Router();
  const publicRouter = express.Router();

  router.get('/event_table', async (req: Request, res: Response) => {
    res.send({
      events: EventManager.getEvents(),
      groups: EventManager.getGroups(),
      plugins: Object.keys(PluginManager.getActivePlugins()),
    });
  });

  router.get('/chat_commands', (req: Request, res: Response) => {
    const events = EventManager.getEvents();
    const chatCommands = {} as KeyedObject;
    for (let e in events) {
      if (events[e].triggers.chat?.enabled) {
        chatCommands[e] = { group: events[e].group, command: events[e].triggers.chat.command };
      }
    }
    res.send(chatCommands);
  });

  router.post('/save_events', async (req: Request, res: Response) => {
    EventManager.saveEvents(req.body.events, req.body.groups);
    res.send({ status: 'SAVE SUCCESS' });
    webLog('SAVED COMMANDS');
  });

  router.post('/verify_response_script', async (req: Request, res: Response) => {
    let check = checkResponseTrigger(req.body.event, req.body.message);
    if (check != null) {
      let response = await verifyResponseScript(
        req.body.eventName,
        check.message,
        check.extra as string[],
        req.body.script,
      );
      res.send(response);
    } else {
      res.send({
        status: 'error',
        response: 'The input text did not trigger the response.',
      });
    }
  });

  return {
    local: router,
    public: publicRouter,
  };
}
