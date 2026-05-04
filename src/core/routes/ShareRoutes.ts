import express from 'express';
import { registerExternalRoutes } from './shareRoutes/ShareExternalRoutes';
import { registerInternalRoutes } from './shareRoutes/ShareInternalRoutes';

export function ShareRoutes() {
  const router = express.Router();
  const publicRouter = express.Router();

  registerInternalRoutes(router);
  registerExternalRoutes(router, publicRouter);

  return {
    local: router,
    public: publicRouter,
  };
}
