import express, { Request, Response } from 'express';
import { KeyedObject } from '../../../Types';
import { webJoin } from '../../util/PathUtil';

const pluginApi = {
  local: {
    get: {} as KeyedObject,
    post: {} as KeyedObject,
  },
  public: {
    get: {} as KeyedObject,
    post: {} as KeyedObject,
  },
};

export function registerPluginApi(
  context: any,
  router: 'local' | 'public',
  method: 'get' | 'post' | 'put' | 'delete',
  address: string,
  funct: (req: express.Request, res: express.Response) => void,
) {
  const realAddress = address.startsWith('/') ? address : `/${address}`;
  if (router === 'local') {
    if (method.toLowerCase() === 'get') {
      pluginApi.local.get[webJoin(context.dirname, realAddress)] = funct.bind(context);
    } else if (method.toLowerCase() === 'post') {
      pluginApi.local.post[webJoin(context.dirname, realAddress)] = funct.bind(context);
    }
  } else if (router === 'public') {
    if (method.toLowerCase() === 'get') {
      pluginApi.public.get[webJoin(context.dirname, realAddress)] = funct.bind(context);
    } else if (method.toLowerCase() === 'post') {
      pluginApi.public.post[webJoin(context.dirname, realAddress)] = funct.bind(context);
    }
  } else {
    throw new Error(`Unknown router: ${router}. There's only local and public routers.`);
  }
}

export function registerApiRoutes(router: express.Router, publicRouter: express.Router) {
  router.get('/api/*apiPath', (req: Request, res: Response) => {
    const apiPath = Array.isArray(req.params.apiPath)
      ? req.params.apiPath.join('/')
      : req.params.apiPath;
    if (pluginApi.local.get[apiPath]) {
      pluginApi.local.get[apiPath](req, res);
      return;
    }
    // Without this the handler falls through having sent nothing, leaving the caller's
    // request open until it times out rather than telling it the route does not exist.
    res.status(404).json({ error: `No plugin API route for ${apiPath}` });
  });

  router.post('/api/*apiPath', (req: Request, res: Response) => {
    const apiPath = Array.isArray(req.params.apiPath)
      ? req.params.apiPath.join('/')
      : req.params.apiPath;
    if (pluginApi.local.post[apiPath]) {
      pluginApi.local.post[apiPath](req, res);
      return;
    }
    // Without this the handler falls through having sent nothing, leaving the caller's
    // request open until it times out rather than telling it the route does not exist.
    res.status(404).json({ error: `No plugin API route for ${apiPath}` });
  });

  publicRouter.get('/api/*apiPath', (req: Request, res: Response) => {
    const apiPath = Array.isArray(req.params.apiPath)
      ? req.params.apiPath.join('/')
      : req.params.apiPath;
    if (pluginApi.public.get[apiPath]) {
      pluginApi.public.get[apiPath](req, res);
      return;
    }
    // Without this the handler falls through having sent nothing, leaving the caller's
    // request open until it times out rather than telling it the route does not exist.
    res.status(404).json({ error: `No plugin API route for ${apiPath}` });
  });

  publicRouter.post('/api/*apiPath', (req: Request, res: Response) => {
    const apiPath = Array.isArray(req.params.apiPath)
      ? req.params.apiPath.join('/')
      : req.params.apiPath;
    if (pluginApi.public.post[apiPath]) {
      pluginApi.public.post[apiPath](req, res);
      return;
    }
    // Without this the handler falls through having sent nothing, leaving the caller's
    // request open until it times out rather than telling it the route does not exist.
    res.status(404).json({ error: `No plugin API route for ${apiPath}` });
  });
}
