import express from 'express';
import MonitorManager from '../../MonitorManager.ts';
import ConfigManager from '../../ConfigManager.ts';
import PluginManager from '../../PluginManager.ts';
import ShareManager from '../../ShareManager.ts';

export function ServerRoutes() {
  const router = express.Router();

  router.get('/server_state', async (req, res) => {
    const sconfig = ConfigManager.getConfig();
    const activePlugins = PluginManager.getActivePlugins();
    const themes = ConfigManager.getThemes();
    const shares = ShareManager.getShares();
    const activeShares = ShareManager.getActiveShares();

    res.send({
      host: sconfig.network.host,
      port: sconfig.network.osc_tcp_port,
      udp_clients: sconfig.network['udp_clients'],
      plugins: Object.keys(activePlugins),
      themes: themes,
      activeShares: activeShares,
      shares: Object.keys(shares),
    });
  });

  router.get('/log', (req, res) => {
    const logs = MonitorManager.getMonitorLogs();
    res.send(logs);
  });

  router.get('/status', async (req, res) => {
    const status = await MonitorManager.getSystemStatus();
    res.send(status);
  });

  return {
    local: router,
  };
}
