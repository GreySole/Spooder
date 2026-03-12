import express, { Request, Response } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { KeyedObject, userDir } from '../../../Types';
import { webLog } from '../../Logging';
import ConfigService from '../../service/ConfigService';
import OSCService from '../../service/OSCService';
import PluginService from '../../service/PluginService';
import ShareService from '../../service/ShareService';
import { isLocal, WebService } from '../../service/WebService';
import { webJoin } from '../../util/PathUtil';

export function registerGetRoutes(router: express.Router, publicRouter: express.Router) {
  async function pluginGet(req: Request, res: Response) {
    const sconfig = ConfigService.getConfig();
    const pluginName = req.query.plugin as string;
    const shareKey = req.query.key as string;
    let pluginSettings = null;

    let shareInfo = null;
    try {
      let settingsPath = path.join(userDir, 'plugins', pluginName, 'settings.json');
      if (shareKey) {
        const share = ShareService.getShareByKey(shareKey);
        const shareSettingsPath = path.join(
          userDir,
          'plugins',
          pluginName,
          '_share',
          `${share?.shareId}.json`,
        );
        if (fs.existsSync(shareSettingsPath)) {
          settingsPath = shareSettingsPath;
        }
        shareInfo = share?.share;
      }
      const thisPlugin = fs.readFileSync(settingsPath, {
        encoding: 'utf8',
      });
      pluginSettings = JSON.parse(thisPlugin);
    } catch (e) {
      webLog(pluginName + ' has no settings');
    }

    let oscInfo = null;

    if (isLocal(req)) {
      oscInfo = {
        host: sconfig.network.host,
        name: pluginName,
        port: sconfig.network.host_port,
        external: false,
        settings: pluginSettings,
        shareInfo,
      };
    } else {
      oscInfo = {
        host: WebService.getPublicHTTPUrl(),
        name: pluginName,
        port: null,
        external: true,
        settings: pluginSettings,
        shareInfo,
      };
    }

    res.send({ express: JSON.stringify(oscInfo) });
  }

  router.get('/get', pluginGet);
  publicRouter.get('/get', pluginGet);

  router.get('/get_list', async (req: Request, res: Response) => {
    const activePlugins = PluginService.getActivePlugins();
    const pluginPacks = {} as KeyedObject;
    for (let a in activePlugins) {
      const thisPlugin = activePlugins[a];

      pluginPacks[a] = {
        name: thisPlugin.name ? thisPlugin.name : a,
        version: thisPlugin.version ? thisPlugin.version : 'Unknown Version',
        author: thisPlugin.author ? thisPlugin.author : 'Unknown Author',
        description: thisPlugin.description ? thisPlugin.description : '',
        dependencies: thisPlugin.dependencies ? thisPlugin.dependencies : {},
        status: thisPlugin.status,
        assetBrowserPath: '/',
        assetPath: webJoin('assets', a),
        hasOverlay: thisPlugin.hasOverlay,
        hasUtility: thisPlugin.hasUtility,
        hasPublic: thisPlugin.hasPublic,
        pluginMode: thisPlugin.pluginMode,
        devMode: thisPlugin.devMode,
      };
    }

    res.send(JSON.stringify(pluginPacks));
  });

  router.get('/get_plugin_settings', async (req: Request, res: Response) => {
    const pluginName = req.query.plugin as string;
    try {
      const settings = PluginService.getPluginSettings(pluginName);
      res.send(settings);
    } catch (e) {
      res.send({ status: 'error', message: e });
    }
  });

  router.get('/get_plugin_settings_form', async (req: Request, res: Response) => {
    const pluginName = req.query.plugin as string;
    try {
      const form = PluginService.getPluginSettingsForm(pluginName);
      res.send(form);
    } catch (e) {
      res.send({ status: 'error', message: e });
    }
  });

  router.get('/get_plugin_events_form', async (req: Request, res: Response) => {
    const pluginName = req.query.plugin as string;
    try {
      const eventsForm = path.join(userDir, 'plugins', pluginName, 'events-form.json');
      const thisPluginForm =
        fs.existsSync(eventsForm) == true
          ? JSON.parse(fs.readFileSync(eventsForm, { encoding: 'utf8' }))
          : null;
      res.send(thisPluginForm);
    } catch (e) {
      res.send({ status: 'error', message: e });
    }
  });

  publicRouter.get('/public', (req: Request, res: Response) => {
    const platform = req.cookies.public_module;
    const accessToken = req.cookies.access_token;
    if (!platform || !accessToken) {
      res.status(401).send({ status: 'error', message: 'Unauthorized' });
      return;
    }
    const activePlugins = PluginService.getActivePlugins();
    let publicPlugins: string[] = [];
    for (let p in activePlugins) {
      if (activePlugins[p].hasPublic) {
        publicPlugins.push(p);
      }
    }
    res.send({ data: publicPlugins });
  });

  router.get('/public', (req: Request, res: Response) => {
    const activePlugins = PluginService.getActivePlugins();
    let publicPlugins: string[] = [];
    for (let p in activePlugins) {
      if (activePlugins[p].hasPublic) {
        publicPlugins.push(p);
      }
    }
    res.send({ data: publicPlugins });
  });

  router.get('/get_plugin/:pluginName', async (req: Request, res: Response) => {
    let plugin = {};
    let a = req.params.pluginName as string;
    let thisPlugin = fs.readFileSync(userDir + 's/' + a + '/settings.json', {
      encoding: 'utf8',
    });
    let thisPluginIcon = userDir + '/icons/' + a + '.png';

    let assetDir = path.join(userDir, 'web', 'overlay', a, 'assets');

    let thisPluginAssets = fs.existsSync(assetDir) == true ? fs.readdirSync(assetDir) : null;

    plugin = {
      settings: JSON.parse(thisPlugin),
      assets: thisPluginAssets,
      udpServers: OSCService.getUdpServers(),
      icon: thisPluginIcon,
    };

    res.send(plugin);
  });
}
