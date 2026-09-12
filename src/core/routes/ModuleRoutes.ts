import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import ModuleService from '../service/ModuleService';
import ModuleUIService from '../service/ModuleUIService';
import { KeyedObject } from '../../Types';

interface ModuleWidgetDescriptor {
  id: string;
  label: string;
  url: string;
}

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

  // The widgets each loaded module ships: small standalone pages for one of its own functions
  // (e.g. a Stream Manager panel) that can sit in a bare iframe. Declared in the module's own
  // package.json rather than tracked here, the same as the module UI's webui block, so
  // installing a module is all it takes to expose whatever widgets it shipped with.
  router.get('/widgets', (req: Request, res: Response) => {
    let moduleKeys: string[];
    try {
      moduleKeys = Object.keys({
        ...ModuleService.getStreamModules(),
        ...ModuleService.getCommunityModules(),
        ...ModuleService.getControlModules(),
      });
    } catch (e) {
      // Asked before any module registered - same case /loaded guards against.
      res.status(503).send({ error: 'Modules are still loading.' });
      return;
    }

    const widgetsByModule: { [moduleKey: string]: ModuleWidgetDescriptor[] } = {};

    for (const key of moduleKeys) {
      try {
        const manifestPath = path.join(__dirname, '../../integration', key, 'package.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const declared = manifest?.spooder_module?.widgets as
          | { id: string; label: string }[]
          | undefined;
        if (!declared?.length) {
          continue;
        }

        const widgetsDir = path.join(__dirname, '../../integration', key, 'widgets');
        const available = declared.filter((w) =>
          fs.existsSync(path.join(widgetsDir, w.id, 'index.html')),
        );
        if (available.length) {
          widgetsByModule[key] = available.map((w) => ({
            id: w.id,
            label: w.label,
            // Trailing slash so the browser hits express.static's index resolution directly
            // instead of taking its 302-to-add-a-slash detour first.
            url: `/widgets/${key}/${w.id}/`,
          }));
        }
      } catch (e) {
        // No manifest, no widgets block, or nothing built for this module - nothing to report.
      }
    }

    res.send(widgetsByModule);
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
