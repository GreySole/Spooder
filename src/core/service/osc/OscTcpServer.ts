import OSC from 'osc-js';
import http from 'http';
import { oscLog } from 'src/core/Logging';
import ConfigService from '../ConfigService';
import ModuleService from '../ModuleService';
import MonitorService, { MonitorDataType, MonitorDirection } from '../MonitorService';
import PluginService from '../PluginService';
import WebSocket, { WebSocketServer } from 'ws';

import OSCService from '../OSCServiceNew';
import { CustomWebSocketPlugin } from './OscWebSocketPlugin';
import { KeyedObject, SpooderOSCMessageOptions } from 'src/Types';

export default class OscTcpServer {
  public oscTcp: OSC;

  constructor() {
    this.oscTcp = new OSC({
      plugin: new CustomWebSocketPlugin(),
    });

    const oscTCP = this.oscTcp;

    const osctunnels = OSCService.getTunnels();

    for (let o in osctunnels) {
      oscTCP.on(osctunnels[o]['addressFrom'], (message: OSC.Message) => {
        let address = null;
        if (osctunnels[o]['addressFrom'].endsWith('*')) {
          address = message.address.replace(
            osctunnels[o]['addressFrom'].replace('*', ''),
            osctunnels[o]['addressTo'].replace('*', ''),
          );
        } else {
          address = osctunnels[o]['addressTo'];
        }
        switch (osctunnels[o]['handlerTo']) {
          case 'udp':
            const udpServers = ConfigService.getConfig().network.osc.udp_servers;
            if (udpServers[osctunnels[o]['clientTo']] != null) {
              OSCService.sendToUDP(osctunnels[o]['clientTo'], address, message.args.join(','));
            } else {
              OSCService.sendToUDP('-2', address, message.args.join(','));
            }
            break;
          case 'plugin':
            const activePlugins = PluginService.getActivePlugins();
            if (activePlugins[osctunnels[o]['clientTo']]?.onOSC != null) {
              activePlugins[osctunnels[o]['clientTo']].onOSC(message);
            }
            break;
        }
      });
    }

    oscTCP.on('open', () => {
      oscLog('OSC TCP OPEN');
    });
    oscTCP.on('error', (e: any) => {
      oscLog('OSC Error: ', e);
    });

    oscTCP.open();
  }

  public sendToTCP = (
    address: string,
    oscValue: any,
    options: SpooderOSCMessageOptions,
    log?: boolean,
  ) => {
    if (log == null) {
      log = true;
    }
    if (typeof oscValue == 'object' && !Array.isArray(oscValue)) {
      oscValue = JSON.stringify(oscValue);
    }
    let newMessage = null;
    if (oscValue instanceof Array == false) {
      newMessage = new OSC.Message(address, oscValue);
    } else {
      newMessage = new OSC.Message(address, ...oscValue);
    }

    this.oscTcp.send(newMessage, options);

    if (log == true) {
      MonitorService.addLog(MonitorDataType.TCP, MonitorDirection.Send, address, oscValue);
    }
  };
}
