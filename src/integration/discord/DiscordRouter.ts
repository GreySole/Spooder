import { Request, Response, Router } from 'express';
import Discord from './main.ts';
import ModuleService from 'src/core/service/ModuleService.ts';
import { userDir } from 'src/Types.ts';
import fs from 'fs';

export default function getDiscordRouters() {
  const router = Router();
  const publicRouter = Router();
  const discordModule = ModuleService.getCommunityModule('discord') as Discord;

  router.post('/saveDiscordConfig', async (req: Request, res: Response) => {
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
    let guilds = discordModule.getGuilds();
    res.send(guilds);
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
