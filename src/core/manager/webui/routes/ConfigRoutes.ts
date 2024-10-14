import { backendDir } from '../../../../Types.ts';
import path from 'path';
import { Request, Response, Router } from 'express';
import fs from 'fs';
import { WebManager } from '../../WebManager.ts';
import ConfigManager from '../../ConfigManager.ts';
import { webLog } from '../../../Logging.ts';
import OSCManager from '../../OSCManager.ts';

export function ConfigRoutes() {
  const sconfig = ConfigManager.getConfig();
  const router = Router();
  const publicRouter = Router();

  router.get('/server_config', (req, res) => {
    res.send(sconfig);
  });

  router.post('/save_config', async (req, res) => {
    let statusMsg = '';
    if (sconfig.network.externalhandle == 'ngrok' && req.body.network.externalhandle != 'ngrok') {
      WebManager.stopNgrok();
      statusMsg += ' (Ngrok stopped)';
    } else if (
      sconfig.network.externalhandle != 'ngrok' &&
      req.body.network.externalhandle == 'ngrok'
    ) {
      sconfig.network.ngrokauthtoken = req.body.network.ngrokauthtoken;
      await WebManager.startNgrok();
      statusMsg += ' (Ngrok started)';
    }

    if (sconfig.network.externalhandle != req.body.network.externalhandle) {
      sconfig.network.externalhandle = req.body.network.externalhandle;
      sconfig.network.external_http_url = req.body.network.external_http_url;
      sconfig.network.ngrokauthtoken = sconfig.network.ngrokauthtoken;
    }

    ConfigManager.saveConfig(req.body);

    res.send({ status: 'CONFIG SAVED ' + statusMsg });
    webLog('SAVED THE CONFIG');
  });

  router.post('/save_custom_spooder', async (req: Request, res: Response) => {
    let statusMsg = 'Spooder Saved!';
    ConfigManager.saveThemes(req.body);
    res.send({ status: statusMsg });
    webLog('SAVED THE SPOODER');
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

  return {
    local: router,
    public: publicRouter,
  };
}
