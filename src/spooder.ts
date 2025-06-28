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
import { userDir, KeyedObject } from './Types';

const logDir = path.join(userDir, 'log');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

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

function sendToApp(type: string, message: string, args?: any[]) {
  try {
    if (process.send !== undefined) {
      process.send({ type: type, message: message, args: args });
    }
  } catch (e) {}
}

process.on('uncaughtException', function (err) {
  errorLog.log = {
    time: Date.now(),
    stack: err.stack,
  };
  console.error(err);
  sendToApp('crash', err.message);
  errorLog.crashed = true;
  fs.writeFileSync(errorLogPath, JSON.stringify(errorLog));
  process.exit(1);
});

new ConfigService();
const initMode = ConfigService.getFlags().initMode;

if (initMode) {
  new ModuleService(() => {});
} else {
  ConfigService.refreshConfig();
  ConfigService.refreshThemes();
  new ShareService();
  new WebService();
  new ModuleService(async () => {
    new EventService();
    new ModerationService();
    new OSCService();
    new MonitorService();
    new UserService();
    console.log('Logging into modules');
    await ModuleService.autoLoginModules();
    console.log('Initializing plugins');
    new PluginService();

    console.log('Refreshing share users');
    ShareService.refreshShareUsers();
    console.log('Starting Public Hosting');
    WebService.startPublicHosting();
  });
}
