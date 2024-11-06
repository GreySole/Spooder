import { EventService } from '../service/EventService.ts';
import PluginService from '../service/PluginService.ts';
import { Request, Response } from 'express';
import express from 'express';
import { webLog } from '../Logging.ts';
import { KeyedObject } from 'src/Types.ts';
import { checkResponseTrigger, verifyResponseScript } from 'src/core/util/ResponseUtil.ts';

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
