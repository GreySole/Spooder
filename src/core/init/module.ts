import express, { Request, Response } from 'express';
import { networkInterfaces } from 'os';
import fs from 'fs';
import { userDir, frontendDir, PlatformType } from '../../Types.ts';
import ConfigService from '../service/ConfigService.ts';
import ModuleService from '../service/ModuleService.ts';
import PluginService from '../service/PluginService.ts';
import { WebService } from '../service/WebService.ts';
import ShareService from '../service/ShareService.ts';
import Discord from '../../integration/discord/main.ts';
import Twitch from '../../integration/twitch/main.ts';

const nets = networkInterfaces();

export default class Initializer {
  constructor() {
    new ConfigService();
    const sconfig = ConfigService.getConfig();
    const webUI = new WebService();
    new PluginService();
    new ShareService();

    webUI.router?.get('/init', async (req, res) => {
      const sconfig = fs.existsSync(userDir + '/settings/config.json')
        ? JSON.parse(fs.readFileSync(userDir + '/settings/config.json', { encoding: 'utf-8' }))
        : null;
      const themes = fs.existsSync(userDir + '/settings/themes.json')
        ? JSON.parse(fs.readFileSync(userDir + '/settings/themes.json', { encoding: 'utf-8' }))
        : null;

      const results = Object.create(null); // Or just '{}', an empty object

      if (nets !== undefined) {
        for (const name of Object.keys(nets)) {
          for (const net of nets[name]!) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            // 'IPv4' is in Node <= 17, from 18 it's a number 4 or 6
            const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4;
            if (net.family === familyV4Value && !net.internal) {
              if (!results[name]) {
                results[name] = [];
              }
              results[name].push(net.address);
            }
          }
        }
      }

      res.send({
        config: sconfig,
        nets: results,
        themes: themes,
      });
    });

    webUI.router?.post('/save_config', async (req: Request, res: Response) => {
      let newSettings = req.body;
      ConfigService.saveConfig(newSettings);
      res.send({ status: 'ok' });
    });

    webUI.router?.post('/save_themes', async (req: Request, res: Response) => {
      let newSettings = req.body;
      ConfigService.saveThemes(newSettings);
      res.send({ status: 'ok' });
    });

    console.log('Init UI ready! You must open this on localhost to set up Twitch.');
  }
}
