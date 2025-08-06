import { Router, Request, Response } from 'express';
import ModuleService from '../service/ModuleService';
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
