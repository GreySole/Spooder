import express, { json, Request, Response } from 'express';
import AdmZip from 'adm-zip';
import chmodr from 'chmodr';
import path from 'path';
import fs from 'fs-extra';
import { KeyedObject, userDir } from '../../Types.ts';
import { logToFile, webLog } from '../Logging.ts';
import ConfigService from '../service/ConfigService.ts';
import OSCService from '../service/OSCService.ts';
import PluginService from '../service/PluginService.ts';
import multer from 'multer';
import { isLocal, WebService } from '../service/WebService.ts';
import { webJoin } from '../util/PathUtil.ts';

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
  if (router === 'local') {
    if (method.toLowerCase() === 'get') {
      pluginApi.local.get[webJoin(context.dirname, address)] = funct.bind(context);
    } else if (method.toLowerCase() === 'post') {
      pluginApi.local.post[webJoin(context.dirname, address)] = funct.bind(context);
    }
  } else if (router === 'public') {
    if (method.toLowerCase() === 'get') {
      pluginApi.public.get[webJoin(context.dirname, address)] = funct.bind(context);
    } else if (method.toLowerCase() === 'post') {
      pluginApi.public.post[webJoin(context.dirname, address)] = funct.bind(context);
    }
  } else {
    throw new Error(`Unknown router: ${router}. There's only local and public routers.`);
  }
}

export function PluginRoutes() {
  const sconfig = ConfigService.getConfig();
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

  async function pluginGet(req: Request, res: Response) {
    const pluginName = req.query.plugin as string;
    const shareKey = req.query.key as string;
    let pluginSettings = null;

    try {
      let settingsPath = path.join(userDir, 'plugins', pluginName, 'settings.json');
      if (shareKey) {
        const shareSettingsPath = path.join(
          userDir,
          'plugins',
          pluginName,
          '_share',
          'settings.json',
        );
        if (fs.existsSync(shareSettingsPath)) {
          settingsPath = shareSettingsPath;
        }
      }
      const thisPlugin = fs.readFileSync(settingsPath, {
        encoding: 'utf8',
      });
      pluginSettings = JSON.parse(thisPlugin);
    } catch (e) {
      webLog(pluginName + ' has no settings');
    }

    let oscInfo = null;

    if (isLocal(req)) {
      oscInfo = {
        host: sconfig.network.host,
        name: pluginName,
        port: sconfig.network.host_port,
        external: false,
        settings: pluginSettings,
      };
    } else {
      oscInfo = {
        host: WebService.getPublicHTTPUrl(),
        name: pluginName,
        port: null,
        external: true,
        settings: pluginSettings,
      };
    }

    res.send({ express: JSON.stringify(oscInfo) });
  }

  router.get('/get', pluginGet);
  publicRouter.get('/get', pluginGet);

  router.get('/get_list', async (req: Request, res: Response) => {
    const activePlugins = PluginService.getActivePlugins();
    const pluginPacks = {} as KeyedObject;
    for (let a in activePlugins) {
      const thisPlugin = activePlugins[a];

      pluginPacks[a] = {
        name: thisPlugin.name ? thisPlugin.name : a,
        version: thisPlugin.version ? thisPlugin.version : 'Unknown Version',
        author: thisPlugin.author ? thisPlugin.author : 'Unknown Author',
        description: thisPlugin.description ? thisPlugin.description : '',
        dependencies: thisPlugin.dependencies ? thisPlugin.dependencies : {},
        status: thisPlugin.status,
        assetBrowserPath: '/',
        assetPath: webJoin('assets', a),
        hasOverlay: thisPlugin.hasOverlay,
        hasUtility: thisPlugin.hasUtility,
        hasPublic: thisPlugin.hasPublic,
        pluginMode: thisPlugin.pluginMode,
        devMode: thisPlugin.devMode,
      };
    }

    res.send(JSON.stringify(pluginPacks));
  });

  router.get('/get_plugin_settings', async (req: Request, res: Response) => {
    const pluginName = req.query.plugin as string;
    try {
      const settings = path.join(userDir, 'plugins', pluginName, 'settings.json');
      const thisPluginForm =
        fs.existsSync(settings) == true
          ? JSON.parse(fs.readFileSync(settings, { encoding: 'utf8' }))
          : {};
      res.send(thisPluginForm);
    } catch (e) {
      res.send({ status: 'error', message: e });
    }
  });

  router.get('/get_plugin_settings_form', async (req: Request, res: Response) => {
    const pluginName = req.query.plugin as string;
    try {
      const settingsForm = path.join(userDir, 'plugins', pluginName, 'settings-form.json');
      const thisPluginForm =
        fs.existsSync(settingsForm) == true
          ? JSON.parse(fs.readFileSync(settingsForm, { encoding: 'utf8' }))
          : null;
      res.send(thisPluginForm);
    } catch (e) {
      res.send({ status: 'error', message: e });
    }
  });

  router.get('/get_plugin_events_form', async (req: Request, res: Response) => {
    const pluginName = req.query.plugin as string;
    try {
      const eventsForm = path.join(userDir, 'plugins', pluginName, 'events-form.json');
      const thisPluginForm =
        fs.existsSync(eventsForm) == true
          ? JSON.parse(fs.readFileSync(eventsForm, { encoding: 'utf8' }))
          : null;
      res.send(thisPluginForm);
    } catch (e) {
      res.send({ status: 'error', message: e });
    }
  });

  publicRouter.get('/public', (req: Request, res: Response) => {
    const platform = req.cookies.public_module;
    const accessToken = req.cookies.access_token;
    if (!platform || !accessToken) {
      res.status(401).send({ status: 'error', message: 'Unauthorized' });
      return;
    }
    const activePlugins = PluginService.getActivePlugins();
    let publicPlugins = [];
    for (let p in activePlugins) {
      if (activePlugins[p].hasPublic) {
        publicPlugins.push(p);
      }
    }
    res.send({ data: publicPlugins });
  });

  router.get('/public', (req: Request, res: Response) => {
    const activePlugins = PluginService.getActivePlugins();
    let publicPlugins = [];
    for (let p in activePlugins) {
      if (activePlugins[p].hasPublic) {
        publicPlugins.push(p);
      }
    }
    res.send({ data: publicPlugins });
  });

  router.post('/create_plugin', async (req: Request, res: Response) => {
    const pluginName = req.body.pluginName;
    const author = req.body.author;
    const description = req.body.description;
    const typescript = req.body.typescript;
    const pages = req.body.pages;

    const options = {
      createInfo: {
        name: pluginName,
        author: author,
        description: description,
      },
      ...pages,
    };
    const pluginDirName = req.body.internalName;

    const pluginPath = path.join(userDir, 'tmp', pluginDirName);

    if (!fs.existsSync(pluginPath)) {
      fs.mkdirSync(pluginPath, { recursive: true });
    } else {
      fs.rmSync(pluginPath, { recursive: true });
    }

    const sampleURL = typescript
      ? 'https://api.github.com/repos/greysole/Spooder-Sample-Plugin/zipball/0.5.0-dev-ts'
      : 'https://api.github.com/repos/greysole/Spooder-Sample-Plugin/zipball/main';

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
        const tempPublicDir = path.join(fileDir, 'public');

        if (pages.utility) {
          if (fs.existsSync(tempOverlayDir)) {
            await fs.copy(tempOverlayDir, tempUtilityDir);
          }
        }

        if (pages.public) {
          if (fs.existsSync(tempOverlayDir)) {
            await fs.copy(tempOverlayDir, tempPublicDir);
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
    console.log(pluginName);

    const tempDir = path.join(userDir, 'tmp');

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }

    const pluginDir = path.join(userDir, 'plugins', pluginName);
    const overlayDir = path.join(userDir, 'web', 'overlay', pluginName);
    const utilityDir = path.join(userDir, 'web', 'utility', pluginName);
    const settingsDir = path.join(userDir, 'web', 'settings', pluginName);
    const publicDir = path.join(userDir, 'web', 'public', pluginName);
    const iconFile = path.join(userDir, 'web', 'icons', pluginName + '.png');

    const zip = new AdmZip();

    if (fs.existsSync(pluginDir)) {
      zip.addLocalFolder(pluginDir, '/command', (filename) => {
        return !filename.includes('node_modules') && !filename.includes('settings.json');
      });
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

  router.post('/delete_plugin_asset', async (req: Request, res: Response) => {
    const pluginName = req.body.pluginName;
    const assetPath = req.body.assetName;
    const fileStatus = 'SUCCESS';

    const assetDir = path.join(userDir, 'web', 'assets', pluginName, assetPath, '..');
    const assetFile = path.join(userDir, 'web', 'assets', pluginName, assetPath);
    fs.rmSync(assetFile, { recursive: true });
    const thisPluginAssets = fs.existsSync(assetDir) == true ? fs.readdirSync(assetDir) : null;

    res.send({
      status: fileStatus,
      newAssets: thisPluginAssets,
    });
  });

  router.post('/get_plugin_assets', async (req: Request, res: Response) => {
    const pluginName = req.body.pluginname;
    const mainDir = path.join(userDir, 'web', 'assets', pluginName);
    const results = {} as KeyedObject;
    const walk = function (dir: string, done: (a: any, b?: any) => void) {
      fs.readdir(dir, function (err: any, list: any) {
        if (err) return done(err);
        var pending = list.length;
        let foldername = dir.substring(mainDir.length + 1);
        if (foldername == '') {
          foldername = 'root';
        }
        if (!pending) return done(null, results);
        list.forEach(function (file: string) {
          //file = path.resolve(dir, file); <-- Makes double backslash paths on Windows >.<
          file = dir + '/' + file;
          fs.stat(file, function (err: any, stat: any) {
            let filename = file.substring(mainDir.length + 1);
            if (stat && stat.isDirectory()) {
              walk(file, function (err, res) {
                //results[filename] = res;
                //results = results.concat(res);
                if (!--pending) done(null, results);
              });
            } else {
              //console.log(filename);
              if (results[foldername] == null) {
                results[foldername] = [];
              }
              results[foldername].push(filename);
              if (!--pending) done(null, results);
            }
          });
        });
      });
    };
    walk(path.join(userDir, 'web', 'assets', pluginName), (err, results) => {
      res.send({ status: 'OK', dirs: results });
    });
  });

  router.get('/browse_plugin_assets', async (req: Request, res: Response) => {
    const currentPath = req.query.folder as string;
    const pluginName = req.query.pluginname as string;

    if (!fs.existsSync(path.join(userDir, 'web', 'assets', pluginName))) {
      fs.mkdirSync(path.join(userDir, 'web', 'assets', pluginName));
    }

    if (!fs.existsSync(path.join(userDir, 'web', 'assets', pluginName, currentPath))) {
      res.send({ status: 'EMPTY', dirs: [] });
      return;
    }

    const dirs =
      fs.existsSync(path.join(userDir, 'web', 'assets', pluginName, currentPath)) == true
        ? fs.readdirSync(path.join(userDir, 'web', 'assets', pluginName, currentPath))
        : [];

    dirs.forEach((value, index, array) => {
      array[index] = currentPath === '/' ? `${value}` : `${currentPath}/${value}`;
    });

    res.send({ status: 'ok', dirs: dirs });
  });

  router.post('/upload_plugin_asset', async (req: Request, res: Response) => {
    try {
      if (!req.files) {
        webLog('NO FILES FOUND');
        res.send({
          status: false,
          message: 'No file uploaded',
        });
      } else {
        const uploadedFiles = req.files as Express.Multer.File[];
        console.log(uploadedFiles);
        const pluginName = req.body.pluginName;
        const assetPath = req.body.assetPath;

        const assetDir = path.join(userDir, 'web', 'assets', pluginName, assetPath);

        if (!fs.existsSync(assetDir)) {
          fs.mkdirSync(assetDir);
        }

        uploadedFiles.forEach(async (file) => {
          const assetFile = path.join(assetDir, file.originalname);
          console.log('COPYING', file, file.buffer);
          await fs.move(file.path, assetFile, { overwrite: true });
          chmodr(assetFile, 0o777, (err) => {
            if (err) throw err;
          });
        });

        webLog('COMPLETE!');

        res.send({
          status: true,
          message: 'File Upload Success',
        });
      }
    } catch (e) {
      console.error(e);
    }
  });

  router.post('/upload_plugin_icon', async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        webLog('NO FILES FOUND');
        res.send({
          status: false,
          message: 'No file uploaded',
        });
      } else {
        const pluginAsset = req.file as Express.Multer.File;
        const pluginName = req.params['0'];

        const iconDir = path.join(userDir, 'web', 'icons');
        const iconFile = path.join(iconDir, pluginName + '.png');

        if (!fs.existsSync(iconDir)) {
          fs.mkdirSync(iconDir);
        }
        await fs.promises.writeFile(iconFile, pluginAsset.buffer);

        chmodr(iconFile, 0o777, (err) => {
          if (err) throw err;
        });
        webLog('COMPLETE!');

        res.send({
          status: 'ok',
          message: 'File Upload Success',
        });
      }
    } catch (e) {
      console.error(e);
    }
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

    const pluginDir = path.join(userDir, 'plugins', pluginName);
    const overlayDir = path.join(userDir, 'web', 'overlay', pluginName);
    const utilityDir = path.join(userDir, 'web', 'utility', pluginName);
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

    PluginService.refreshAllPlugins();
  });

  publicRouter.post('/save_share_plugin_settings', async (req: Request, res: Response) => {
    const shareKey = req.body.key as string;
    const newSettings = req.body.new_settings;
    const pluginName = req.body.pluginName;
    const saveStatus = PluginService.saveSharePluginSettings(shareKey, pluginName, newSettings);
    if (saveStatus) {
      res.send({ status: 'ok' });
      webLog('Shared ' + pluginName + ' Settings Saved!');
    } else {
      res.send({
        status: 'error',
        error: 'Failed to save settings. Check app console for details.',
      });
    }

    PluginService.refreshAllPlugins();
  });

  router.get('/get_plugin/*', async (req: Request, res: Response) => {
    let plugin = {};
    let a = req.params['0'];
    let thisPlugin = fs.readFileSync(userDir + 's/' + a + '/settings.json', {
      encoding: 'utf8',
    });
    let thisPluginIcon = userDir + '/icons/' + a + '.png';

    let assetDir = path.join(userDir, 'web', 'overlay', a, 'assets');

    let thisPluginAssets = fs.existsSync(assetDir) == true ? fs.readdirSync(assetDir) : null;

    plugin = {
      settings: JSON.parse(thisPlugin),
      assets: thisPluginAssets,
      udpServers: OSCService.getUdpServers(),
      icon: thisPluginIcon,
    };

    res.send(plugin);
  });

  router.get('/api/*', (req: Request, res: Response) => {
    if (pluginApi.local.get[`${req.params[0]}`]) {
      pluginApi.local.get[`${req.params[0]}`](req, res);
    }
    res.status(200).end();
  });

  router.post('/api/*', (req: Request, res: Response) => {
    if (pluginApi.local.post[`${req.params[0]}`]) {
      pluginApi.local.post[`${req.params[0]}`](req, res);
    }
    res.status(200).end();
  });

  publicRouter.get('/api/*', (req: Request, res: Response) => {
    if (pluginApi.public.get[`${req.params[0]}`]) {
      pluginApi.public.get[`${req.params[0]}`](req, res);
    }
    res.status(200).end();
  });

  publicRouter.post('/api/*', (req: Request, res: Response) => {
    if (pluginApi.public.post[`${req.params[0]}`]) {
      pluginApi.public.post[`${req.params[0]}`](req, res);
    }
    res.status(200).end();
  });

  return {
    local: router,
    public: publicRouter,
  };
}
