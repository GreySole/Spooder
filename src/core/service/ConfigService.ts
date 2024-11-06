import path from 'path';
import fs from 'fs-extra';
import { spooderLog } from '../Logging.ts';
import { userDir, KeyedObject } from '../../Types.ts';

export interface ConfigBotSection {
  owner_name: string;
  bot_name: string;
  help_command: string;
  introduction: string;
}

export interface ConfigNetworkSection {
  host: string;
  host_port: number;
  externalhandle: 'manual' | 'ngrok';
  ngrokauthtoken: string;
  external_http_url: string;
  external_tcp_url: string;
  udp_clients: KeyedObject;
  osc_udp_port: number;
  osc_tcp_port: number;
}

export interface ConfigFile {
  bot: ConfigBotSection;
  network: ConfigNetworkSection;
}

export default class ConfigService {
  private static instance: ConfigService;

  constructor() {
    const settingsDir = path.join(userDir, 'settings');

    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir);
    }
    if (ConfigService.instance) {
      return ConfigService.instance;
    }

    ConfigService.instance = this;
  }

  private flags = {
    initMode:
      (process.argv.length > 2 ? process.argv[2] == '-i' : false) ||
      !fs.existsSync(path.join(userDir, 'settings', 'config.json')),
    safeMode: process.argv.length > 2 ? process.argv[2] == '-e' : false,
    noAutoLogin: process.argv.length > 2 ? process.argv[2] == '-a' : false,
  };

  private settings = {
    config: {
      bot: { owner_name: '', bot_name: '', help_command: '', introduction: '' },
      network: { host_port: 3000 },
    } as ConfigFile,
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

  static getConfig(): ConfigFile {
    return ConfigService.instance.settings.config;
  }

  static saveConfig(newConfig: KeyedObject) {
    try {
      fs.writeFileSync(userDir + '/settings/config.json', JSON.stringify(newConfig), 'utf-8');
    } catch (e) {
      spooderLog('FAILED TO SAVE CONFIG FILE! Rolling back save operation.');
      fs.writeFileSync(
        userDir + '/settings/config.json',
        JSON.stringify(ConfigService.getConfig()),
        'utf-8',
      );
    }

    ConfigService.refreshFiles();
  }

  static getThemes() {
    return ConfigService.instance.settings.themes;
  }

  static saveThemes(newThemes: KeyedObject) {
    fs.writeFileSync(userDir + '/settings/themes.json', JSON.stringify(newThemes), 'utf-8');

    ConfigService.refreshFiles();
  }

  static getFlags() {
    return ConfigService.instance.flags;
  }

  static refreshFiles = () => {
    let settingsFiles = {
      config: 'config.json',
      themes: 'themes.json',
    } as KeyedObject;

    for (let s in settingsFiles) {
      try {
        const settingsFile = fs.readFileSync(userDir + '/settings/' + settingsFiles[s], {
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
          console.log('THEMES', settingsObj);
        }

        ConfigService.instance.settings[s] = settingsObj;
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

          ConfigService.instance.settings[s] = JSON.parse(newFileString);
          fs.writeFile(userDir + '/settings/' + settingsFiles[s], newFileString, 'utf-8', () => {
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
