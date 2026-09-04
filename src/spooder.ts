import fs from 'fs-extra';
import path from 'path';
import ConfigService from './core/service/ConfigService';
import { EventService } from './core/service/EventService';
import { ModerationService } from './core/service/ModerationService';
import ModuleService from './core/service/ModuleService';
import MonitorService from './core/service/MonitorService';
import OSCService from './core/service/OSCService';
import PluginService from './core/service/PluginService';
import ShareService from './core/service/ShareService';
import UserService from './core/service/UserService';
import { WebService } from './core/service/WebService';
import WebUIUpdateService from './core/service/WebUIUpdateService';
import { userDir, KeyedObject } from './Types';
import { connectToIPC, sendToApp } from './core/util/AppUtil';
import { spooderLog } from './core/Logging';

const logDir = path.join(userDir, 'log');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

process.stdin.on('data', (data) => {
  const input = data.toString().trim();
  if (input.startsWith('SPOODER_IPC_PIPE=')) {
    const pipeName = input.split('=')[1];
    connectToIPC(pipeName);
  }
});

const errorLogPath = path.join(logDir, 'error.json');
let errorLog = {
  crashed: false,
  log: null,
} as KeyedObject;

if (fs.existsSync(errorLogPath)) {
  try {
    let errorFile = JSON.parse(fs.readFileSync(errorLogPath, { encoding: 'utf-8' }));
    errorLog = errorFile;
  } catch (e) {}
}

process.on('uncaughtException', function (err) {
  errorLog.log = {
    time: Date.now(),
    stack: err.stack,
  };
  console.error(err);
  errorLog.crashed = true;
  fs.writeFileSync(errorLogPath, JSON.stringify(errorLog));
  process.exit(1);
});

new ConfigService();
const initMode = ConfigService.getFlags().initMode;
const safeMode = ConfigService.getFlags().safeMode;

if (initMode) {
  new ModuleService(() => {});
} else {
  ConfigService.refreshConfig();
  ConfigService.refreshThemes();
  ConfigService.refreshOverlayContainer();
  new ShareService();

  // Awaited before the server starts: a checkout with no webui/main/build has nothing to
  // serve, and starting WebService before the download finishes would answer the first
  // request - including the manager app's own readiness check - with an empty page instead
  // of the one that is a few seconds away from existing.
  WebUIUpdateService.ensureInitialDownload()
    .catch((e) => spooderLog('Initial WebUI download failed:', e.message ?? e))
    .then(() => {
      new WebService();
      WebService.waitForInitialization()
        .then(() => {
          new ModuleService(async () => {
            new EventService();
            new ModerationService();
            new OSCService();
            new MonitorService();
            new UserService();
            console.log('Logging into modules');
            if (!safeMode) {
              await ModuleService.autoLoginModules();
            } else {
              spooderLog('Safe mode enabled, skipping module auto login');
            }
            console.log('Initializing plugins');
            new PluginService();

            console.log('Refreshing share users');
            if (!safeMode) {
              ShareService.refreshShareUsers();
            } else {
              spooderLog('Safe mode enabled, skipping share user refresh');
            }

            console.log('Starting Public Hosting');
            WebService.startPublicHosting();
            sendToApp({ type: 'status', message: 'ready' });
          });
        })
        .catch((error) => {
          console.error('Failed to initialize WebService:', error);
        });
    });
}
