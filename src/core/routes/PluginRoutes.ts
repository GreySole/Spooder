import express from 'express';
import multer from 'multer';
import path from 'path';
import { userDir } from '../../Types';
import { registerApiRoutes, registerPluginApi } from './pluginRoutes/PluginApiRoutes';
import { registerAssetRoutes } from './pluginRoutes/PluginAssetRoutes';
import { registerGetRoutes } from './pluginRoutes/PluginGetRoutes';
import { registerManageRoutes } from './pluginRoutes/PluginManageRoutes';

export { registerPluginApi };

export function PluginRoutes() {
  const router = express.Router();
  const publicRouter = express.Router();

  const tempStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(userDir, 'tmp', 'multer'));
    },
  });
  const fileUpload = multer({ storage: tempStorage });

  router.use('/install_plugin', fileUpload.single('file'));
  router.use('/upload_plugin_asset', fileUpload.array('files'));
  router.use('/upload_plugin_icon', fileUpload.single('file'));

  registerGetRoutes(router, publicRouter);
  registerManageRoutes(router);
  registerAssetRoutes(router);
  registerApiRoutes(router, publicRouter);

  return {
    local: router,
    public: publicRouter,
  };
}
