import { NextFunction, Request, Response, Router } from 'express';
import express from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import fileUpload from 'express-fileupload';
import path from 'path';
import { userDir, frontendDir } from '../../Types.ts';
import { webLog } from '../Logging.ts';
import ConfigService from './ConfigService.ts';
import { ConfigRoutes } from '../routes/ConfigRoutes.ts';
import { isLocal, PluginRoutes } from '../routes/PluginRoutes.ts';
import ModuleService from './ModuleService.ts';
import fs from 'fs-extra';
import { networkInterfaces } from 'os';
import { StreamModuleInterface } from '../../integration/interface/StreamModuleInterface.ts';
import { CommunityModuleInterface } from '../../integration/interface/CommunityModuleInterface.ts';
import { BackupRestoreRoutes } from '../routes/BackupRestoreRoutes.ts';
import { EventRoutes } from '../routes/EventRoutes.ts';
import { UserRoutes } from '../routes/UserRoutes.ts';
import { ShareRoutes } from '../routes/ShareRoutes.ts';
import { PublicRoutes } from '../routes/PublicRoutes.ts';
import { ControlModuleInterface } from 'src/integration/interface/ControlModuleInterface.ts';
import { ServerRoutes } from '../routes/ServerRoutes.ts';
import Ngrok from './webui/Ngrok.ts';

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

export class WebService {
  private static instance: WebService;
  constructor() {
    if (WebService.instance) {
      return WebService.instance;
    }

    WebService.instance = this;
    WebService.instance.startServer(ConfigService.getFlags().initMode);
  }

  router: Router | undefined = undefined;
  publicRouter: Router | undefined = undefined;

  private ngrok: Ngrok = new Ngrok();

  startServer(initMode: boolean) {
    let expressPort = null;

    const pluginsDir = path.join(userDir, 'plugins');
    const webDir = path.join(userDir, 'web');
    const overlayDir = path.join(userDir, 'web', 'overlay');
    const utilityDir = path.join(userDir, 'web', 'utility');
    const assetDir = path.join(userDir, 'web', 'assets');
    const iconDir = path.join(userDir, 'web', 'icons');

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

    const sconfig = ConfigService.getConfig();

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

      router.use('/overlay', express.static(userDir + '/web/overlay'));
      router.use('/utility', express.static(userDir + '/web/utility'));
      router.use('/plugin', express.static(userDir + '/web/public'));
      router.use('/assets', express.static(userDir + '/web/assets'));
      router.use('/icons', express.static(userDir + '/web/icons'));

      router.use(cookieParser());

      publicRouter.use('/', express.static(frontendDir + '/public/build'));
      publicRouter.use('/login', express.static(frontendDir + '/login/build'));
      publicRouter.use('/mod', express.static(frontendDir + '/mod/build'));

      publicRouter.use('/overlay', express.static(userDir + '/web/overlay'));
      publicRouter.use('/utility', express.static(userDir + '/web/utility'));
      publicRouter.use('/plugin', express.static(userDir + '/web/public'));
      publicRouter.use('/assets', express.static(userDir + '/web/assets'));
      publicRouter.use('/icons', express.static(userDir + '/web/icons'));

      publicRouter.use(bodyParser.urlencoded({ extended: true }));
      publicRouter.use(bodyParser.json());
      publicRouter.use(cookieParser());

      const systemRoutes = ServerRoutes();
      router.use('/server', systemRoutes.local);

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
      router.use('/shares', shareRoutes.local);

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

    if (sconfig.network.externalhandle == 'ngrok' && sconfig.network.ngrokauthtoken != '') {
      this.ngrok.start();
    }
  }

  static registerModuleApi(
    context: StreamModuleInterface | CommunityModuleInterface | ControlModuleInterface,
  ) {
    const { router, publicRouter, baseUrl } = context.getRouters();
    if (router != null) {
      WebService.instance.router?.use(baseUrl, router);
    }
    if (publicRouter != null) {
      WebService.instance.publicRouter?.use(baseUrl, publicRouter);
    }
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
