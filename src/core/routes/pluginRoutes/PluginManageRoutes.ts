import AdmZip from 'adm-zip';
import express, { Request, Response } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { userDir } from '../../../Types';
import { webLog } from '../../Logging';
import OSCService from '../../service/OSCService';
import PluginRepoService, { PluginRepoMode } from '../../service/PluginRepoService';
import PluginService from '../../service/PluginService';

export function registerManageRoutes(router: express.Router) {
  router.post('/create_plugin', async (req: Request, res: Response) => {
    const pluginName = req.body.pluginName;
    const author = req.body.author;
    const description = req.body.description;
    const typescript = req.body.typescript;
    const pages = req.body.pages;
    const pluginDirName = req.body.internalName;

    const options = {
      createInfo: {
        name: pluginDirName,
        display_name: pluginName,
        author: author,
        description: description,
      },
      ...pages,
    };

    const pluginPath = path.join(userDir, 'tmp', pluginDirName);

    if (!fs.existsSync(pluginPath)) {
      fs.mkdirSync(pluginPath, { recursive: true });
    } else {
      fs.rmSync(pluginPath, { recursive: true });
    }

    const sampleURL = typescript
      ? 'https://api.github.com/repos/greysole/Spooder-Sample-Plugin/zipball/0.5.0-dev-ts'
      : 'https://api.github.com/repos/greysole/Spooder-Sample-Plugin/zipball/0.5.0-dev-js';

    fetch(sampleURL)
      .then((response) => response.arrayBuffer())
      .then(async (data) => {
        const tempDir = path.join(userDir, 'tmp', pluginDirName);
        const tempFile = path.join(userDir, 'tmp', pluginDirName, pluginDirName + '.zip');
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true });
        }

        fs.mkdirSync(tempDir, { recursive: true });
        fs.writeFileSync(tempFile, Buffer.from(data));

        let zip = new AdmZip(tempFile);
        zip.extractEntryTo(zip.getEntries()[0], tempDir);

        const fileDir = path.join(tempDir, zip.getEntries()[0].entryName);
        const tempOverlayDir = path.join(fileDir, 'overlay');
        const tempUtilityDir = path.join(fileDir, 'utility');

        // Copy the overlay as utility since they're the same files
        if (pages.utility) {
          if (fs.existsSync(tempOverlayDir)) {
            await fs.copy(tempOverlayDir, tempUtilityDir);
          }
        }

        const files = fs.readdirSync(fileDir);

        for (const file of files) {
          const currentFilePath = path.join(fileDir, file);
          const newFilePath = path.join(tempDir, file);

          fs.renameSync(currentFilePath, newFilePath);
        }

        fs.rmSync(tempFile);
        fs.rmdirSync(path.join(tempDir, zip.getEntries()[0].entryName));

        res.send({
          status: 'OK',
          pluginName: pluginName,
        });
        await PluginService.installPluginFromTemp(pluginDirName, options);
      });
  });

  router.post('/install_plugin', async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        webLog('NO FILES FOUND');
        res.send({
          status: false,
          message: 'No file uploaded',
        });
      } else {
        let pluginZip = req.file as Express.Multer.File;
        let pluginDirName = pluginZip.originalname.replace('.zip', '');

        let tempDir = path.join(userDir, 'tmp', pluginDirName);
        if (fs.existsSync(tempDir)) {
          await fs.rm(tempDir, { recursive: true });
        }

        fs.mkdirSync(tempDir, { recursive: true });

        let tempFile = path.join(userDir, 'tmp', pluginDirName, pluginZip.originalname);
        //Cleanup before install
        if (fs.existsSync(tempFile)) {
          fs.rmSync(tempFile);
        }

        OSCService.sendToTCP('/spooder/plugin/install/progress', {
          pluginName: pluginDirName,
          status: 'progress',
          message: 'Extracting...',
        });
        //Start installing
        await fs.move(pluginZip.path, tempFile, {
          overwrite: true,
        });
        webLog('EXTRACT ZIP');
        res.send({
          status: true,
          message: 'File Upload Success',
          plugin: pluginDirName,
        });
        let zip = new AdmZip(tempFile);
        zip.extractAllTo(tempDir);
        fs.rm(tempFile);
        await PluginService.installPluginFromTemp(pluginDirName);
      }
    } catch (e) {
      console.error(e);
    }
  });

  // Installs (or reinstalls over the top of) a plugin straight from its Git repo.
  // Unlike /install_plugin this waits for the whole install so failures come back as a
  // real error - progress still streams over OSC for the UI to follow.
  router.post('/install_plugin_from_repo', async (req: Request, res: Response) => {
    const url = req.body.url as string;
    const mode = req.body.mode as PluginRepoMode | undefined;
    const branch = req.body.branch as string | undefined;

    try {
      const result = await PluginRepoService.installFromUrl({ url, mode, branch });
      res.send({ status: 'ok', ...result });
    } catch (e: any) {
      webLog('Plugin repo install failed:', e.message ?? e);
      OSCService.sendToTCP('/spooder/plugin/install/complete', {
        pluginName: url,
        status: 'failed',
        message: e.message ?? 'Install failed',
      });
      res.status(400).send({ status: 'error', message: e.message ?? 'Install failed' });
    }
  });

  router.post('/update_plugin_from_repo', async (req: Request, res: Response) => {
    const pluginName = req.body.pluginName as string;
    try {
      const result = await PluginRepoService.update(pluginName);
      res.send({ status: 'ok', ...result });
    } catch (e: any) {
      webLog(`Plugin update failed for ${pluginName}:`, e.message ?? e);
      OSCService.sendToTCP('/spooder/plugin/install/complete', {
        pluginName,
        status: 'failed',
        message: e.message ?? 'Update failed',
      });
      res.status(400).send({ status: 'error', message: e.message ?? 'Update failed' });
    }
  });

  // Swaps a tracked plugin between the prebuilt release and a source checkout. This
  // reinstalls the plugin from the repo, so it doubles as "give me the source to hack on".
  router.post('/set_plugin_repo_mode', async (req: Request, res: Response) => {
    const pluginName = req.body.pluginName as string;
    const mode = req.body.mode as PluginRepoMode;
    const branch = req.body.branch as string | undefined;

    if (mode !== 'release' && mode !== 'source') {
      res.status(400).send({ status: 'error', message: "Mode must be 'release' or 'source'" });
      return;
    }

    try {
      const result = await PluginRepoService.setMode(pluginName, mode, branch);
      res.send({ status: 'ok', ...result });
    } catch (e: any) {
      webLog(`Failed to switch ${pluginName} to ${mode}:`, e.message ?? e);
      res.status(400).send({ status: 'error', message: e.message ?? 'Mode switch failed' });
    }
  });

  router.get('/reinstall_plugin', async (req: Request, res: Response) => {
    let pluginName = req.query.pluginname;
    await PluginService.installPluginDependencies(
      pluginName as string,
      path.join(userDir, 'plugins', pluginName as string),
    );
    PluginService.refreshAllPlugins();
    res.send({ status: 'ok' });
  });

  router.get('/export_plugin', async (req: Request, res: Response) => {
    const pluginName = req.query.pluginname as string;
    const includeAssets = req.query.include_assets === 'true';
    const includeSource = req.query.include_source === 'true';
    console.log(pluginName, includeAssets, includeSource);

    const tempDir = path.join(userDir, 'tmp');

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }

    const pluginDir = path.join(userDir, 'plugins', pluginName);
    const overlayDir = path.join(userDir, 'web', 'overlay', pluginName);
    const utilityDir = path.join(userDir, 'web', 'utility', pluginName);
    const settingsDir = path.join(userDir, 'web', 'settings', pluginName);
    const publicDir = path.join(userDir, 'web', 'public', pluginName);
    const assetsDir = path.join(userDir, 'web', 'assets', pluginName);
    const iconFile = path.join(userDir, 'web', 'icons', pluginName + '.png');

    const zip = new AdmZip();

    if (fs.existsSync(pluginDir)) {
      if (includeSource) {
        zip.addLocalFolder(pluginDir, '/plugin', (filename) => {
          return !filename.includes('node_modules') && !filename.includes('settings.json');
        });
      }

      if (!fs.existsSync(path.join(pluginDir, 'build')) && !includeSource) {
        webLog('No build directory found for plugin: ' + pluginName);
        res.status(400).send({ status: 'error', message: 'No build directory found' });
        return;
      }

      const buildDir = path.join(pluginDir, 'build');

      if (fs.existsSync(buildDir)) {
        webLog('Adding build directory for plugin: ' + pluginName);
        zip.addLocalFolder(buildDir, '/plugin/build', (filename) => {
          return !filename.includes('node_modules') && !filename.includes('settings.json');
        });

        if (!includeSource) {
          const settingsFormDir = path.join(pluginDir, 'settings-form.json');
          const eventsFormDir = path.join(pluginDir, 'events-form.json');

          if (fs.existsSync(settingsFormDir)) {
            zip.addLocalFile(settingsFormDir, '/plugin', 'settings-form.json');
          }

          if (fs.existsSync(eventsFormDir)) {
            zip.addLocalFile(eventsFormDir, '/plugin', 'events-form.json');
          }
        }
      }
    }

    if (fs.existsSync(overlayDir)) {
      zip.addLocalFolder(overlayDir, '/overlay');
    }

    if (fs.existsSync(utilityDir)) {
      zip.addLocalFolder(utilityDir, '/utility');
    }

    if (fs.existsSync(settingsDir)) {
      zip.addLocalFolder(settingsDir, '/settings');
    }

    if (fs.existsSync(publicDir)) {
      zip.addLocalFolder(publicDir, '/public');
    }

    if (includeAssets && fs.existsSync(assetsDir)) {
      zip.addLocalFolder(assetsDir, '/assets');
    }

    if (fs.existsSync(iconFile)) {
      zip.addLocalFile(iconFile, '/', 'icon.png');
    }

    const finalFileName = pluginName + '.zip';

    zip.writeZip(tempDir + '/' + finalFileName, () => {
      res.setHeader('Content-disposition', finalFileName);
      res.download(tempDir + '/' + finalFileName);
    });

    fs.rm(tempDir, { recursive: true });
  });

  router.get('/refresh_plugins', async (req: Request, res: Response) => {
    await PluginService.refreshAllPlugins();
    res.send({ status: 'Refresh Success!' });
  });

  router.get('/refresh_plugin', async (req: Request, res: Response) => {
    await PluginService.refreshPlugin(req.query.pluginname as string);
    res.send({ status: 'success' });
  });

  router.get('/build_plugin', async (req: Request, res: Response) => {
    const pluginName = req.query.pluginname as string;
    if (!pluginName) {
      res.send({ status: 'error', error: 'No plugin name provided' });
      return;
    }
    PluginService.buildPlugin(pluginName)
      .then(() => {
        res.send({ status: 'ok' });
      })
      .catch((e) => {
        res.send({ status: 'error', error: e });
      });
  });

  router.post('/delete_plugin', async (req: Request, res: Response) => {
    const pluginName = req.body.pluginName;
    if (!pluginName) {
      res.send({ status: 'error', error: 'No plugin name provided' });
      return;
    }

    PluginService.stopPlugin(pluginName);
    PluginRepoService.remove(pluginName);

    const pluginDir = path.join(userDir, 'plugins', pluginName);
    const overlayDir = path.join(userDir, 'web', 'overlay', pluginName);
    const utilityDir = path.join(userDir, 'web', 'utility', pluginName);
    const publicDir = path.join(userDir, 'web', 'public', pluginName);
    const settingsDir = path.join(userDir, 'web', 'settings', pluginName);
    const assetsDir = path.join(userDir, 'web', 'assets', pluginName);
    const iconFile = path.join(userDir, 'web', 'icons', pluginName + '.png');
    if (fs.existsSync(pluginDir)) {
      fs.rmSync(pluginDir, { recursive: true });
    }
    if (fs.existsSync(overlayDir)) {
      fs.rmSync(overlayDir, { recursive: true });
    }
    if (fs.existsSync(utilityDir)) {
      fs.rmSync(utilityDir, { recursive: true });
    }
    if (fs.existsSync(publicDir)) {
      fs.rmSync(publicDir, { recursive: true });
    }
    if (fs.existsSync(settingsDir)) {
      fs.rmSync(settingsDir, { recursive: true });
    }
    if (fs.existsSync(assetsDir)) {
      fs.rmSync(assetsDir, { recursive: true });
    }
    if (fs.existsSync(iconFile)) {
      fs.rmSync(iconFile);
    }
    res.send({ status: 'ok' });
  });

  router.post('/set_plugin_enabled', (req: Request, res: Response) => {
    const pluginName = req.body.pluginName;
    const isEnabled = req.body.isEnabled;
    PluginService.setEnablePlugin(pluginName, isEnabled);

    res.send({ status: 'ok' });
  });

  router.post('/set_plugin_dev_mode', (req: Request, res: Response) => {
    const pluginName = req.body.pluginName;
    const isEnabled = req.body.isEnabled;
    PluginService.setDevMode(pluginName, isEnabled);

    res.send({ status: 'ok' });
  });

  router.post('/save_plugin_settings', async (req: Request, res: Response) => {
    const newSettings = req.body.new_settings;
    const pluginName = req.body.pluginName;
    const saveStatus = PluginService.savePluginSettings(pluginName, newSettings);
    if (saveStatus) {
      res.send({ status: 'ok' });
      webLog('' + pluginName + ' Settings Saved!');
    } else {
      res.send({
        status: 'error',
        error: 'Failed to save settings. Check app console for details.',
      });
    }

    PluginService.refreshPlugin(pluginName);
  });
}
