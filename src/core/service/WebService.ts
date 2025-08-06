import { json, NextFunction, Request, Response, Router } from 'express';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { userDir, frontendDir } from '../../Types';
import { logToFile, spooderLog, webLog } from '../Logging';
import ConfigService from './ConfigService';
import { ConfigRoutes } from '../routes/ConfigRoutes';
import { PluginRoutes } from '../routes/PluginRoutes';
import fs from 'fs-extra';
import { networkInterfaces } from 'os';
import { StreamModuleInterface } from '../../integration/interface/StreamModuleInterface';
import { CommunityModuleInterface } from '../../integration/interface/CommunityModuleInterface';
import { BackupRestoreRoutes } from '../routes/BackupRestoreRoutes';
import { EventRoutes } from '../routes/EventRoutes';
import { UserRoutes } from '../routes/UserRoutes';
import { ShareRoutes } from '../routes/ShareRoutes';
import { PublicRoutes } from '../routes/PublicRoutes';
import { ControlModuleInterface } from '../../integration/interface/ControlModuleInterface';
import { ServerRoutes } from '../routes/ServerRoutes';
import Ngrok from './webui/Ngrok';
import MotherwolfTunnel from './webui/Motherwolf';
import { ModerationRoutes, validateModAccess, validateUser } from '../routes/ModerationRoutes';
import { ThemeRoutes } from '../routes/ThemeRoutes';
import multer from 'multer';
import net from 'net';
import http from 'http';
import ShareService from './ShareService';
import ModuleRoutes from '../routes/ModuleRoutes';

export function isLocal(req: Request) {
  if (req.headers['x-forwarded-for'] === undefined) {
    const remoteAddress = req.hostname || req.headers.host;
    if (!remoteAddress) {
      console.log('Remote address is undefined', req);
      return false;
    }
    const isLocal =
      remoteAddress.startsWith('localhost') ||
      remoteAddress.startsWith('192.168.') ||
      remoteAddress.startsWith('10.');
    return isLocal;
  }

  const remoteAddress = Array.isArray(req.headers['x-forwarded-for'])
    ? (req.headers['x-forwarded-for'][0] as string)
    : (req.headers['x-forwarded-for'] as string);

  if (remoteAddress == null) {
    console.log('Remote adderess null', req.ip);
    return false;
  }
  const isLocal =
    remoteAddress.startsWith('127.0.0.1') ||
    remoteAddress.startsWith('192.168.') ||
    remoteAddress.startsWith('10.');

  if (isLocal == false) {
    logToFile(
      'external_connections',
      `IP: ${remoteAddress} Path: ${req.path} Cookie: ${req.cookies?.access != null ? 'PRESENT' : 'NONE'}`,
      300,
    );
  }
  return isLocal;
}

export async function findAvailablePort(startPort: number): Promise<number> {
  let port = startPort;
  while (true) {
    const isAvailable = await new Promise<boolean>((resolve) => {
      const tester = net
        .createServer()
        .once('error', () => resolve(false))
        .once('listening', function () {
          tester.close();
          resolve(true);
        })
        .listen(port);
    });
    if (isAvailable) return port;
    console.log('Port', port, 'is not available, trying next one');
    port++;
  }
}

export class WebService {
  private static instance: WebService;
  private initializationPromise?: Promise<void>;

  constructor() {
    if (WebService.instance) {
      return WebService.instance;
    }

    WebService.instance = this;
    this.initializationPromise = WebService.instance.startServer(ConfigService.getFlags().initMode);
  }

  public static async waitForInitialization(): Promise<void> {
    if (WebService.instance && WebService.instance.initializationPromise) {
      await WebService.instance.initializationPromise;
    }
  }

  private server: http.Server | undefined = undefined;
  public router: Router | undefined = undefined;
  private publicRouter: Router | undefined = undefined;

  private ngrok: Ngrok = new Ngrok();
  private motherwolf: MotherwolfTunnel = new MotherwolfTunnel();

  private publicHTTPUrl: string | undefined = undefined;
  private publicOSCUrl: string | undefined = undefined;

  async startServer(initMode: boolean) {
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

    if (!fs.existsSync(path.join(userDir, 'tmp', 'multer'))) {
      fs.mkdirSync(path.join(userDir, 'tmp', 'multer'), { recursive: true });
    }

    if (initMode == true) {
      const tempStorage = multer.diskStorage({
        destination: (req, file, cb) => {
          cb(null, path.join(userDir, 'tmp', 'multer'));
        },
      });
      const fileUpload = multer({ storage: tempStorage });
      expressPort = await findAvailablePort(3000);
      console.log('STARTING SERVER IN INIT MODE');
      router.use('/', express.static(frontendDir + '/init/build'));
      router.use('/restore_settings', fileUpload.single('file'));
      router.use('/restore_plugins', fileUpload.single('file'));
    } else {
      expressPort = await findAvailablePort(sconfig.network.host_port);

      router.use(json({ limit: '100mb' }));
      router.use(cookieParser());

      router.use('/', express.static(frontendDir + '/main/build'));
      router.use('/mod', express.static(frontendDir + '/mod/build'));
      router.use('/public', express.static(frontendDir + '/public/build'));

      router.use('/overlay', express.static(userDir + '/web/overlay'));
      router.use('/utility', express.static(userDir + '/web/utility'));
      router.use('/plugin', express.static(userDir + '/web/public'));
      router.use('/assets', express.static(userDir + '/web/assets'));
      router.use('/icons', express.static(userDir + '/web/icons'));

      publicRouter.use(json());
      publicRouter.use(cookieParser());

      publicRouter.use('/', express.static(frontendDir + '/public/build'));
      publicRouter.use('/login', express.static(frontendDir + '/login/build'));
      publicRouter.use('/mod', validateModAccess, express.static(frontendDir + '/mod/build'));
      publicRouter.use('/share', express.static(frontendDir + '/share/build'));

      function validatePageAccess(req: Request, res: Response, next: NextFunction) {
        if (req.cookies?.access) {
          if (validateUser(req)) {
            next();
            return;
          } else {
            res.status(403).send('<h1>Access denied: Unauthorized</h1>');
            return;
          }
        }

        if (req.query.key || req.cookies?.share_key) {
          const isShareKeyValid = ShareService.validateShareKey(req, res);
          if (isShareKeyValid !== 'ok') {
            res.status(403).send(`<h1>Access denied: ${isShareKeyValid}</h1>`);
            return;
          }
          next();
          return;
        }

        res.status(403).send('<h1>Access denied: Unauthorized</h1>');
      }

      publicRouter.use('/overlay', validatePageAccess, express.static(userDir + '/web/overlay'));
      publicRouter.use('/utility', validatePageAccess, express.static(userDir + '/web/utility'));
      publicRouter.use('/plugin', express.static(userDir + '/web/public'));
      publicRouter.use('/assets', express.static(userDir + '/web/assets'));
      publicRouter.use('/icons', express.static(userDir + '/web/icons'));

      const systemRoutes = ServerRoutes();
      router.use('/server', systemRoutes.local);

      const backupRestoreRoutes = BackupRestoreRoutes();
      router.use('/recovery', backupRestoreRoutes.local);

      const configRoutes = ConfigRoutes();
      router.use('/config', configRoutes.local);

      const moduleRoutes = ModuleRoutes();
      router.use('/module', moduleRoutes.local);

      const eventRoutes = EventRoutes();
      router.use('/events', eventRoutes.local);

      const pluginRoutes = PluginRoutes();
      router.use('/plugin', pluginRoutes.local);
      publicRouter.use('/plugin', pluginRoutes.public);

      const userRoutes = UserRoutes();
      router.use('/users', userRoutes.local);
      publicRouter.use('/users', userRoutes.public);

      const modRoutes = ModerationRoutes();
      router.use('/mod', modRoutes.local);
      publicRouter.use('/mod', modRoutes.public);

      const themeRoutes = ThemeRoutes();
      router.use('/theme', themeRoutes.local);
      publicRouter.use('/theme', themeRoutes.public);

      const shareRoutes = ShareRoutes();
      router.use('/shares', shareRoutes.local);
      publicRouter.use('/shares', shareRoutes.public);

      const publicRoutes = PublicRoutes();
      router.use('/public', publicRoutes.local);
      publicRouter.use('/public', publicRoutes.public);
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

    this.server = http.createServer(app);

    this.server.listen(expressPort);

    const nets = WebService.getNetworkInterfaces();
    let suggestedNet = 'localhost';
    for (const name in nets) {
      if (nets[name].startsWith('192.168.')) {
        suggestedNet = nets[name];
        break;
      }
    }

    webLog(
      'Spooder Web UI is running at',
      'http://localhost:' + expressPort + ' and http://' + suggestedNet + ':' + expressPort,
    );
  }

  public static getServer() {
    if (!WebService.instance.server) {
      throw new Error('WebService server is not initialized');
    }
    return WebService.instance.server;
  }

  static getNetworkInterfaces() {
    const nets = networkInterfaces();
    const results = Object.create({});

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

            results[name] = net.address;
          }
        }
      }
      return results;
    }
  }

  static getPublicHTTPUrl() {
    return this.instance.publicHTTPUrl;
  }

  static setPublicHTTPUrl(url: string | undefined) {
    this.instance.publicHTTPUrl = url;
  }

  static getPublicOSCUrl() {
    return this.instance.publicOSCUrl;
  }

  static setPublicOSCUrl(url: string | undefined) {
    this.instance.publicOSCUrl = url;
  }

  static startPublicHosting() {
    if (ConfigService.getFlags().safeMode) {
      spooderLog('Safe mode enabled, skipping public hosting start');
      return;
    }
    const config = ConfigService.getConfig();
    if (config.network.externalhandle == 'disabled') {
      return;
    } else if (config.network.externalhandle == 'ngrok') {
      this.instance.ngrok.start();
    } else if (config.network.externalhandle == 'motherwolf') {
      this.instance.motherwolf.startTunnels();
    } else if (config.network.externalhandle == 'manual') {
      this.setPublicHTTPUrl(config.network.manual.http_url);
      this.setPublicOSCUrl(config.network.manual.tcp_url);
      webLog('Public hosting is set to manual mode');
    }
  }

  static stopPublicHosting() {
    const config = ConfigService.getConfig();
    this.setPublicHTTPUrl(undefined);
    this.setPublicOSCUrl(undefined);
    if (config.network.externalhandle == 'disabled') {
      return;
    } else if (config.network.externalhandle == 'ngrok') {
      this.instance.ngrok.stop();
    } else if (config.network.externalhandle == 'motherwolf') {
      this.instance.motherwolf.stopTunnels();
    } else if (config.network.externalhandle == 'manual') {
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
