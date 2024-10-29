import { spooderLog } from './src/core/Logging';
import fs from 'fs-extra';
import path from 'path';
import ConfigManager from './src/core/manager/ConfigManager.ts';
import { EventManager } from './src/core/manager/EventManager.ts';
import { ModerationManager } from './src/core/manager/ModerationManager.ts';
import ModuleManager from './src/core/manager/ModuleManager.ts';
import PluginManager from './src/core/manager/PluginManager.ts';
import ShareManager from './src/core/manager/ShareManager.ts';
import { backendDir, KeyedObject } from './src/Types.ts';
import { WebManager } from './src/core/manager/WebManager.ts';
import OSCManager from './src/core/manager/OSCManager.ts';
import UserManager from './src/core/manager/UserManager.ts';
import MonitorManager from './src/core/manager/MonitorManager.ts';

const logDir = path.join(backendDir, 'log');

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

new ConfigManager();
const initMode = ConfigManager.getFlags().initMode;

if (initMode) {
  new ModuleManager(() => {});
} else {
  ConfigManager.refreshFiles();
  new WebManager();
  new ModuleManager(() => {
    new EventManager();
    new ModerationManager();
    new OSCManager();
    new MonitorManager();
    new UserManager();
    new ShareManager();
    new PluginManager();
  });
}
