import { userDir } from '../../Types';
import path from 'path';
import { Request, Response, Router } from 'express';
import fs from 'fs';
import { WebService } from '../service/WebService';
import ConfigService from '../service/ConfigService';
import { webLog } from '../Logging';
import OSCService from '../service/OSCService';
import { json } from 'express';

export function ConfigRoutes() {
  const router = Router();
  const publicRouter = Router();

  // Read per request, not captured once at route setup: saveConfig ends in refreshConfig,
  // which replaces the config object entirely, so a captured reference goes stale the first
  // time anything is saved. The config tab loads its form from here, and a stale read would
  // have it save back a snapshot from before (say) a UDP server was added elsewhere.
  router.get('/server_config', (req: Request, res: Response) => {
    res.send(ConfigService.getConfig());
  });

  router.post('/save_config', async (req: Request, res: Response) => {
    ConfigService.saveConfig(req.body);

    res.send({ status: 'ok' });
    webLog('Config Saved!');

    webLog('Restarting Public Hosting');
    WebService.stopPublicHosting();
    setTimeout(() => {
      WebService.startPublicHosting();
    }, 2000);
  });

  router.post('/save_custom_spooder', async (req: Request, res: Response) => {
    ConfigService.saveThemes(req.body);
    res.send({ status: 'ok' });
    webLog('Spooder Saved!');
  });

  router.get('/osc_tunnels', async (req: Request, res: Response) => {
    const osctunnels = OSCService.getTunnels();
    res.send(osctunnels);
  });

  router.post('/save_osc_tunnels', async (req: Request, res: Response) => {
    OSCService.saveTunnels(req.body);
    res.send({ status: 'ok' });
    webLog('Tunnels Saved!');
  });

  router.get('/udp_clients', (req: Request, res: Response) => {
    const udpClients = OSCService.getUdpServers();
    res.send(udpClients);
  });

  // Separate from /save_config so the node inspector's UDP panel can add a destination
  // without posting the whole config back - and without the public-hosting restart that
  // /save_config triggers, which would drop overlay connections mid-stream.
  router.post('/save_udp_servers', (req: Request, res: Response) => {
    if (req.body == null || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).send({ status: 'error', message: 'Expected a UDP server map.' });
      return;
    }

    OSCService.saveUdpServers(req.body);
    res.send({ status: 'ok' });
    webLog('UDP Servers Saved!');
  });

  return {
    local: router,
    public: publicRouter,
  };
}
