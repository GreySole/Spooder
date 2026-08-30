import fs from 'fs';
import { KeyedObject, SpooderOSCMessageOptions, userDir } from '../../Types';
import { oscLog } from '../Logging';
import ConfigService, { UdpServerObject } from './ConfigService';
import ModuleService from './ModuleService';
import OscChannelServer from './osc/OscChannelServer';
import OscUdpServer from './osc/OscUdpServer';
import OscTcpServer from './osc/OscTcpServer';

export default class OSCService {
  private static instance: OSCService;
  private osctunnels = {} as KeyedObject;
  private oscUDP!: OscUdpServer;
  private oscTCP!: OscTcpServer;
  private oscChannels = new Map<string, OscChannelServer>();
  public static sendToTCP: (address: string, oscValue: any, log?: boolean) => void;
  public static sendToUDP: (client: string, address: string, oscValue: any, log?: boolean) => void;

  constructor() {
    if (OSCService.instance) {
      return OSCService.instance;
    }

    OSCService.instance = this;

    try {
      const oscFilePath = userDir + '/settings/osc-tunnels.json';
      if (!fs.existsSync(oscFilePath)) {
        OSCService.saveTunnels({});
      } else {
        const oscFile = fs.readFileSync(oscFilePath, {
          encoding: 'utf8',
        });
        this.osctunnels = JSON.parse(oscFile);
      }
    } catch (e: any) {
      console.log('OSC file error', e);
    }

    this.oscTCP = new OscTcpServer();
    this.oscUDP = new OscUdpServer();

    OSCService.sendToTCP = this.oscTCP.sendToTCP.bind(this.oscTCP);
    OSCService.sendToUDP = this.oscUDP.sendToUDP.bind(this.oscUDP);

    this.openModuleChannels();
  }

  // Modules load before this service is constructed, so by now every module that wants its
  // own socket has declared it. Channels are opened eagerly rather than on first send: the
  // webui connects to /osc/<tag> as soon as its deck mounts, and an unregistered path would
  // refuse the handshake.
  private openModuleChannels() {
    const controlModules = ModuleService.getControlModules();
    for (const [name, module] of Object.entries(controlModules)) {
      const tag = module?.oscChannel;
      if (!tag) {
        continue;
      }
      if (this.oscChannels.has(tag)) {
        oscLog(`OSC channel '${tag}' requested by module ${name} is already open. Skipping.`);
        continue;
      }
      this.oscChannels.set(
        tag,
        new OscChannelServer(tag, (message) => {
          if (module.onOSC) {
            module.onOSC(message);
          }
        }),
      );
    }
  }

  static getChannel(tag: string) {
    return OSCService.instance?.oscChannels.get(tag);
  }

  // Send on a module's private channel. Silently drops if the module never declared one,
  // which keeps a module usable when its channel isn't open (e.g. during init mode).
  static sendToChannel(tag: string, address: string, oscValue: any, log?: boolean) {
    const channel = OSCService.getChannel(tag);
    if (!channel) {
      return;
    }
    channel.send(address, oscValue, log);
  }

  static getTunnels() {
    return OSCService.instance.osctunnels;
  }

  static saveTunnels(newTunnels: KeyedObject) {
    fs.writeFileSync(userDir + '/settings/osc-tunnels.json', JSON.stringify(newTunnels), 'utf-8');
  }

  static getUdpServers() {
    return ConfigService.getConfig().network.osc.udp_servers;
  }

  // Replaces the whole destination map, the way saveTunnels does - the webui edits the list as
  // a unit and posts it back. Nothing here has to be restarted: sendToUDP reads the map on
  // every send, so a destination added now is usable on the next OSC Send with no reconnect.
  static saveUdpServers(udpServers: UdpServerObject) {
    const config = ConfigService.getConfig();
    ConfigService.saveConfig({
      ...config,
      network: {
        ...config.network,
        osc: { ...config.network.osc, udp_servers: udpServers },
      },
    });
  }
}
