import express from 'express';
import { Request, Response } from 'express';
import AdmZip from 'adm-zip';
import chmodr from 'chmodr';
import path from 'path';
import fs from 'fs-extra';
import fileUpload, { UploadedFile } from 'express-fileupload';
import { KeyedObject, backendDir } from '../../../../Types.ts';
import { logToFile, webLog } from '../../../Logging.ts';
import ConfigManager from '../../ConfigManager.ts';
import { EventManager } from '../../EventManager.ts';
import OSCManager from '../../OSCManager.ts';
import PluginManager from '../../PluginManager.ts';
import bodyParser from 'body-parser';

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

export function isLocal(req: Request) {
  if (req.ip === undefined) {
    return false;
  }
  const remoteAddressRaw = req.ip.split(':');
  const remoteAddress = remoteAddressRaw[remoteAddressRaw.length - 1];
  if (remoteAddress == null) {
    console.log('Remote adderess null', req.ip);
    return false;
  }
  const isLocal =
    remoteAddress.startsWith('192.168.') ||
    remoteAddress.startsWith('10.') ||
    remoteAddress == '1' ||
    req.headers.host?.startsWith('localhost');
  if (isLocal == false) {
    logToFile(
      'external_connections',
      `IP: ${remoteAddress} Path: ${req.path} Cookie: ${req.cookies?.access != null ? 'PRESENT' : 'NONE'}`,
      300,
    );
  }
  return isLocal;
}

export function registerPluginApi(
  context: any,
  router: string,
  method: string,
  address: string,
  funct: (req: Request, res: Response) => void,
) {
  if (router === 'local') {
    if (method.toLowerCase() === 'get') {
      pluginApi.local.get[path.join(context.dirname, address)] = funct.bind(context);
    } else if (method.toLowerCase() === 'post') {
      pluginApi.local.post[path.join(context.dirname, address)] = funct.bind(context);
    }
  } else if (router === 'public') {
    if (method.toLowerCase() === 'get') {
      pluginApi.public.get[path.join(context.dirname, address)] = funct.bind(context);
    } else if (method.toLowerCase() === 'post') {
      pluginApi.public.post[path.join(context.dirname, address)] = funct.bind(context);
    }
  } else {
    throw new Error(`Unknown router: ${router}. There's only local and public routers.`);
  }
}

export function PluginRoutes() {
  const sconfig = ConfigManager.getConfig();
  const router = express.Router();
  const publicRouter = express.Router();

  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json({ limit: '100mb' }));
  router.use('/install_plugin', fileUpload());
  router.use('/upload_plugin_asset/*', fileUpload());
  router.use('/upload_plugin_icon/*', fileUpload());

  async function pluginGet(req: Request, res: Response) {
    var pluginName = req.query.plugin;
    var pluginSettings = null;

    try {
      var thisPlugin = fs.readFileSync(backendDir + 's/' + pluginName + '/settings.json', {
        encoding: 'utf8',
      });
      pluginSettings = JSON.parse(thisPlugin);
    } catch (e) {
      webLog(pluginName + ' has no settings');
    }

    let oscInfo = null;

    if (isLocal(req)) {
      oscInfo = {
        host: sconfig.network.external_tcp_url,
        name: pluginName,
        port: null,
        settings: pluginSettings,
      };
    } else {
      oscInfo = {
        host: sconfig.network.host,
        name: pluginName,
        port: sconfig.network.osc_tcp_port,
        settings: pluginSettings,
      };
    }

    res.send({ express: JSON.stringify(oscInfo) });
  }

  router.get('/get', pluginGet);
  publicRouter.get('/get', pluginGet);

  router.get('/get_list', async (req: Request, res: Response) => {
    const activePlugins = PluginManager.getActivePlugins();
    let pluginPacks = {} as KeyedObject;
    for (let a in activePlugins) {
      let settingsFile = path.join(backendDir, 'plugins', a, 'settings.json');
      let thisPlugin =
        fs.existsSync(settingsFile) == true
          ? JSON.parse(fs.readFileSync(settingsFile, { encoding: 'utf8' }))
          : null;

      let settingsForm = path.join(backendDir, 'plugins', a, 'settings-form.json');
      let thisPluginForm =
        fs.existsSync(settingsForm) == true
          ? JSON.parse(fs.readFileSync(settingsForm, { encoding: 'utf8' }))
          : null;

      let overlayDir = path.join(backendDir, 'web', 'overlay', a);
      let utilityDir = path.join(backendDir, 'web', 'utility', a);
      let settingsDir = path.join(backendDir, 'web', 'settings', a);
      pluginPacks[a] = {
        name: activePlugins[a].name == null ? a : activePlugins[a].name,
        version: activePlugins[a].version == null ? 'Unknown Version' : activePlugins[a].version,
        author: activePlugins[a].author == null ? 'Unknown Author' : activePlugins[a].author,
        description: activePlugins[a].description == null ? '' : activePlugins[a].description,
        dependencies: activePlugins[a].dependencies == null ? {} : activePlugins[a].dependencies,
        settings: thisPlugin,
        'settings-form': thisPluginForm,
        assetBrowserPath: '/',
        assetPath: path.join('assets', a),
        hasOverlay: fs.existsSync(overlayDir),
        hasUtility: fs.existsSync(utilityDir),
        hasExternalSettingsPage: fs.existsSync(settingsDir),
      };
      if (activePlugins[a].status != null && activePlugins[a].status != 'ok') {
        pluginPacks[a].status = activePlugins[a].status;
      }
    }

    res.send(JSON.stringify(pluginPacks));
  });

  publicRouter.get('/public', (req: Request, res: Response) => {
    const activePlugins = EventManager.getActiveEvents();
    let publicPlugins = [];
    for (let p in activePlugins) {
      if (activePlugins[p].hasPublic) {
        publicPlugins.push(p);
      }
    }
    res.send({ data: publicPlugins });
  });

  router.get('/public', (req: Request, res: Response) => {
    const activePlugins = EventManager.getActiveEvents();
    let publicPlugins = [];
    for (let p in activePlugins) {
      if (activePlugins[p].hasPublic) {
        publicPlugins.push(p);
      }
    }
    res.send({ data: publicPlugins });
  });

  router.post('/create_plugin', async (req: Request, res: Response) => {
    let pluginName = req.body.pluginName;
    let options = {
      createInfo: {
        name: pluginName,
        author: req.body.author,
        description: req.body.description,
      },
      overlay: true,
      utility: true,
    };
    let pluginDirName = req.body.internalName;

    let pluginPath = path.join(backendDir, 'tmp', pluginDirName);

    if (!fs.existsSync(pluginPath)) {
      fs.mkdirSync(pluginPath, { recursive: true });
    } else {
      fs.rmSync(pluginPath, { recursive: true });
    }

    fetch('https://api.github.com/repos/greysole/Spooder-Sample-Plugin/zipball/main')
      .then((response) => response.arrayBuffer())
      .then(async (data) => {
        const tempDir = path.join(backendDir, 'tmp', pluginDirName);
        const tempFile = path.join(backendDir, 'tmp', pluginDirName, pluginDirName + '.zip');
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true });
        }

        fs.mkdirSync(tempDir, { recursive: true });
        fs.writeFileSync(tempFile, Buffer.from(data));

        let zip = new AdmZip(tempFile);
        zip.extractEntryTo(zip.getEntries()[0], tempDir);

        const fileDir = path.join(tempDir, zip.getEntries()[0].entryName);

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
        await PluginManager.installPluginFromTemp(pluginDirName, options);
      });
  });

  router.post('/install_plugin', async (req: Request, res: Response) => {
    try {
      if (!req.files) {
        webLog('NO FILES FOUND');
        res.send({
          status: false,
          message: 'No file uploaded',
        });
      } else {
        let pluginZip = req.files.file as UploadedFile;
        let pluginDirName = req.body.internalName;

        let tempDir = path.join(backendDir, 'tmp', pluginDirName);
        if (fs.existsSync(tempDir)) {
          await fs.rm(tempDir, { recursive: true });
        }

        fs.mkdirSync(tempDir, { recursive: true });

        let tempFile = path.join(backendDir, 'tmp', pluginDirName, pluginZip.name);
        //Cleanup before install
        if (fs.existsSync(tempFile)) {
          await fs.rm(tempFile);
        }

        OSCManager.sendToTCP('/frontend/install/progress', {
          pluginName: pluginDirName,
          status: 'progress',
          message: 'Extracting...',
        });
        //Start installing
        await pluginZip.mv(tempFile);
        webLog('EXTRACT ZIP');
        res.send({
          status: true,
          message: 'File Upload Success',
          plugin: pluginDirName,
        });
        let zip = new AdmZip(tempFile);
        zip.extractAllTo(tempDir);
        fs.rm(tempFile);
        await PluginManager.installPluginFromTemp(pluginDirName);
      }
    } catch (e) {
      console.error(e);
    }
  });

  router.get('/reinstall_plugin', async (req: Request, res: Response) => {
    let pluginName = req.query.pluginname;
    await PluginManager.installPluginDependencies(
      pluginName as string,
      path.join(backendDir, 'plugins', pluginName as string),
    );
    PluginManager.refreshAllPlugins();
    res.send({ status: 'ok' });
  });

  router.get('/export_plugin/*', async (req: Request, res: Response) => {
    let pluginName = req.params['0'];

    let tempDir = path.join(backendDir, 'tmp', pluginName);
    let pluginDir = path.join(backendDir, 'plugins', pluginName);
    let overlayDir = path.join(backendDir, 'web', 'overlay', pluginName);
    let utilityDir = path.join(backendDir, 'web', 'utility', pluginName);
    let settingsDir = path.join(backendDir, 'web', 'settings', pluginName);
    let iconFile = path.join(backendDir, 'web', 'icons', pluginName + '.png');

    let zip = new AdmZip();

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

    if (fs.existsSync(iconFile)) {
      zip.addLocalFile(iconFile, undefined, 'icon.png');
    }

    zip.writeZip(tempDir + '/' + pluginName + '.zip');

    res.setHeader('Content-disposition', pluginName + '.zip');
    res.download(tempDir + '/' + pluginName + '.zip');

    fs.rm(tempDir, { recursive: true });
  });

  router.get('/refresh_plugins', async (req: Request, res: Response) => {
    await PluginManager.refreshAllPlugins();
    res.send({ status: 'Refresh Success!' });
  });

  router.get('/refresh_plugin', async (req: Request, res: Response) => {
    await PluginManager.refreshPlugin(req.query.pluginname as string);
    res.send({ status: 'success' });
  });

  router.post('/delete_plugin_asset', async (req: Request, res: Response) => {
    let pluginName = req.body.pluginName;
    let assetPath = req.body.assetName;
    let fileStatus = 'SUCCESS';

    let assetDir = path.join(backendDir, 'web', 'assets', pluginName, assetPath, '..');
    let assetFile = path.join(backendDir, 'web', 'assets', pluginName, assetPath);
    fs.rmSync(assetFile, { recursive: true });
    let thisPluginAssets = fs.existsSync(assetDir) == true ? fs.readdirSync(assetDir) : null;

    res.send({
      status: fileStatus,
      newAssets: thisPluginAssets,
    });
  });

  router.post('/get_plugin_assets', async (req: Request, res: Response) => {
    let pluginName = req.body.pluginname;
    let mainDir = path.join(backendDir, 'web', 'assets', pluginName);
    var results = {} as KeyedObject;
    let walk = function (dir: string, done: (a: any, b?: any) => void) {
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
    walk(path.join(backendDir, 'web', 'assets', pluginName), (err, results) => {
      res.send({ status: 'OK', dirs: results });
    });
  });

  router.get('/browse_plugin_assets', async (req: Request, res: Response) => {
    const currentPath = req.query.folder as string;
    const pluginName = req.query.pluginname as string;

    if (!fs.existsSync(path.join(backendDir, 'web', 'assets', pluginName))) {
      fs.mkdirSync(path.join(backendDir, 'web', 'assets', pluginName));
    }

    if (!fs.existsSync(path.join(backendDir, 'web', 'assets', pluginName, currentPath))) {
      res.send({ status: 'EMPTY', dirs: [] });
      return;
    }

    const dirs =
      fs.existsSync(path.join(backendDir, 'web', 'assets', pluginName, currentPath)) == true
        ? fs.readdirSync(path.join(backendDir, 'web', 'assets', pluginName, currentPath))
        : [];

    dirs.forEach((value, index, array) => {
      array[index] = currentPath === '/' ? `/${value}` : `${currentPath}/${value}`;
    });

    res.send({ status: 'ok', dirs: dirs });
  });

  router.post('/upload_plugin_asset/*', async (req: Request, res: Response) => {
    try {
      if (!req.files) {
        webLog('NO FILES FOUND');
        res.send({
          status: false,
          message: 'No file uploaded',
        });
      } else {
        let pluginAsset = req.files.file as UploadedFile;
        let assetPath = req.params['0'];

        let assetDir = path.join(backendDir, 'web', 'assets', assetPath);
        let assetFile = path.join(assetDir, pluginAsset.name);

        if (!fs.existsSync(assetDir)) {
          fs.mkdirSync(assetDir);
        }
        await pluginAsset.mv(assetFile);

        chmodr(assetFile, 0o777, (err) => {
          if (err) throw err;
        });
        webLog('COMPLETE!');

        PluginManager.refreshAllPlugins();

        let thisPluginAssets = fs.existsSync(assetDir) == true ? fs.readdirSync(assetDir) : null;

        res.send({
          status: true,
          message: 'File Upload Success',
          newAssets: thisPluginAssets,
        });
      }
    } catch (e) {
      console.error(e);
    }
  });

  router.post('/upload_plugin_icon/*', async (req: Request, res: Response) => {
    try {
      if (!req.files) {
        webLog('NO FILES FOUND');
        res.send({
          status: false,
          message: 'No file uploaded',
        });
      } else {
        let pluginAsset = req.files.file as UploadedFile;
        let pluginName = req.params['0'];

        let iconDir = path.join(backendDir, 'web', 'icons');
        let iconFile = path.join(iconDir, pluginName + '.png');

        if (!fs.existsSync(iconDir)) {
          fs.mkdirSync(iconDir);
        }
        await pluginAsset.mv(iconFile);

        chmodr(iconFile, 0o777, (err) => {
          if (err) throw err;
        });
        webLog('COMPLETE!');

        //getPlugins();

        res.send({
          status: true,
          message: 'File Upload Success',
        });
      }
    } catch (e) {
      console.error(e);
    }
  });

  router.post('/delete_plugin', async (req: Request, res: Response) => {
    let thisBody = req.body;

    let pluginName = thisBody.pluginName;

    let pluginDir = path.join(backendDir, 'plugins', pluginName);
    let overlayDir = path.join(backendDir, 'web', 'overlay', pluginName);
    let utilityDir = path.join(backendDir, 'web', 'utility', pluginName);
    let settingsDir = path.join(backendDir, 'web', 'settings', pluginName);
    let assetsDir = path.join(backendDir, 'web', 'assets', pluginName);
    let iconFile = path.join(backendDir, 'web', 'icons', pluginName + '.png');
    if (fs.existsSync(pluginDir)) {
      await fs.rm(pluginDir, { recursive: true });
    }
    if (fs.existsSync(overlayDir)) {
      await fs.rm(overlayDir, { recursive: true });
    }
    if (fs.existsSync(utilityDir)) {
      await fs.rm(utilityDir, { recursive: true });
    }
    if (fs.existsSync(settingsDir)) {
      await fs.rm(settingsDir, { recursive: true });
    }
    if (fs.existsSync(assetsDir)) {
      await fs.rm(assetsDir, { recursive: true });
    }
    if (fs.existsSync(iconFile)) {
      await fs.rm(iconFile);
    }
    res.send(JSON.stringify({ status: 'SUCCESS' }));
    PluginManager.refreshAllPlugins();
  });

  router.post('/save_plugin', async (req: Request, res: Response) => {
    let newSettings = req.body;
    let settingsFile = path.join(backendDir, 'plugins', newSettings.pluginName, 'settings.json');
    webLog('SAVING', settingsFile, newSettings);
    fs.writeFileSync(settingsFile, JSON.stringify(newSettings.settings), 'utf-8');
    res.send({ saveStatus: 'SAVE SUCCESS' });
    fs.chmod(settingsFile, 0o777);
    webLog('' + newSettings.pluginName + ' Settings Saved!');

    PluginManager.refreshAllPlugins();
  });

  router.get('/get_plugin/*', async (req: Request, res: Response) => {
    let plugin = {};
    let a = req.params['0'];
    let thisPlugin = fs.readFileSync(backendDir + 's/' + a + '/settings.json', {
      encoding: 'utf8',
    });
    let thisPluginIcon = backendDir + '/icons/' + a + '.png';

    let assetDir = path.join(backendDir, 'web', 'overlay', a, 'assets');

    let thisPluginAssets = fs.existsSync(assetDir) == true ? fs.readdirSync(assetDir) : null;

    plugin = {
      settings: JSON.parse(thisPlugin),
      assets: thisPluginAssets,
      udpClients: sconfig.network['udp_clients'],
      icon: thisPluginIcon,
    };

    res.send(plugin);
  });

  router.get('/*', (req: Request, res: Response) => {
    if (pluginApi.local.get[`${req.params[0]}`] != null) {
      pluginApi.local.get[`${req.params[0]}`](req, res);
    }
    res.status(200).end();
  });

  router.post('/*', (req: Request, res: Response) => {
    if (pluginApi.local.post[`${req.params[0]}`] != null) {
      pluginApi.local.post[`${req.params[0]}`](req, res);
    }
    res.status(200).end();
  });

  publicRouter.get('/*', (req: Request, res: Response) => {
    if (pluginApi.public.get[`${req.params[0]}`] != null) {
      pluginApi.public.get[`${req.params[0]}`](req, res);
    }
    res.status(200).end();
  });

  publicRouter.post('/*', (req: Request, res: Response) => {
    if (pluginApi.public.post[`${req.params[0]}`] != null) {
      pluginApi.public.post[`${req.params[0]}`](res, res);
    }
    res.status(200).end();
  });

  return {
    local: router,
    public: publicRouter,
  };
}
