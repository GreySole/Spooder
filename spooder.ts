import { spooderLog } from './src/core/Logging.ts';
import fs from 'fs-extra';
import path from 'path';
import ConfigService from './src/core/service/ConfigService.ts';
import { EventService } from './src/core/service/EventService.ts';
import { ModerationService } from './src/core/service/ModerationService.ts';
import ModuleService from './src/core/service/ModuleService.ts';
import PluginService from './src/core/service/PluginService.ts';
import ShareService from './src/core/service/ShareService.ts';
import { userDir, KeyedObject } from './src/Types.ts';
import { WebService } from './src/core/service/WebService.ts';
import OSCService from './src/core/service/OSCService.ts';
import UserService from './src/core/service/UserService.ts';
import MonitorService from './src/core/service/MonitorService.ts';

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
    new PluginService();
    console.log('Logging into modules');
    await ModuleService.autoLoginModules();
    console.log('Refreshing share users');
    ShareService.refreshShareUsers();
    console.log('Starting Public Hosting');
    WebService.startPublicHosting();
  });
}
