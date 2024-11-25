import { Router } from 'express';
import ModuleService from '../service/ModuleService.ts';

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
}
