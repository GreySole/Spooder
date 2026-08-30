import fs from 'fs-extra';
import path from 'path';
import { KeyedObject, userDir } from '../../Types';
import { spooderLog } from '../Logging';
import { sendToApp } from '../util/AppUtil';
import BackupRestoreService from './BackupRestoreService';
import WebUIUpdateService from './WebUIUpdateService';

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

export interface UdpServerObject {
  [key: string]: UdpClient;
}

export interface UdpClient {
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

interface BackupSection {
  auto_backup: {
    settings: {
      enabled: boolean;
      schedule: string;
      max_backups: number;
    };
    plugins: {
      enabled: boolean;
      schedule: string;
      max_backups: number;
    };
  };
}

interface WebUIUpdateSection {
  enabled: boolean;
  schedule: string;
}

// Only ever checks for plugin updates and flags them - installs stay manual, since a
// plugin reload mid-stream is the user's call to make.
interface PluginUpdateSection {
  enabled: boolean;
  schedule: string;
}

export interface ConfigFile {
  bot: ConfigBotSection;
  network: ConfigNetworkSection;
  backup: BackupSection;
  webui_update: WebUIUpdateSection;
  plugin_update: PluginUpdateSection;
}

export interface OverlayContainerEntry {
  pluginName: string;
  enabled: boolean;
  x: number; // percent of container width, 0-100
  y: number; // percent of container height, 0-100
  width: number; // percent of container width, 0-100
  height: number; // percent of container height, 0-100
}

export interface OverlayContainerConfig {
  order: OverlayContainerEntry[];
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
    safeMode: process.argv.length > 2 ? process.argv[2] == '-s' : false,
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
    backup: {
      auto_backup: {
        settings: {
          enabled: false,
          schedule: '0 0 * * *',
          max_backups: 5,
        },
        plugins: {
          enabled: false,
          schedule: '0 0 * * *',
          max_backups: 5,
        },
      },
    },
    webui_update: {
      enabled: false,
      schedule: '0 0 * * *',
    },
    plugin_update: {
      enabled: false,
      schedule: '0 0 * * *',
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

  private overlayContainer: OverlayContainerConfig = { order: [] };

  static getConfig(): ConfigFile {
    return ConfigService.instance.config;
  }

  static saveConfig(newConfig: KeyedObject) {
    try {
      fs.writeFileSync(userDir + '/settings/config.json', JSON.stringify(newConfig), 'utf-8');
      sendToApp({ action: 'refresh_info' });
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
    sendToApp({ action: 'refresh_info' });
  }

  static getFlags() {
    return ConfigService.instance.flags;
  }

  static getOverlayContainer(): OverlayContainerConfig {
    return ConfigService.instance.overlayContainer;
  }

  static saveOverlayContainer(newConfig: OverlayContainerConfig) {
    fs.writeFileSync(
      userDir + '/settings/overlay_container.json',
      JSON.stringify(newConfig),
      'utf-8',
    );

    ConfigService.refreshOverlayContainer();
    sendToApp({ action: 'refresh_info' });
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
            subdomain: configObj.network.ngroksubdomain,
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
          backup: configObj.backup as BackupSection,
          webui_update:
            (configObj.webui_update as WebUIUpdateSection) ||
            ConfigService.instance.config.webui_update,
          plugin_update:
            (configObj.plugin_update as PluginUpdateSection) ||
            ConfigService.instance.config.plugin_update,
        };

        ConfigService.instance.config = newConfig;
      } else {
        if (!configObj.webui_update) {
          configObj.webui_update = ConfigService.instance.config.webui_update;
        }
        if (!configObj.plugin_update) {
          configObj.plugin_update = ConfigService.instance.config.plugin_update;
        }
        ConfigService.instance.config = configObj;
      }
      BackupRestoreService.InitSchedule();
      WebUIUpdateService.InitSchedule();
      // Loaded lazily on purpose: PluginRepoService pulls in the whole plugin runtime,
      // which imports ConfigService back. A static import here would make that cycle part
      // of module load order instead of a runtime call.
      import('./PluginRepoService')
        .then((m) => m.default.InitSchedule())
        .catch((e) => spooderLog('Failed to schedule plugin update checks:', e.message ?? e));
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

  static refreshOverlayContainer() {
    const overlayContainerPath = userDir + '/settings/overlay_container.json';
    if (fs.existsSync(overlayContainerPath)) {
      try {
        const overlayContainerFile = fs.readFileSync(overlayContainerPath, { encoding: 'utf8' });
        ConfigService.instance.overlayContainer = JSON.parse(overlayContainerFile);
      } catch (e) {
        console.error(e);
      }
    } else {
      spooderLog('overlay_container.json not found');
    }
  }
}
