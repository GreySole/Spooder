export interface KeyedObject {
  [key: string]: any;
}

// A minimal, framework-agnostic stand-in for the request/response objects passed to
// registerPluginApi handlers. Spooder's backend happens to use express, so the real
// objects are express Request/Response instances at runtime - but plugin-sdk doesn't
// depend on express itself just to describe the handful of properties/methods plugins
// actually use, so it's not a dependency every plugin has to carry around.
export interface PluginApiRequest {
  query: KeyedObject;
  params: KeyedObject;
  body: any;
  headers: KeyedObject;
  cookies: KeyedObject;
}

export interface PluginApiResponse {
  status(code: number): PluginApiResponse;
  send(body?: any): void;
  json(body?: any): void;
}

// Which module produced a message: a stream module's registered name (the `name` in its
// package.json `spooder_module` block), or 'osc' for the StreamMessage the OSC layer synthesizes
// for OSC-triggered events - nothing chatted that one.
//
// Left open rather than closed to the names below: stream modules are discovered at load time,
// so a module built against this SDK has to be able to identify itself without the SDK knowing
// about it first. The listed names are the ones this repo ships, and they autocomplete.
export type StreamPlatform = 'twitch' | 'osc' | (string & {});

export interface StreamMessage {
  userId: string;
  username: string;
  displayName: string;
  platform: StreamPlatform;
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

type MessageArgValue = number | string | Blob | true | false | null;

export interface OSCMessage {
  address: string | string[];
  args: MessageArgValue[];
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
    funct: (req: PluginApiRequest, res: PluginApiResponse) => void,
  ) => void;
  getActiveViewer: (req: PluginApiRequest) => KeyedObject | undefined;
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
  onOSC?: (message: OSCMessage) => void;
  onEvent?: (event: string, data: KeyedObject) => void;
  registerExtra: (key: string, value: any) => void;
  pluginLog: (...content: any[]) => void;
}
