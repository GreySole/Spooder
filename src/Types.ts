import OSC from '@spooder/osc-js';
import { Request, Response } from 'express';
import path from 'path';

export const userDir = path.join('./', 'user');
export const frontendDir = path.join('./', 'webui');

export interface KeyedObject {
  [key: string]: any;
}

export interface StreamMessage {
  userId: string;
  username: string;
  displayName: string;
  platform: string;
  channel: string;
  message: string;
  messageType: string;
  emotes: any[];
  respond: (message: string) => void;
  tags: KeyedObject;
  isBroadcaster: boolean;
  isMod: boolean;
  isSubscriber: boolean;
  isVIP: boolean;
  isFirstMessage: boolean;
  isReturningChatter: boolean;
  shareId?: string;
  triggeredEventData?: KeyedObject;
  platformEventData?: KeyedObject;
  pluginEventData?: KeyedObject;
}

export interface ShareObject {
  joinMessage: string;
  leaveMessage: string;
  streamPlatforms: KeyedObject;
  messagePlatform: string;
  sharedPlugins: KeyedObject;
  sharedCommands: KeyedObject;
}

export interface OSCConditionGroup {
  mode: 'AND' | 'OR';
  conditions: OSCCondition[];
}

export interface OSCCondition {
  arg: number;
  type: string;
  value: string;
}

export enum IntegrationModuleType {
  control = 'control',
  stream = 'stream',
  community = 'community',
}

export enum PlatformType {
  stream = 'stream',
  community = 'community',
  control = 'control',
}

export enum CoreModule {
  init = 'init',
  osc = 'osc',
  webui = 'webui',
}

export enum PermissionType {
  admin = 'a',
  mod = 'm',
}

export interface SpooderOSCMessageOptions {
  type: 'main' | 'plugin';
  pluginName?: string;
  interfaceName?: string;
}

export interface IntegrationModule {
  [key: string]: {
    subscribeToModuleEvent: (eventName: string, callback: Function) => void;
    [key: string]: any;
  };
}

export interface PluginSpooderModules {
  stream: IntegrationModule;
  community: IntegrationModule;
  control: IntegrationModule;
  [key: string]: IntegrationModule;
}

export interface PluginPublicInfo {
  publicHostUrl: string;
  publicOscUrl: string;
}

export interface PluginOscInfo {
  sendToTCP: (address: string, oscValue: any, log?: boolean) => void;
  sendToUDP: (address: string, oscValue: any, log?: boolean) => void;
  udpServers: KeyedObject;
}

export interface PluginConfigInfo {
  ownerName: string;
  botName: string;
  host: string;
  hostPort: number;
  oscTcpPort: number;
  oscUdpPort: number;
  externalHandle: string;
}

export interface PluginThemeInfo {
  webui: KeyedObject;
  spooderPet: KeyedObject;
}

export interface PluginChatInfo {
  sayInChat: (message: string, platform: string, channel: string) => void;
}

export interface PluginModule {
  dirname: string;
  modules: PluginSpooderModules;
  activePlugins: KeyedObject;
  spooderConfig: PluginConfigInfo;
  spooderTheme: PluginThemeInfo;
  osc: PluginOscInfo;
  public: PluginPublicInfo;
  chat: PluginChatInfo;
  getModule: (name: string) => KeyedObject | undefined;
  registerPluginApi: (
    router: 'local' | 'public',
    method: 'get' | 'post' | 'put' | 'delete',
    address: string,
    funct: (req: Request, res: Response) => void,
  ) => void;
  getActiveViewer: (req: Request) => KeyedObject | undefined;
  getAssetPath: (assetPath: string) => string;
  getAssetUrl: (assetPath: string) => string;
  getLocalFilePath: (filePath: string) => string;
  getSettings: () => KeyedObject | undefined;
  setSettings: (settings: KeyedObject) => void;
  getShareSettings: (shareId: string) => KeyedObject | undefined;
  setShareSettings: (shareId: string, settings: KeyedObject) => void;
  getSettingsForm: () => KeyedObject | undefined;
  setSettingsForm: (form: KeyedObject) => void;
  getEventsForm: () => KeyedObject | undefined;
  setEventsForm: (form: KeyedObject) => void;
  getOverlayUrl: () => string;
  getUtilityUrl: () => string;
  settings?: KeyedObject;
  onSettings?: (settings: KeyedObject) => void;
  onLoad?: () => void;
  onDestroy?: () => void;
  onChat?: (message: StreamMessage) => void;
  onCommunityChat?: (type: string, data: any) => void;
  onOSC?: (message: OSC.Message) => void;
  onEvent?: (event: string, data: KeyedObject) => void;
  registerExtra: (key: string, value: any) => void;
}

export enum PluginMode {
  ncc = 'NCC',
  js = 'JS',
  ts = 'TS',
  none = 'None',
}
