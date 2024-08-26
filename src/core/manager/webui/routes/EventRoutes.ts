import { checkResponseTrigger, EventManager, verifyResponseScript } from '../../EventManager.ts';
import PluginManager from '../../PluginManager.ts';
import { Request, Response } from 'express';
import ConfigManager from '../../ConfigManager.ts';
import ShareManager from '../../ShareManager.ts';
import OSCManager from '../../OSCManager.ts';
import express from 'express';
import { webLog } from '../../../Logging.ts';

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

  router.post('/save_events', async (req: Request, res: Response) => {
    EventManager.saveEvents(req.body.events, req.body.groups);
    res.send({ status: 'SAVE SUCCESS' });
    webLog('SAVED COMMANDS');
  });

  router.get('/osc_tunnels', async (req: Request, res: Response) => {
    const osctunnels = OSCManager.getTunnels();
    res.send(JSON.stringify(osctunnels));
  });

  router.post('/save_osc_tunnels', async (req: Request, res: Response) => {
    OSCManager.saveTunnels(req.body);
    res.send({ status: 'SAVE SUCCESS' });
    webLog('SAVED THE TUNNELS');
  });

  router.get('/udp_clients', (req: Request, res: Response) => {
    const sconfig = ConfigManager.getConfig();

    res.send({ express: JSON.stringify(sconfig.network.udp_clients) });
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
