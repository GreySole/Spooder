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
  const sconfig = ConfigService.getConfig();
  const router = Router();
  const publicRouter = Router();

  router.get('/server_config', (req, res) => {
    res.send(sconfig);
  });

  router.post('/save_config', async (req, res) => {
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

  return {
    local: router,
    public: publicRouter,
  };
}
