import { userDir } from '../../Types.ts';
import path from 'path';
import { Request, Response, Router } from 'express';
import fs from 'fs';
import { WebService } from '../service/WebService.ts';
import ConfigService from '../service/ConfigService.ts';
import { webLog } from '../Logging.ts';
import OSCService from '../service/OSCService.ts';
import { json } from 'express';

export function ConfigRoutes() {
  const sconfig = ConfigService.getConfig();
  const router = Router();
  const publicRouter = Router();

  router.use(json());

  router.get('/server_config', (req, res) => {
    res.send(sconfig);
  });

  router.post('/save_config', async (req, res) => {
    let statusMsg = '';
    if (sconfig.network.externalhandle == 'ngrok' && req.body.network.externalhandle != 'ngrok') {
      WebService.stopNgrok();
      statusMsg += ' (Ngrok stopped)';
    } else if (
      sconfig.network.externalhandle != 'ngrok' &&
      req.body.network.externalhandle == 'ngrok'
    ) {
      sconfig.network.ngrokauthtoken = req.body.network.ngrokauthtoken;
      await WebService.startNgrok();
      statusMsg += ' (Ngrok started)';
    }

    if (sconfig.network.externalhandle != req.body.network.externalhandle) {
      sconfig.network.externalhandle = req.body.network.externalhandle;
      sconfig.network.external_http_url = req.body.network.external_http_url;
      sconfig.network.ngrokauthtoken = sconfig.network.ngrokauthtoken;
    }

    ConfigService.saveConfig(req.body);

    res.send({ status: 'CONFIG SAVED ' + statusMsg });
    webLog('SAVED THE CONFIG');
  });

  router.post('/save_custom_spooder', async (req: Request, res: Response) => {
    let statusMsg = 'Spooder Saved!';
    ConfigService.saveThemes(req.body);
    res.send({ status: statusMsg });
    webLog('SAVED THE SPOODER');
  });

  router.get('/osc_tunnels', async (req: Request, res: Response) => {
    const osctunnels = OSCService.getTunnels();
    res.send(osctunnels);
  });

  router.post('/save_osc_tunnels', async (req: Request, res: Response) => {
    OSCService.saveTunnels(req.body);
    res.send({ status: 'SAVE SUCCESS' });
    webLog('SAVED THE TUNNELS');
  });

  router.get('/udp_clients', (req: Request, res: Response) => {
    const udpClients = OSCService.getUdpClients();

    res.send(udpClients);
  });

  return {
    local: router,
    public: publicRouter,
  };
}
