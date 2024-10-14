import path from 'path';
import fs from 'fs-extra';
import { spooderLog } from '../Logging.ts';
import { backendDir, KeyedObject } from '../../Types.ts';

export default class ConfigManager {
  private static instance: ConfigManager;

  constructor() {
    const settingsDir = path.join(backendDir, 'settings');

    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir);
    }
    if (ConfigManager.instance) {
      return ConfigManager.instance;
    }

    ConfigManager.instance = this;
  }

  private flags = {
    initMode:
      (process.argv.length > 2 ? process.argv[2] == '-i' : false) ||
      !fs.existsSync(path.join(backendDir, 'settings', 'config.json')),
    safeMode: process.argv.length > 2 ? process.argv[2] == '-e' : false,
    noAutoLogin: process.argv.length > 2 ? process.argv[2] == '-a' : false,
  };

  private settings = {
    config: { network: { host_port: 3000 } },
    themes: {
      webui: {},
      modui: {},
      spooderpet: {
        parts: {
          bigeyeleft: 'o',
          bigeyeright: 'o',
          littleeyeleft: 'º',
          littleeyeright: 'º',
          fangleft: ' ',
          fangright: ' ',
          mouth: 'ω',
          bodyleft: '(',
          bodyright: ')',
          shortlegleft: '/\\',
          longlegleft: '/╲',
          shortlegright: '/\\',
          longlegright: '╱\\',
        },
        colors: {
          bigeyeleft: '#FFFFFF',
          bigeyeright: '#FFFFFF',
          littleeyeleft: '#FFFFFF',
          littleeyeright: '#FFFFFF',
          fangleft: '#FFFFFF',
          fangright: '#FFFFFF',
          mouth: '#FFFFFF',
          bodyleft: '#FFFFFF',
          bodyright: '#FFFFFF',
          shortlegleft: '#FFFFFF',
          shortlegright: '#FFFFFF',
          longlegleft: '#FFFFFF',
          longlegright: '#FFFFFF',
        },
      },
    },
  } as KeyedObject;

  static getConfig() {
    return ConfigManager.instance.settings.config;
  }

  static saveConfig(newConfig: KeyedObject) {
    try {
      fs.writeFileSync(backendDir + '/settings/config.json', JSON.stringify(newConfig), 'utf-8');
    } catch (e) {
      spooderLog('FAILED TO SAVE CONFIG FILE! Rolling back save operation.');
      fs.writeFileSync(
        backendDir + '/settings/config.json',
        JSON.stringify(ConfigManager.getConfig()),
        'utf-8',
      );
    }

    ConfigManager.refreshFiles();
  }

  static getThemes() {
    return ConfigManager.instance.settings.themes;
  }

  static saveThemes(newThemes: KeyedObject) {
    fs.writeFileSync(backendDir + '/settings/themes.json', JSON.stringify(newThemes), 'utf-8');

    ConfigManager.refreshFiles();
  }

  static getFlags() {
    return ConfigManager.instance.flags;
  }

  static refreshFiles = () => {
    let settingsFiles = {
      config: 'config.json',
      themes: 'themes.json',
    } as KeyedObject;

    for (let s in settingsFiles) {
      try {
        const settingsFile = fs.readFileSync(backendDir + '/settings/' + settingsFiles[s], {
          encoding: 'utf8',
        });

        const settingsObj = JSON.parse(settingsFile);

        if (s === 'themes') {
          if (settingsObj.spooderpet.parts == null) {
            const parts = {} as KeyedObject;
            for (let t in settingsObj.spooderpet) {
              if (t === 'colors') {
                continue;
              }
              parts[t] = JSON.parse(JSON.stringify(settingsObj.spooderpet[t]));
              delete settingsObj.spooderpet[t];
            }

            settingsObj.spooderpet.parts = parts;
          }
        }

        ConfigManager.instance.settings[s] = settingsObj;
        spooderLog('Got ' + settingsFiles[s]);
      } catch (e: any) {
        if (e.code == 'ENOENT') {
          let newFile = {} as any;
          if (s == 'users') {
            newFile = {
              trusted_users: {
                permissions: {},
                twitch: {},
                discord: {},
              },
              trusted_users_pw: {},
            };
          } else if (s == 'themes') {
            newFile = {
              webui: {},
              spooderpet: {
                parts: {
                  bigeyeleft: 'o',
                  bigeyeright: 'o',
                  littleeyeleft: 'º',
                  littleeyeright: 'º',
                  fangleft: ' ',
                  fangright: ' ',
                  mouth: 'ω',
                  bodyleft: '(',
                  bodyright: ')',
                  shortlegleft: '/\\',
                  longlegleft: '/╲',
                  shortlegright: '/\\',
                  longlegright: '╱\\',
                },
                colors: {
                  bigeyeleft: '#FFFFFF',
                  bigeyeright: '#FFFFFF',
                  littleeyeleft: '#FFFFFF',
                  littleeyeright: '#FFFFFF',
                  fangleft: '#FFFFFF',
                  fangright: '#FFFFFF',
                  mouth: '#FFFFFF',
                  bodyleft: '#FFFFFF',
                  bodyright: '#FFFFFF',
                  shortlegleft: '#FFFFFF',
                  shortlegright: '#FFFFFF',
                  longlegleft: '#FFFFFF',
                  longlegright: '#FFFFFF',
                },
              },
              modui: {},
            };
          }

          let newFileString = JSON.stringify(newFile);
          if (newFileString == '') {
            newFileString = '{}';
          }

          ConfigManager.instance.settings[s] = JSON.parse(newFileString);

          fs.writeFile(backendDir + '/settings/' + settingsFiles[s], newFileString, 'utf-8', () => {
            spooderLog(settingsFiles[s] + ' not found. New file created.', s);
          });
        } else {
          console.error(e);
          console.error("There's a problem with the " + s + ' file.');
        }
      }
    }
  };
}
