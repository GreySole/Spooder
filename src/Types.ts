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
