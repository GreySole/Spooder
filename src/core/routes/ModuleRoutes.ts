import { Router, Request, Response } from 'express';
import ModuleService from '../service/ModuleService';
import ModuleUIService from '../service/ModuleUIService';
import { KeyedObject } from '../../Types';

export default function ModuleRoutes() {
  const router = Router();
  const publicRouter = Router();

  router.get('/is_module_loaded', (req: Request, res: Response) => {
    const modName = req.query.module as string;
    const isLoaded = ModuleService.findModule(modName) !== undefined;
    res.send({ isLoaded });
  });

  router.get('/restart_chat', (req: Request, res: Response) => {
    const modName = req.query.module as string;

    if (modName) {
      const mod = ModuleService.findModule(modName);
      if (mod) {
      }
    }
  });

  // The module UIs installed on this Spooder, as federation remotes the WebUI can register.
  // Its loader calls this on boot; an empty list simply means no module tabs.
  router.get('/ui', (req: Request, res: Response) => {
    res.send(ModuleUIService.getInstalled());
  });

  // Which modules this Spooder actually has loaded. The WebUI needs it because a module's
  // frontend can be compiled into the bundle while its backend is not installed - uninstalling
  // the backend cannot remove a tab that is baked into the page. Without this the tab stays,
  // and every call it makes 404s.
  router.get('/loaded', (req: Request, res: Response) => {
    try {
      res.send(
        Object.keys({
          ...ModuleService.getStreamModules(),
          ...ModuleService.getCommunityModules(),
          ...ModuleService.getControlModules(),
        }),
      );
    } catch (e) {
      // Asked before any module registered. An empty list would hide every tab, so say
      // nothing is known instead and let the WebUI keep showing what it has.
      res.status(503).send({ error: 'Modules are still loading.' });
    }
  });

  router.get('/get_response_handlers', (req: Request, res: Response) => {
    const handlers = ModuleService.getResponseHandlers();

    const returnedHandlers = {} as KeyedObject;

    for (let h in handlers) {
      returnedHandlers[h] = handlers[h].descriptions;
    }

    res.send(returnedHandlers);
  });

  return {
    local: router,
    public: publicRouter,
  };
}
