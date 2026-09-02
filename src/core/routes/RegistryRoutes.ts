import { Request, Response, Router } from 'express';
import ModuleService from '../service/ModuleService';
import ModuleUIService from '../service/ModuleUIService';
import PluginService from '../service/PluginService';
import ModuleInstallService from '../service/ModuleInstallService';
import PluginRepoService from '../service/PluginRepoService';
import RegistryService, { RegistryArtifact, SourcedEntry } from '../service/RegistryService';
import { getRestartCapability, requestRestart } from '../util/AppUtil';

// What the Modules tab reads. The catalogue on its own is not enough to draw a card - whether
// something is already installed, and whether this Spooder can run it, decide what the button
// says - so that is resolved here rather than making the frontend ask three more questions.
// A module installs from source, so the artifact is the tag's zipball rather than a built
// asset. GitHub serves one for every tag, which means a module repo needs no release workflow
// of its own to be installable.
async function resolveSourceZip(artifact: RegistryArtifact, track: string): Promise<string> {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'Spooder' };
  const tag = track === 'pinned' && artifact.version ? `tags/v${artifact.version}` : 'latest';

  const response = await fetch(
    `https://api.github.com/repos/${artifact.repo}/releases/${tag}`,
    { headers },
  );
  if (!response.ok) {
    throw new Error(
      track === 'pinned'
        ? `${artifact.repo} has no release tagged v${artifact.version}.`
        : `${artifact.repo} has no published release, so there is no version to install.`,
    );
  }

  const release = (await response.json()) as {
    zipball_url?: string;
    assets?: { name: string; browser_download_url: string }[];
  };

  // The uploaded asset, not GitHub's generated tag archive. This matters for more than tidiness:
  // the registry's sha256 is the hash of the asset a reviewer downloaded, and the two files are
  // not the same bytes - so taking the archive here would fail every pinned checksum.
  const named = artifact.asset
    ? release.assets?.find((a) => a.name === artifact.asset)
    : release.assets?.[0];
  if (named) {
    return named.browser_download_url;
  }

  // No asset to be had. Fine for an unpinned entry, which has no hash to satisfy anyway;
  // for a pinned one it means the release no longer carries the file the registry named.
  if (track === 'pinned') {
    throw new Error(
      `${artifact.repo}'s v${artifact.version} release no longer has '${artifact.asset}'.`,
    );
  }
  if (!release.zipball_url) {
    throw new Error(`${artifact.repo}'s latest release has no source archive.`);
  }
  return release.zipball_url;
}

export default function RegistryRoutes() {
  const router = Router();
  const publicRouter = Router();

  function isInstalled(entry: SourcedEntry): boolean {
    if (entry.kind === 'plugin') {
      return PluginService.getActivePlugins()[entry.id] !== undefined;
    }
    // A module counts as installed once its backend half is loaded. Its UI arriving separately
    // is a state the tab shows, not a different kind of installation.
    return ModuleService.findModule(entry.id) !== undefined;
  }

  function describe(entry: SourcedEntry, spooderVersion: string) {
    const uiInstalled = ModuleUIService.getInstalled().some((ui) => ui.key === entry.id);
    return {
      ...entry,
      compatible: RegistryService.isCompatible(entry, spooderVersion),
      installed: isInstalled(entry),
      // Only meaningful for modules, and only useful because a module can have its backend
      // without its tab - which otherwise looks like a broken install rather than a partial one.
      webuiInstalled: entry.kind === 'module' ? uiInstalled : undefined,
      webuiVersion: entry.kind === 'module' ? ModuleUIService.getLocalVersion(entry.id) : undefined,
    };
  }

  async function sendCatalogue(res: Response, force: boolean) {
    const catalogue = await RegistryService.getCatalogue(force);
    const spooderVersion = RegistryService.getSpooderVersion();
    res.send({
      spooderVersion,
      // Per registry: when it was last read, how many entries it contributed, and why it
      // failed if it did. One unreachable registry does not empty the tab.
      sources: catalogue.sources,
      // Ids more than one registry offers, and which one won.
      duplicates: catalogue.duplicates,
      entries: catalogue.entries.map((entry) => describe(entry, spooderVersion)),
    });
  }

  router.get('/catalog', async (req: Request, res: Response) => {
    try {
      await sendCatalogue(res, false);
    } catch (e: any) {
      res.status(500).send({ error: e.message ?? 'Could not read the registries' });
    }
  });

  router.post('/refresh', async (req: Request, res: Response) => {
    try {
      await sendCatalogue(res, true);
    } catch (e: any) {
      res.status(500).send({ error: e.message ?? 'Could not refresh the registries' });
    }
  });

  // Installing by id rather than by URL: the catalogue already knows the repo, the version a
  // reviewer approved, and its hash. Resolving that here means the browser never gets to say
  // which artifact to fetch.
  router.post('/install', async (req: Request, res: Response) => {
    const id = String(req.body?.id ?? '');
    try {
      const catalogue = await RegistryService.getCatalogue(false);
      const entry = catalogue.entries.find((e) => e.id === id);
      if (!entry) {
        res.status(404).send({ error: `'${id}' is not in any registry you have turned on.` });
        return;
      }

      const spooderVersion = RegistryService.getSpooderVersion();
      if (!RegistryService.isCompatible(entry, spooderVersion)) {
        res.status(400).send({
          error: `${entry.name} needs Spooder ${entry.spooder}, and this is ${spooderVersion}.`,
        });
        return;
      }

      if (entry.kind === 'module') {
        if (!entry.server) {
          res.status(400).send({ error: `${entry.name} has no backend to install.` });
          return;
        }
        // Source, not a bundle: the module is compiled here by the build Spooder already has.
        const zipUrl = await resolveSourceZip(entry.server, entry.track);
        const result = await ModuleInstallService.install({
          name: entry.id,
          zipUrl,
          version: entry.server.version ?? null,
          sha256: entry.track === 'pinned' ? (entry.server.sha256 ?? null) : null,
        });
        res.send({
          status: 'ok',
          ...result,
          // How the restart will happen, so the page can say "reconnecting" or "start Spooder
          // again" rather than guessing.
          restartVia: getRestartCapability(),
        });
        return;
      }

      if (!entry.plugin) {
        res.status(400).send({ error: `${entry.name} has no plugin artifact to install.` });
        return;
      }

      const result = await PluginRepoService.installFromUrl({
        url: `https://github.com/${entry.plugin.repo}`,
        mode: 'release',
        // Only a pinned entry has a reviewed hash; 'latest' is the trade that setting makes.
        sha256: entry.track === 'pinned' ? (entry.plugin.sha256 ?? null) : null,
      });
      res.send({ status: 'ok', ...result });
    } catch (e: any) {
      res.status(400).send({ error: e.message ?? 'Install failed.' });
    }
  });

  // Removing a module is the same shape of operation as installing one - it changes what the
  // build compiles, so it also needs a restart to take effect.
  router.post('/uninstall', async (req: Request, res: Response) => {
    const id = String(req.body?.id ?? '');
    try {
      const result = await ModuleInstallService.remove(id);
      res.send({ status: 'ok', ...result, restartVia: getRestartCapability() });
    } catch (e: any) {
      res.status(400).send({ error: e.message ?? 'Could not remove that module.' });
    }
  });

  // Split from install on purpose: the page asks for the restart once it has shown the user
  // what happened, rather than the process vanishing mid-response.
  router.post('/restart', (req: Request, res: Response) => {
    const reason = String(req.body?.reason ?? 'finish installing');
    const result = requestRestart(reason);
    res.send({ status: 'ok', ...result });
  });

  router.get('/restart_capability', (req: Request, res: Response) => {
    res.send({ via: getRestartCapability(), busy: ModuleInstallService.isBusy() });
  });

  router.get('/sources', (req: Request, res: Response) => {
    res.send(RegistryService.getSources());
  });

  // Adding a registry is trusting whoever curates it, so the errors here are written to be
  // read by the person pasting the URL rather than logged and swallowed.
  router.post('/sources', async (req: Request, res: Response) => {
    try {
      const source = RegistryService.addSource(req.body?.url ?? '', req.body?.name);
      res.send({ status: 'ok', source });
    } catch (e: any) {
      res.status(400).send({ error: e.message ?? 'Could not add that registry.' });
    }
  });

  // The id travels in the body rather than the path: a source id is 'github:owner/name', and
  // an encoded slash in a route param is the kind of thing that works until some proxy in
  // front of Spooder decides otherwise.
  router.post('/sources/remove', (req: Request, res: Response) => {
    try {
      RegistryService.removeSource(String(req.body?.id ?? ''));
      res.send({ status: 'ok' });
    } catch (e: any) {
      res.status(400).send({ error: e.message ?? 'Could not remove that registry.' });
    }
  });

  router.post('/sources/enabled', (req: Request, res: Response) => {
    try {
      RegistryService.setSourceEnabled(String(req.body?.id ?? ''), req.body?.enabled !== false);
      res.send({ status: 'ok' });
    } catch (e: any) {
      res.status(400).send({ error: e.message ?? 'Could not change that registry.' });
    }
  });

  return { local: router, public: publicRouter };
}
