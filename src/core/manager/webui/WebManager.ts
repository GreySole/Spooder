import { NextFunction, Request, Response, Router } from 'express';
import ngrok from 'ngrok';
import express from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import fileUpload from 'express-fileupload';
import path from 'path';
import { backendDir, frontendDir } from '../../../Types.ts';
import { logEffects, webLog } from '../../Logging.ts';
import ConfigManager from '../ConfigManager.ts';
import { ConfigRoutes } from './routes/ConfigRoutes.ts';
import { isLocal, PluginRoutes } from './routes/PluginRoutes.ts';
import ModuleManager from '../ModuleManager.ts';
import fs from 'fs-extra';
import { networkInterfaces } from 'os';
import { StreamModuleInterface } from '../../../integration/interface/StreamModuleInterface.ts';
import { CommunityModuleInterface } from '../../../integration/interface/CommunityModuleInterface.ts';
import { BackupRestoreRoutes } from './routes/BackupRestoreRoutes.ts';
import { EventRoutes } from './routes/EventRoutes.ts';
import { UserRoutes } from './routes/UserRoutes.ts';
import { ShareRoutes } from './routes/ShareRoutes.ts';
import { PublicRoutes } from './routes/PublicRoutes.ts';
import PluginManager from '../PluginManager.ts';
import ShareManager from '../ShareManager.ts';

const nets = networkInterfaces();
const results = Object.create({});
var suggestedNet: string | undefined = undefined;

if (nets !== undefined) {
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      // 'IPv4' is in Node <= 17, from 18 it's a number 4 or 6
      const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4;
      if (net.family === familyV4Value && !net.internal) {
        if (!results[name]) {
          results[name] = [];
        }
        results[name].push(net.address);
        if (net.address.startsWith('192')) {
          suggestedNet = net.address;
        }
      }
    }
  }
}

export class WebManager {
  private static instance: WebManager;
  constructor() {
    if (WebManager.instance) {
      return WebManager.instance;
    }

    WebManager.instance = this;
    WebManager.instance.startServer(ConfigManager.getFlags().initMode);
  }

  router: Router | undefined = undefined;
  publicRouter: Router | undefined = undefined;

  startServer(initMode: boolean) {
    let expressPort = null;

    const pluginsDir = path.join(backendDir, 'plugins');
    const webDir = path.join(backendDir, 'web');
    const overlayDir = path.join(backendDir, 'web', 'overlay');
    const utilityDir = path.join(backendDir, 'web', 'utility');
    const assetDir = path.join(backendDir, 'web', 'assets');
    const iconDir = path.join(backendDir, 'web', 'icons');

    if (!fs.existsSync(pluginsDir)) {
      fs.mkdirSync(pluginsDir);
    }

    if (!fs.existsSync(webDir)) {
      fs.mkdirSync(webDir);
    }

    if (!fs.existsSync(overlayDir)) {
      fs.mkdirSync(overlayDir);
    }

    if (!fs.existsSync(utilityDir)) {
      fs.mkdirSync(utilityDir);
    }

    if (!fs.existsSync(assetDir)) {
      fs.mkdirSync(assetDir);
    }

    if (!fs.existsSync(iconDir)) {
      fs.mkdirSync(iconDir);
    }

    const app = express();
    const router = express.Router();
    const publicRouter = express.Router();
    this.router = router;
    this.publicRouter = publicRouter;

    const sconfig = ConfigManager.getConfig();

    if (initMode == true) {
      expressPort = 3000;
      console.log('STARTING SERVER IN INIT MODE');
      router.use('/', express.static(frontendDir + '/init/build'));
      router.use(bodyParser.urlencoded({ extended: true }));
      router.use(bodyParser.json({ limit: '100mb' }));
      router.use('/restore_settings', fileUpload());
      router.use('/restore_plugins', fileUpload());
    } else {
      expressPort = sconfig.network.host_port;
      router.use('/', express.static(frontendDir + '/main/build'));
      router.use('/mod', express.static(frontendDir + '/mod/build'));
      router.use('/public', express.static(frontendDir + '/public/build'));

      router.use('/overlay', express.static(backendDir + '/web/overlay'));
      router.use('/utility', express.static(backendDir + '/web/utility'));
      router.use('/plugin', express.static(backendDir + '/web/public'));
      router.use('/assets', express.static(backendDir + '/web/assets'));
      router.use('/icons', express.static(backendDir + '/web/icons'));

      //router.use(express.json({ verify: this.verifyTwitchSignature }));
      router.use(cookieParser());

      publicRouter.use('/', express.static(frontendDir + '/public/build'));
      publicRouter.use('/login', express.static(frontendDir + '/login/build'));
      publicRouter.use('/mod', express.static(frontendDir + '/mod/build'));

      publicRouter.use('/overlay', express.static(backendDir + '/web/overlay'));
      publicRouter.use('/utility', express.static(backendDir + '/web/utility'));
      publicRouter.use('/plugin', express.static(backendDir + '/web/public'));
      publicRouter.use('/assets', express.static(backendDir + '/web/assets'));
      publicRouter.use('/icons', express.static(backendDir + '/web/icons'));

      publicRouter.use(bodyParser.urlencoded({ extended: true }));
      publicRouter.use(bodyParser.json());
      publicRouter.use(cookieParser());
      //publicRouter.use(express.json({ verify: this.verifyTwitchSignature }));

      router.get('/server_state', async (req: Request, res: Response) => {
        const sconfig = ConfigManager.getConfig();
        const activePlugins = PluginManager.getActivePlugins();
        const themes = ConfigManager.getThemes();
        const shares = ShareManager.getShares();
        const activeShares = ShareManager.getActiveShares();

        res.send({
          host: sconfig.network.host,
          port: sconfig.network.osc_tcp_port,
          udp_clients: sconfig.network['udp_clients'],
          plugins: Object.keys(activePlugins),
          themes: themes,
          activeShares: activeShares,
          shares: Object.keys(shares),
        });
      });

      const backupRestoreRoutes = BackupRestoreRoutes();
      router.use('/recovery', backupRestoreRoutes.local);

      const configRoutes = ConfigRoutes();
      router.use('/config', configRoutes.local);

      const eventRoutes = EventRoutes();
      router.use('/events', eventRoutes.local);

      const pluginRoutes = PluginRoutes();
      router.use('/plugins', pluginRoutes.local);
      publicRouter.use('/plugins', pluginRoutes.public);

      const userRoutes = UserRoutes();
      router.use('/users', userRoutes.local);

      const shareRoutes = ShareRoutes();
      router.use('/share', shareRoutes.local);

      const publicRoutes = PublicRoutes();
      router.use('/public', publicRoutes.local);
      publicRouter.use('/', publicRoutes.public);
    }

    app.use('/', (req: Request, res: Response, next: NextFunction) => {
      if (isLocal(req)) {
        router(req, res, next);
      } else {
        publicRouter(req, res, next);
      }
    });

    app.use((req: Request, res: Response, next: NextFunction) => {
      res.status(404).send('<h1>Page not found on the server</h1>');
    });

    app.listen(expressPort);

    webLog(
      'Spooder Web UI is running at',
      'http://localhost:' + expressPort + ' and http://' + suggestedNet + ':' + expressPort,
    );

    return router;
  }

  static registerModuleApi(context: StreamModuleInterface | CommunityModuleInterface) {
    const { router, publicRouter, baseUrl } = context.getRouters();
    WebManager.instance.router?.use(baseUrl, router);
    WebManager.instance.publicRouter?.use(baseUrl, publicRouter);
  }

  static async startNgrok() {
    const sconfig = ConfigManager.getConfig();
    if (ConfigManager.getFlags().safeMode == true) {
      return;
    }

    try {
      await ngrok.connect({
        authtoken: sconfig.network.ngrokauthtoken,
      });
    } catch (e) {
      console.log('Error creating Ngrok tunnel', e);
      return;
    }

    let napi = ngrok.getApi();

    if (!napi) {
      webLog('Ngrok error: Could not connect to API');
      return;
    }

    let tunnels = await napi.listTunnels();
    for (let t in tunnels.tunnels) {
      napi.stopTunnel(tunnels.tunnels[t].name);
    }

    let httpURL = await napi.startTunnel({
      name: 'webui',
      proto: 'http',
      addr: sconfig.network.host_port,
    });

    tunnels = await napi.listTunnels();

    for (let t in tunnels.tunnels) {
      if (tunnels.tunnels[t].proto == 'http') {
        napi.stopTunnel(tunnels.tunnels[t].name);
      }
    }

    let oscURL = await napi.startTunnel({
      name: 'modui',
      proto: 'http',
      addr: sconfig.network.osc_tcp_port,
    });

    tunnels = await napi.listTunnels();

    for (let t in tunnels.tunnels) {
      if (tunnels.tunnels[t].proto == 'http') {
        napi.stopTunnel(tunnels.tunnels[t].name);
      }
    }

    sconfig.network.external_http_url = httpURL.public_url;
    sconfig.network.external_tcp_url = oscURL.public_url;

    const streamModules = ModuleManager.getStreamModules();
    const communityModules = ModuleManager.getCommunityModules();

    for (let s in streamModules) {
      streamModules[s].onNgrokStart();
    }

    for (let c in communityModules) {
      communityModules[c].onNgrokStart();
    }
  }

  static stopNgrok() {
    ngrok.disconnect();
  }
}

//Contribution by ChatGPT :3
function mergeDirectories(sourceDir: string, destDir: string) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir);
  }

  const files = fs.readdirSync(sourceDir);

  files.forEach((file: string) => {
    const srcPath = path.join(sourceDir, file);
    const destPath = path.join(destDir, file);

    const stats = fs.statSync(srcPath);

    if (stats.isDirectory()) {
      mergeDirectories(srcPath, destPath);
    } else {
      fs.moveSync(srcPath, destPath, { overwrite: true });
    }
  });
}
