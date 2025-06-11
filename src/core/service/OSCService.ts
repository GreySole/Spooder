import fs from 'fs';
import { KeyedObject, SpooderOSCMessageOptions, userDir } from '../../Types.ts';
import ConfigService from './ConfigService.ts';
import OscUdpServer from './osc/OscUdpServer.ts';
import OscTcpServer from './osc/OscTcpServer.ts';

export default class OSCService {
  private static instance: OSCService;
  private osctunnels = {} as KeyedObject;
  private oscUDP!: OscUdpServer;
  private oscTCP!: OscTcpServer;
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
}
