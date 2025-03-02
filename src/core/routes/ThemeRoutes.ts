import { Request, Response, Router } from 'express';
import ConfigService from '../service/ConfigService';

export function ThemeRoutes() {
  const router = Router();
  const publicRouter = Router();

  function getMainTheme(req: Request, res: Response) {
    const themes = ConfigService.getThemes();
    res.send(themes.webui);
  }

  function getModTheme(req: Request, res: Response) {
    if (!req.query.user) {
      res.send('No username provided');
    }
    const themes = ConfigService.getThemes();
    res.send(themes.modui[req.body.user]);
  }

  function getCustomSpooder(req: Request, res: Response) {
    const themes = ConfigService.getThemes();
    res.send(themes.spooderpet);
  }

  router.get('/main_theme', getMainTheme);
  publicRouter.get('/main_theme', getMainTheme);

  router.get('/mod_theme', getModTheme);
  publicRouter.get('/mod_theme', getModTheme);

  router.get('/custom_spooder', getCustomSpooder);
  publicRouter.get('/custom_spooder', getCustomSpooder);

  return { local: router, public: publicRouter };
}
