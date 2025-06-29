import { Router } from 'express';
import ModuleService from '../service/ModuleService.ts';
import { KeyedObject } from 'src/Types.ts';

export default function ModuleRoutes() {
  const router = Router();
  const publicRouter = Router();

  router.get('/restart_chat', (req, res) => {
    const modName = req.query.module as string;

    if (modName) {
      const mod = ModuleService.findModule(modName);
      if (mod) {
      }
    }
  });

  router.get('/get_response_handlers', (req, res) => {
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
