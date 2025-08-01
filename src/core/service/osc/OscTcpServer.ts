import OSC from '@greysole/osc-js';
import http from 'http';
import { oscLog } from '../../Logging';
import ConfigService from '../ConfigService';
import ModuleService from '../ModuleService';
import MonitorService, { MonitorDataType, MonitorDirection } from '../MonitorService';
import PluginService from '../PluginService';
import WebSocket, { WebSocketServer } from 'ws';

import OSCService from '../OSCService';
import { KeyedObject, SpooderOSCMessageOptions } from '../../../Types';
import { isLocal, WebService } from '../WebService';
import { validateUser } from '../../routes/ModerationRoutes';

export default class OscTcpServer {
  public oscTcp: OSC;

  constructor() {
    const server = WebService.getServer();
    this.oscTcp = new OSC({
      plugin: new OSC.WebsocketServerPlugin({
        server: server,
        path: '/osc',
        verifyClient: (info: any, done: any) => {
          const req = info.req;
          if (isLocal(req)) {
            done(true);
          } else {
            if (validateUser(req) === 'ok') {
              done(true);
            } else {
              done(false, 403, 'Forbidden');
            }
          }
        },
      }),
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
    const controlModules = ModuleService.getControlModules();
    oscTCP.on('*', (message: OSC.Message) => {
      oscLog('OSC TCP Message: ', message);
      MonitorService.addLog(
        MonitorDataType.TCP,
        MonitorDirection.Receive,
        message.address,
        message.args,
      );
      for (const module of Object.values(controlModules)) {
        if (module.onOSC) {
          module.onOSC(message);
        }
      }

      const activePlugins = PluginService.getActivePlugins();
      for (const plugin of Object.values(activePlugins)) {
        if (plugin.onOSC) {
          plugin.onOSC(message);
        }
      }
      //Must respond success or else they'll keep sending.
      if (message.address.endsWith('/connect')) {
        this.sendToTCP(`${message.address}/success`, 1, false);
      }
    });
    oscTCP.on('error', (e: any) => {
      oscLog('OSC Error: ', e);
    });

    oscTCP.open();
  }

  public sendToTCP = (address: string, oscValue: any, log?: boolean) => {
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

    this.oscTcp.send(newMessage);

    if (log == true) {
      MonitorService.addLog(MonitorDataType.TCP, MonitorDirection.Send, address, oscValue);
    }
  };
}
