import { Request, Response, Router } from 'express';
import fs from 'fs';
import ModuleService from '../../core/service/ModuleService';
import { userDir } from '../../Types';
import Discord from './discord';

export default function getDiscordRouters() {
  const router = Router();
  const publicRouter = Router();
  const discordModule = ModuleService.getCommunityModule('discord') as Discord;

  router.post('/save_discord_config', async (req: Request, res: Response) => {
    Object.assign(discordModule.config, req.body);
    fs.writeFile(
      userDir + '/settings/discord.json',
      JSON.stringify(discordModule.config),
      'utf-8',
      () => {
        if (discordModule.loggedIn == false && req.body.token != null && req.body.token != '') {
          discordModule.autoLogin();
          res.send({ status: 'SAVED! Logging into Discord...' });
        } else {
          res.send({ status: 'SAVE SUCCESS' });
        }
      },
    );
  });

  router.get('/get_guilds', async (req: Request, res: Response) => {
    if (discordModule.loggedIn === false) {
      res.send({ error: 'nologin' });
      return;
    }
    const guilds = discordModule.api.getGuilds();
    res.send(guilds);
  });

  router.get('/get_roles', async (req: Request, res: Response) => {
    if (discordModule.loggedIn === false) {
      res.send({ error: 'nologin' });
      return;
    }
    const guild = req.query.guild as string;
    const roles = discordModule.api.getRoles(guild);
    res.send(roles);
  });

  router.get('/config', async (req: Request, res: Response) => {
    res.send(discordModule.config);
  });

  router.get('/user', async (req: Request, res: Response) => {
    let user = await discordModule.client?.users.fetch(req.query.userid as string);
    if (user != null) {
      res.send({ userInfo: user });
    }
  });

  return {
    baseUrl: '/discord',
    router,
    publicRouter,
  };
}
