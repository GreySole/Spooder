import express, { Request, Response } from 'express';
import { networkInterfaces } from 'os';
import fs from 'fs';
import { backendDir, frontendDir, PlatformType } from '../../Types.ts';
import ConfigManager from '../manager/ConfigManager.ts';
import ModuleManager from '../manager/ModuleManager.ts';
import PluginManager from '../manager/PluginManager.ts';
import { WebManager } from '../manager/WebManager.ts';
import ShareManager from '../manager/ShareManager.ts';
import Discord from '../../integration/discord/main.ts';
import STwitch from '../../integration/twitch/main.ts';

const nets = networkInterfaces();

export default class Initializer {
  constructor() {
    new ConfigManager();
    const sconfig = ConfigManager.getConfig();
    const webUI = new WebManager();
    new PluginManager();
    new ShareManager();

    ModuleManager.registerIntegrationModule('twitch', PlatformType.stream);
    ModuleManager.registerIntegrationModule('discord', PlatformType.community);

    webUI.router?.get('/init', async (req, res) => {
      const twitch = ModuleManager.getStreamModule('twitch') as STwitch;
      const discord = ModuleManager.getCommunityModule('discord') as Discord;
      const sconfig = fs.existsSync(backendDir + '/settings/config.json')
        ? JSON.parse(fs.readFileSync(backendDir + '/settings/config.json', { encoding: 'utf-8' }))
        : null;
      const themes = fs.existsSync(backendDir + '/settings/themes.json')
        ? JSON.parse(fs.readFileSync(backendDir + '/settings/themes.json', { encoding: 'utf-8' }))
        : null;
      let twitchBotUser = null;
      let twitchBroadcasterUser = null;
      let discordUser = null;
      if (twitch.oauth?.['token'] != null) {
        if (twitch.loggedIn == false) {
          await twitch.autoLogin();
        }
      }
      if (twitch.loggedIn == true) {
        twitchBotUser = await twitch.api.getUserInfo(twitch.api.botUsername);
        twitchBroadcasterUser = await twitch.api.getUserInfo(twitch.api.homeChannel);
      }

      if (discord.config?.['token'] != '') {
        if (discord.loggedIn == false) {
          await discord.autoLogin();
        }
      }
      if (discord.loggedIn == true) {
        let masterUser = await discord.findUser(discord.config.master);
        discordUser = {
          botUser: {
            username: discord.client?.user?.username,
            profilepic: discord.client?.user?.displayAvatarURL(),
          },
          master: { username: masterUser.username, profilepic: masterUser.displayAvatarURL() },
        };
      }

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
        twitch: twitch.oauth ?? {},
        twitch_user: { botUser: twitchBotUser, broadcasterUser: twitchBroadcasterUser },
        discord: discord.config ?? {},
        discord_user: discordUser,
        themes: themes,
      });
    });

    webUI.router?.post('/save_twitch', async (req: Request, res: Response) => {
      const twitch = ModuleManager.getStreamModule('twitch') as STwitch;
      let newTwitch = req.body;
      twitch.oauth = newTwitch;
      fs.writeFileSync(backendDir + '/settings/twitch.json', JSON.stringify(newTwitch));
      res.send({ status: 'ok' });
    });

    webUI.router?.post('/save_config', async (req: Request, res: Response) => {
      let newSettings = req.body;
      var newMod = {
        trusted_users: {},
        trusted_users_pw: {},
      };
      ConfigManager.saveConfig(newSettings);
      res.send({ status: 'ok' });
    });

    webUI.router?.post('/save_themes', async (req: Request, res: Response) => {
      let newSettings = req.body;
      ConfigManager.saveThemes(newSettings);
      res.send({ status: 'ok' });
    });

    console.log('Init UI ready! You must open this on localhost to set up Twitch.');
  }
}
