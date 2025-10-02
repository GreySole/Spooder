import path from 'path';
import fs from 'fs';
import { KeyedObject, userDir } from '../Types';

export function logEffects(effect: string) {
  const effects = {
    Reset: '\x1b[0m',
    Bright: '\x1b[1m',
    Dim: '\x1b[2m',
    Underscore: '\x1b[4m',
    Blink: '\x1b[5m',
    Reverse: '\x1b[7m',
    Hidden: '\x1b[8m',

    FgBlack: '\x1b[30m',
    FgRed: '\x1b[31m',
    FgGreen: '\x1b[32m',
    FgYellow: '\x1b[33m',
    FgBlue: '\x1b[34m',
    FgMagenta: '\x1b[35m',
    FgCyan: '\x1b[36m',
    FgWhite: '\x1b[37m',
    FgGray: '\x1b[90m',

    BgBlack: '\x1b[40m',
    BgRed: '\x1b[41m',
    BgGreen: '\x1b[42m',
    BgYellow: '\x1b[43m',
    BgBlue: '\x1b[44m',
    BgMagenta: '\x1b[45m',
    BgCyan: '\x1b[46m',
    BgWhite: '\x1b[47m',
    BgGray: '\x1b[100m',
  } as KeyedObject;

  if (effects[effect] != null) {
    return effects[effect];
  } else {
    return '';
  }
}

export function logToFile(filename: string, message: string, maxlines: number) {
  let logDir = path.join(userDir, 'log');
  let filePath = path.join(logDir, filename);

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
  }

  let logFile = fs.existsSync(filePath) ? fs.readFileSync(filePath, { encoding: 'utf-8' }) : '';
  if (logFile.split('\n').length >= maxlines) {
    logFile = logFile.substring(logFile.indexOf('\n', 1));
  }
  const timestamp = new Date().toISOString();
  logFile += `[${timestamp}] ${message}\n`;
  fs.writeFileSync(filePath, logFile);
}

export function getCrashFile() {
  if (fs.existsSync(path.join(userDir, 'log', 'error.json'))) {
    return JSON.parse(
      fs.readFileSync(path.join(userDir, 'log', 'error.json'), { encoding: 'utf-8' }),
    );
  }
}

export function webLog(...content: any[]) {
  console.log(logEffects('Bright'), logEffects('FgBlue'), ...content, logEffects('Reset'));
}

export function oscLog(...content: any[]) {
  console.log(logEffects('Bright'), logEffects('FgGreen'), ...content, logEffects('Reset'));
}

export function spooderLog(...content: any[]) {
  console.log(logEffects('Bright'), logEffects('FgYellow'), ...content, logEffects('Reset'));
}

export function pluginLog(pluginName: string, ...content: any[]) {
  console.log(
    logEffects('Bright'),
    logEffects('FgBlue'),
    `[${pluginName}]`,
    ...content,
    logEffects('Reset'),
  );
  logToFile(
    `${pluginName}.log`,
    `[${new Date().toISOString()}] [${pluginName}] ${content.join(' ')}`,
    1000,
  );
}
