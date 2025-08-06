import express, { Request, Response } from 'express';
import MonitorService from '../service/MonitorService';
import ConfigService from '../service/ConfigService';
import PluginService from '../service/PluginService';
import ShareService from '../service/ShareService';
import { EventService } from '../service/EventService';
import OSCService from '../service/OSCService';
import { WebService } from '../service/WebService';

export function ServerRoutes() {
  const router = express.Router();

  router.get('/server_state', async (req, res) => {
    const sconfig = ConfigService.getConfig();
    const activePlugins = PluginService.getActivePlugins();
    const themes = ConfigService.getThemes();
    const shares = ShareService.getShares();
    const activeShares = ShareService.getActiveShares();

    res.send({
      host: sconfig.network.host,
      port: sconfig.network.host_port,
      udp_servers: OSCService.getUdpServers(),
      plugins: Object.keys(activePlugins),
      themes: themes,
      activeShares: activeShares,
      shares: Object.keys(shares),
    });
  });

  router.get('/active_events', (req: Request, res: Response) => {
    const events = EventService.getActiveEvents();
    res.send(events);
  });

  router.get('/log', (req: Request, res: Response) => {
    const logs = MonitorService.getMonitorLogs();
    res.send(logs);
  });

  router.get('/status', async (req, res) => {
    const status = await MonitorService.getSystemStatus();
    res.send(status);
  });

  router.get('/public_url', (req: Request, res: Response) => {
    const publicHttpUrl = WebService.getPublicHTTPUrl();
    const publicOscUrl = WebService.getPublicOSCUrl();
    res.send({ http: publicHttpUrl, osc: publicOscUrl });
  });

  return {
    local: router,
  };
}
