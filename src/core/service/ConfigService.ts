import path from 'path';
import fs from 'fs-extra';
import { spooderLog } from '../Logging.ts';
import { userDir, KeyedObject } from '../../Types.ts';
import { config } from 'process';

export interface ConfigBotSection {
  owner_name: string;
  bot_name: string;
  help_command: string;
  introduction: string;
}

export interface ConfigNetworkSection {
  host: string;
  host_port: number;
  osc: OSCConfig;
  externalhandle: 'manual' | 'ngrok' | 'motherwolf' | 'disabled';
  ngrok: NgrokConfig;
  motherwolf: MotherwolfConfig;
  manual: ManualConfig;
}

interface OSCConfig {
  udp_servers: UdpServerObject;
  osc_udp_port: number;
  osc_tcp_port: number;
}

interface UdpServerObject {
  [key: string]: UdpClient;
}

interface UdpClient {
  name: string;
  ip: string;
  port: number;
}

interface NgrokConfig {
  authtoken: string;
  subdomain: string;
}

interface MotherwolfConfig {
  token: string;
  subdomain: string;
}

interface ManualConfig {
  http_url: string;
  tcp_url: string;
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

  private config: ConfigFile = {
    bot: { owner_name: '', bot_name: '', help_command: '!help', introduction: "I'm a Spooder!" },
    network: {
      host: '',
      host_port: 3000,
      osc: { udp_servers: {}, osc_udp_port: 9000, osc_tcp_port: 3333 },
      externalhandle: 'disabled',
      ngrok: { authtoken: '', subdomain: '' },
      motherwolf: { token: '', subdomain: '' },
      manual: { http_url: '', tcp_url: '' },
    },
  };

  private themes = {
    webui: {},
    modui: {},
    spooderpet: [
      { partString: '/╲', partColor: '#FFFFFF' },
      { partString: '/\\', partColor: '#FFFFFF' },
      { partString: '(', partColor: '#FFFFFF' },
      { partString: 'º', partColor: '#FFFFFF' },
      { partString: 'o', partColor: '#FFFFFF' },
      { partString: ' ', partColor: '#FFFFFF' },
      { partString: 'ω', partColor: '#FFFFFF' },
      { partString: ' ', partColor: '#FFFFFF' },
      { partString: 'o', partColor: '#FFFFFF' },
      { partString: 'º', partColor: '#FFFFFF' },
      { partString: ')', partColor: '#FFFFFF' },
      { partString: '/\\', partColor: '#FFFFFF' },
      { partString: '╱\\', partColor: '#FFFFFF' },
    ],
  } as KeyedObject;

  static getConfig(): ConfigFile {
    return ConfigService.instance.config;
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

    ConfigService.refreshConfig();
  }

  static getThemes() {
    return ConfigService.instance.themes;
  }

  static saveThemes(newThemes: KeyedObject) {
    fs.writeFileSync(userDir + '/settings/themes.json', JSON.stringify(newThemes), 'utf-8');

    ConfigService.refreshThemes();
  }

  static getFlags() {
    return ConfigService.instance.flags;
  }

  static refreshConfig() {
    try {
      const configFile = fs.readFileSync(userDir + '/settings/config.json', {
        encoding: 'utf8',
      });
      const configObj = JSON.parse(configFile);
      if (configObj.network.osc_udp_port) {
        spooderLog('Upgrading config file to new format');

        const newNetworkConfig = {
          host: configObj.network.host,
          host_port: configObj.network.host_port,
          externalhandle: configObj.network.externalhandle,
          osc: {
            udp_servers: configObj.network.udp_clients,
            osc_udp_port: configObj.network.osc_udp_port,
            osc_tcp_port: configObj.network.osc_tcp_port,
          },
          ngrok: {
            authtoken: configObj.network.ngrokauthtoken,
            subdomain: configObj.network.mw_subdomain,
          },
          motherwolf: {
            token: configObj.network.mw_token,
            subdomain: configObj.network.mw_subdomain,
          },
          manual: {
            http_url: configObj.network.external_http_url,
            tcp_url: configObj.network.external_tcp_url,
          },
        };

        const newConfig = {
          bot: configObj.bot as ConfigBotSection,
          network: newNetworkConfig as ConfigNetworkSection,
        };

        ConfigService.instance.config = newConfig;
      } else {
        ConfigService.instance.config = configObj;
      }
    } catch (e) {
      console.error(e);
    }
  }

  static refreshThemes() {
    try {
      const themesFile = fs.readFileSync(userDir + '/settings/themes.json', {
        encoding: 'utf8',
      });
      const themesObj = JSON.parse(themesFile);
      if (!themesObj.webui) {
        themesObj.webui = ConfigService.instance.themes.webui;
      }
      if (!themesObj.modui) {
        themesObj.modui = ConfigService.instance.themes.modui;
      }
      if (!themesObj.spooderpet) {
        themesObj.spooderpet = ConfigService.instance.themes.spooderpet;
      }
      const legacyKeys = [
        'longlegleft',
        'shortlegleft',
        'bodyleft',
        'littleeyeleft',
        'bigeyeleft',
        'fangleft',
        'mouth',
        'fangright',
        'bigeyeright',
        'littleeyeright',
        'bodyright',
        'shortlegright',
        'longlegright',
      ];
      if (themesObj.spooderpet.parts == null && !Array.isArray(themesObj.spooderpet)) {
        spooderLog('Upgrading themes file to new format 1');
        const parts = [] as KeyedObject[];
        for (let l of legacyKeys) {
          parts.push({
            partString: JSON.parse(JSON.stringify(themesObj.spooderpet[l])),
            partColor: JSON.parse(JSON.stringify(themesObj.spooderpet['colors'][l])),
          });
        }

        themesObj.spooderpet = parts;
      } else if (!Array.isArray(themesObj.spooderpet)) {
        spooderLog('Upgrading themes file to new format 2');
        const parts = [] as KeyedObject[];
        for (let l of legacyKeys) {
          parts.push({
            partString: JSON.parse(JSON.stringify(themesObj.spooderpet.parts[l])),
            partColor: JSON.parse(JSON.stringify(themesObj.spooderpet.colors[l])),
          });
        }
        themesObj.spooderpet = parts;
      }
      ConfigService.instance.themes = themesObj;
    } catch (e) {
      console.error(e);
    }
  }
}
