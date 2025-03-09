import { Request, Response, Router } from 'express';
import ConfigService from '../service/ConfigService';
import UserService from '../service/UserService';
import express from 'express';

export function ThemeRoutes() {
  const router = Router();
  router.use(express.json());
  const publicRouter = Router();

  function getMainTheme(req: Request, res: Response) {
    const themes = ConfigService.getThemes();
    res.send(themes.webui);
  }

  function saveMainTheme(req: Request, res: Response) {
    const themes = ConfigService.getThemes();
    themes.webui = req.body;
    ConfigService.saveThemes(themes);
    res.send({ status: 'ok' });
  }

  function getModTheme(req: Request, res: Response) {
    const accessCookie = req.cookies['access'];
    const modUser = UserService.getActiveUserFromCookie(accessCookie);
    const themes = ConfigService.getThemes();
    res.send(modUser ? themes.modui[modUser] : themes.webui);
  }

  function getCustomSpooder(req: Request, res: Response) {
    const themes = ConfigService.getThemes();
    res.send(themes.spooderpet);
  }

  function saveCustomSpooder(req: Request, res: Response) {
    const themes = ConfigService.getThemes();
    themes.spooderpet = req.body;
    ConfigService.saveThemes(themes);
    res.send({ status: 'ok' });
  }

  router.post('/save_main_theme', saveMainTheme);
  router.post('/save_custom_spooder', saveCustomSpooder);

  router.get('/main_theme', getMainTheme);
  publicRouter.get('/main_theme', getMainTheme);

  router.get('/mod_theme', getModTheme);
  publicRouter.get('/mod_theme', getModTheme);

  router.get('/custom_spooder', getCustomSpooder);
  publicRouter.get('/custom_spooder', getCustomSpooder);

  return { local: router, public: publicRouter };
}
