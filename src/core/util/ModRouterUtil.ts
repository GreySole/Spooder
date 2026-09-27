import { NextFunction, Request, Response, Router } from 'express';

/**
 * A router that exposes only some of another router's endpoints - the ones safe to hand a
 * moderator. A module's own router carries its whole API (a Twitch module can create and delete
 * channel point rewards), so a module lists the few endpoints its node inspectors and test
 * panels need, as 'METHOD /path', and gets back a router that answers those and nothing else.
 * Anything not listed falls through untouched.
 */
export function modSafeRouter(source: Router, safeEndpoints: string[]): Router {
  const safe = new Set(safeEndpoints.map((endpoint) => endpoint.toUpperCase()));
  const router = Router();
  router.use((req: Request, res: Response, next: NextFunction) => {
    if (safe.has(`${req.method} ${req.path}`.toUpperCase())) {
      source(req, res, next);
    } else {
      next();
    }
  });
  return router;
}
