import { Request, Response } from 'express';
import {
    KeyedObject,
    OSCMessage,
    PluginChatInfo,
    PluginConfigInfo,
    PluginModule,
    PluginOscInfo,
    PluginPublicInfo,
    PluginSpooderModules,
    PluginThemeInfo,
    StreamMessage,
} from './Types';

export default class PluginBase implements Partial<PluginModule> {
  dirname: string = '';
  modules: PluginSpooderModules = {
    stream: {},
    community: {},
    control: {},
  };
  activePlugins: KeyedObject = {};
  spooderConfig: PluginConfigInfo = {
    ownerName: '',
    botName: '',
    host: '',
    hostPort: 0,
    oscTcpPort: 0,
    oscUdpPort: 0,
    externalHandle: 'disabled',
  };
  spooderTheme: PluginThemeInfo = {
    webui: {},
    spooderPet: {},
  };
  osc: PluginOscInfo = {
    sendToTCP: (_address: string, _oscValue: any, _log?: boolean): void => {},
    sendToUDP: (_address: string, _oscValue: any, _log?: boolean): void => {},
    udpServers: {},
  };
  public: PluginPublicInfo = {
    publicHostUrl: '',
    publicOscUrl: '',
  };
  chat: PluginChatInfo = {
    sayInChat: (_message: string, _platform: string, _channel: string): void => {},
  };
  settings: KeyedObject = {};

  registerPluginApi(
    _router: 'local' | 'public',
    _method: 'get' | 'post' | 'put' | 'delete',
    _address: string,
    _funct: (req: Request, res: Response) => void,
  ): void {}

  getActiveViewer(_req: Request): KeyedObject | undefined {
    return undefined;
  }

  getAssetPath(_assetPath: string): string {
    return '';
  }

  getAssetUrl(_assetPath: string): string {
    return '';
  }

  getLocalFilePath(_filePath: string): string {
    return '';
  }

  getSettings(): KeyedObject | undefined {
    return undefined;
  }

  setSettings(_settings: KeyedObject): void {}

  getShareSettings(_shareId: string): KeyedObject | undefined {
    return undefined;
  }

  setShareSettings(_shareId: string, _settings: KeyedObject): void {}

  getSettingsForm(): KeyedObject | undefined {
    return undefined;
  }

  setSettingsForm(_form: KeyedObject): void {}

  getEventsForm(): KeyedObject | undefined {
    return undefined;
  }

  setEventsForm(_form: KeyedObject): void {}

  getOverlayUrl(): string {
    return '';
  }

  getUtilityUrl(): string {
    return '';
  }

  getModule(_name: string): KeyedObject | undefined {
    return undefined;
  }

  onSettings(_settings: KeyedObject): void {}

  onLoad(): void {}

  onDestroy(): void {}

  onChat(_message: StreamMessage): void {}

  onCommunityChat(_type: string, _data: any): void {}

  onOSC(_message: OSCMessage): void {}

  onEvent(_event: string, _data: KeyedObject): void {}

  registerExtra(_key: string, _value: any): void {}

  pluginLog(..._content: any[]): void {}
}
