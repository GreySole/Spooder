import { Request, Response, Router } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { webLog } from '../Logging';

const changelogPath = path.join('./', 'CHANGELOG.md');

export function ChangelogRoutes() {
  const router = Router();
  const publicRouter = Router();

  function getChangelog(req: Request, res: Response) {
    try {
      const changelog = fs.readFileSync(changelogPath, { encoding: 'utf8' });
      res.type('text/markdown').send(changelog);
    } catch (e) {
      webLog('Failed to read CHANGELOG.md', e);
      res.status(404).send('Changelog not found');
    }
  }

  router.get('/', getChangelog);
  publicRouter.get('/', getChangelog);

  return { local: router, public: publicRouter };
}
