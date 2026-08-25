import { KeyedObject } from '@spooder/plugin-sdk';
import path from 'path';

export type {
  IntegrationModule,
  KeyedObject,
  OSCMessage,
  PluginChatInfo,
  PluginConfigInfo,
  PluginModule,
  PluginOscInfo,
  PluginPublicInfo,
  PluginSpooderModules,
  PluginStore,
  PluginThemeInfo,
  StreamMessage,
  NodePortDataType,
  NodePortDef,
  NodeFieldDef,
  NodeForm,
  TriggerNodeDef,
  TriggerTestDef,
  TriggerTestParam,
  ActionNodeDef,
  OperationNodeDef,
  NodeManifest,
  ActionExecutionContext,
  EventGraphNode,
  EventGraphEdge,
  EventGraph,
  EventGraphFile,
} from '@spooder/plugin-sdk';

export const userDir = path.join('./', 'user');
export const frontendDir = path.join('./', 'webui');

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

export enum PluginMode {
  ncc = 'NCC',
  js = 'JS',
  ts = 'TS',
  none = 'None',
}
