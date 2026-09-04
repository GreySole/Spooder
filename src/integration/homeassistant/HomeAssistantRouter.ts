import { Request, Response, Router } from 'express';
import ModuleService from '../../core/service/ModuleService';
import HomeAssistant from './homeassistant';
import { DEFAULT_DISCOVERY_PREFIX, DEFAULT_NODE_ID, DEFAULT_PORT } from './HomeAssistantTypes';

export default function getHomeAssistantRouter() {
  const router = Router();

  router.get('/get_connection_status', (req: Request, res: Response) => {
    const ha = ModuleService.getControlModule('homeassistant') as HomeAssistant;
    res.send({ connected: ha.connected });
  });

  // The saved password never leaves the server - a settings page can only tell whether one is
  // already on file, and submitting the form again with the field left blank keeps it.
  router.get('/get_settings', (req: Request, res: Response) => {
    const ha = ModuleService.getControlModule('homeassistant') as HomeAssistant;
    const { password, ...rest } = ha.settings;
    res.send({ ...rest, hasPassword: Boolean(password) });
  });

  router.post('/connect', async (req: Request, res: Response) => {
    const ha = ModuleService.getControlModule('homeassistant') as HomeAssistant;
    const body = req.body ?? {};

    const password = String(body.password ?? '') || ha.settings.password || '';
    const settings = {
      host: String(body.host ?? '').trim(),
      port: Number(body.port) || DEFAULT_PORT,
      username: String(body.username ?? '').trim(),
      password,
      useTls: Boolean(body.useTls),
      discoveryPrefix: String(body.discoveryPrefix ?? '').trim() || DEFAULT_DISCOVERY_PREFIX,
      nodeId: String(body.nodeId ?? '').trim() || DEFAULT_NODE_ID,
      deviceName: String(body.deviceName ?? '').trim() || 'Spooder',
    };

    const connected = await ha.connect(settings);
    if (body.remember === true) {
      ha.saveLogin(settings);
    }
    res.send({ status: connected ? 'ok' : 'error' });
  });

  router.post('/disconnect', async (req: Request, res: Response) => {
    const ha = ModuleService.getControlModule('homeassistant') as HomeAssistant;
    await ha.disconnect();
    res.send({ status: 'ok' });
  });

  return router;
}
