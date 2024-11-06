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
  emotes: any[];
  tags: KeyedObject;
  isBroadcaster: boolean;
  isMod: boolean;
  isSubscriber: boolean;
  isVIP: boolean;
  isFirstMessage: boolean;
  isReturningChatter: boolean;
}

export interface ShareObject {
  joinMessage: string;
  leaveMessage: string;
  streamPlatforms: KeyedObject;
  messagePlatform: string;
  sharedPlugins: KeyedObject;
  sharedCommands: KeyedObject;
}

export interface OSCConditionObject {
  subConditions?: OSCBasicCondition[];
  subComparison?: string;
  mainCondition?: OSCBasicCondition;
}

export interface OSCBasicCondition {
  condition: string;
  value: string | number;
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
