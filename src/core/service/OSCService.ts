import fs from 'fs';
import OSC from 'osc-js';
import { KeyedObject, StreamMessage, OSCConditionObject, userDir } from '../../Types.ts';
import { oscLog } from '../Logging.ts';
import ConfigService from './ConfigService.ts';
import { EventService, sayInChat } from './EventService.ts';
import PluginService from './PluginService.ts';
import ModuleService from './ModuleService.ts';
import MonitorService from './MonitorService.ts';
import { checkResponseTrigger } from '../util/ResponseUtil.ts';

export default class OSCService {
  private static instance: OSCService;

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
        OSCService.instance.osctunnels = JSON.parse(oscFile);
      }
    } catch (e: any) {
      console.log('OSC file error', e);
    }

    this.initializeOSC();
  }

  private osctunnels = {} as KeyedObject;
  static getTunnels() {
    return OSCService.instance.osctunnels;
  }

  static saveTunnels(newTunnels: KeyedObject) {
    OSCService.instance.osctunnels = newTunnels;
    OSCService.instance.updateOSCListeners();
    fs.writeFileSync(userDir + '/settings/osc-tunnels.json', JSON.stringify(newTunnels), 'utf-8');
  }

  private oscUDP = new OSC({
    plugin: new OSC.DatagramPlugin({
      type: 'udp4',
      open: {
        host: ConfigService.getConfig().network.host,
        port: ConfigService.getConfig().network.osc_udp_port,
        exclusive: false,
      },
      send: {
        port: ConfigService.getConfig().network.osc_udp_port,
      },
    } as KeyedObject),
  });

  private oscTCP = new OSC({
    plugin: new OSC.WebsocketServerPlugin({
      host: '0.0.0.0',
      port: ConfigService.getConfig().network.osc_tcp_port,
    }),
  });

  private udpClients = ConfigService.getConfig().network.udp_clients;

  static sendToTCP = (address: string, oscValue: any, log?: boolean) => {
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

    if (log == true) {
      MonitorService.sendToMonitor('tcp', 'send', {
        types: newMessage.types,
        address: address,
        data: oscValue,
      });
    }

    OSCService.instance.oscTCP.send(newMessage);
  };

  static sendToUDP = (dest: string, address: string, oscValue: any) => {
    var udpClients = ConfigService.getConfig().network.udp_clients;

    let valueType = 'i';
    if (typeof oscValue == 'string') {
      if (oscValue.includes(',')) {
        valueType = 'array';
        oscValue = oscValue.split(',');
        for (let o in oscValue) {
          if (!isNaN(oscValue[o])) {
            if (oscValue[o].includes('.')) {
              oscValue[o] = parseFloat(oscValue[o]);
            } else {
              oscValue[o] = parseInt(oscValue[o]);
            }
          } else {
            if (oscValue[o].toLowerCase() == 'true') {
              oscValue[o] = true;
            } else if (oscValue[o].toLowerCase() == 'false') {
              oscValue[o] = false;
            }
          }
        }
      } else {
        if (parseInt(oscValue) || parseFloat(oscValue)) {
          if (oscValue.includes('.')) {
            valueType = 'f';
            oscValue = parseFloat(oscValue);
          } else {
            valueType = 'i';
            oscValue = parseInt(oscValue);
          }
        } else {
          if (oscValue.toLowerCase() == 'true') {
            valueType = 'b';
            oscValue = true;
          } else if (oscValue.toLowerCase() == 'false') {
            valueType = 'b';
            oscValue = false;
          }
        }
      }
    } else if (Array.isArray(oscValue)) {
      valueType = 'array';
    }

    MonitorService.sendToMonitor('udp', 'send', {
      dest: dest,
      types: valueType,
      address: address,
      data: oscValue,
    });
    if (dest == '-1') {
      return;
    } else if (dest == '-2') {
      let allMessage = null;
      if (valueType.length > 1) {
        allMessage = new OSC.Message(address, ...oscValue);
      } else {
        allMessage = new OSC.Message(address, oscValue);
      }
      for (let u in udpClients) {
        OSCService.instance.oscUDP.send(allMessage, {
          host: udpClients[u].ip,
          port: udpClients[u].port,
        });
      }
    } else {
      let message = null;
      if (valueType.length > 1) {
        message = new OSC.Message(address, ...oscValue);
      } else {
        message = new OSC.Message(address, oscValue);
      }
      OSCService.instance.oscUDP.send(message, {
        host: udpClients[dest].ip,
        port: udpClients[dest].port,
      });
    }
  };

  updateOSCListeners() {
    var osc = this.oscUDP;
    var oscTCP = this.oscTCP;

    const osctunnels = OSCService.getTunnels();

    for (let o in osctunnels) {
      var oscTCP = this.oscTCP;
      if (o == 'sectionname') {
        continue;
      }
      if (osctunnels[o]['handlerFrom'] == 'tcp') {
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
            case 'tcp':
              OSCService.sendToTCP(address, message.args);
              break;
            case 'udp':
              if (OSCService.instance.udpClients[osctunnels[o]['clientTo']] != null) {
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
            default:
              OSCService.sendToUDP(osctunnels[o]['clientTo'], address, message.args.join(','));
          }
        });
      } else if (osctunnels[o]['handlerFrom'] == 'udp') {
        osc.on(osctunnels[o]['addressFrom'], (message: OSC.Message) => {
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
            case 'tcp':
              OSCService.sendToTCP(address, message.args);
              break;
            case 'udp':
              if (OSCService.instance.udpClients[osctunnels[o]['clientTo']] != null) {
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
            default:
              OSCService.sendToUDP(osctunnels[o]['clientTo'], address, message.args.join(','));
          }
        });
      }
    }
  }

  initializeOSC() {
    const sconfig = ConfigService.getConfig();
    var udpConfig = {
      type: 'udp4',
      open: {
        host: sconfig.network.host,
        port: sconfig.network.osc_udp_port,
        exclusive: false,
      },
      send: {
        port: sconfig.network.osc_udp_port,
      },
    };

    this.oscUDP = new OSC({ plugin: new OSC.DatagramPlugin(udpConfig) });
    var osc = this.oscUDP;

    osc.on('*', (message: OSC.Message) => {
      console.log('OSC UDP MESSAGE', message.address);
      const events = EventService.getEvents();
      MonitorService.sendToMonitor('udp', 'receive', {
        types: message.types,
        address: message.address,
        data: message.args,
      });

      for (let e in events) {
        if (events[e].triggers.osc) {
          if (events[e].triggers.osc.handletype == 'search') {
            if (message.address == events[e].triggers.osc.address) {
              const streamMessage = {
                userId: '',
                username: '',
                displayName: '',
                platform: 'osc',
                channel: 'udp',
                message: message.args[0],
                emotes: [],
                tags: {},
                isBroadcaster: false,
                isMod: false,
                isSubscriber: false,
                isVIP: false,
                isFirstMessage: false,
                isReturningChatter: false,
              } as StreamMessage;

              let check = checkResponseTrigger(events[e], streamMessage);

              if (check != null) {
                EventService.runCommands(check.message, e, 'osc', check.extra);
              }
            }
          } else if (message.address == events[e].triggers.osc.address) {
            const conditionsOn: OSCConditionObject[] = events[e].triggers.osc.conditionsOn;
            const comparisonOn = events[e].triggers.osc.comparisonOn as string;
            const conditionsOff = events[e].triggers.osc.conditionsOff as any[];
            const comparisonOff = events[e].triggers.osc.comparisonOff as string;

            if (
              message.args.length < conditionsOn.length ||
              message.args.length < conditionsOff.length
            ) {
              return;
            }

            function runConditions(
              args: any[],
              conditions: OSCConditionObject[],
              comparison: string,
            ) {
              const results = [];
              for (let condition = 0; condition < conditions.length; condition++) {
                if (conditions[condition].subConditions !== undefined) {
                  const subConditions = conditions[condition].subConditions!;
                  const subComparison = conditions[condition].subComparison!;
                  let conditionString = '';
                  for (let subCondition = 0; subCondition < subConditions.length; subCondition++) {
                    conditionString += '(';
                    args[condition] +
                      subConditions[subCondition].condition +
                      subConditions[subCondition].value +
                      ')';
                    if (subCondition !== subConditions.length - 1) {
                      conditionString += subComparison === 'AND' ? ' && ' : ' || ';
                    }
                  }

                  results.push(eval(conditionString));
                } else {
                  const mainCondition = conditions[condition].mainCondition!;
                  results.push(
                    eval(args[condition] + mainCondition.condition + mainCondition.value),
                  );
                }
              }
              if (comparison === 'AND') {
                return results.every((value) => value === true);
              } else {
                return results.some((value) => value === true);
              }
            }

            if (runConditions(message.args, conditionsOn, comparisonOn)) {
              const streamMessage = {
                userId: '',
                username: '',
                displayName: '',
                platform: 'osc',
                channel: 'udp',
                message: message.args[0],
                emotes: [],
                tags: {},
                isBroadcaster: false,
                isMod: false,
                isSubscriber: false,
                isVIP: false,
                isFirstMessage: false,
                isReturningChatter: false,
              } as StreamMessage;

              EventService.runCommands(streamMessage, e, 'osc');
            }

            if (runConditions(message.args, conditionsOff, comparisonOff)) {
              EventService.stopEvent(e);
            }
          }
        }
      }

      const controlModules = ModuleService.getControlModules();
      for (const c in controlModules) {
        if (controlModules[c].onOSC != null) {
          controlModules[c].onOSC(message);
        }
      }

      const activePlugins = PluginService.getActivePlugins();
      for (const p in activePlugins) {
        if (activePlugins[p].onOSC != null) {
          activePlugins[p].onOSC(message);
        }
      }
    });

    osc.on('open', () => {
      oscLog('OSC UDP OPEN');
    });

    osc.on('error', (e: any) => {
      oscLog('OSC Error: ', e);
    });
    osc.open();

    this.oscTCP = new OSC({
      plugin: new OSC.WebsocketServerPlugin({
        host: '0.0.0.0',
        port: sconfig.network.osc_tcp_port,
      }),
    });
    var oscTCP = this.oscTCP;

    oscTCP.on('open', () => {
      oscLog('OSC TCP OPEN');
    });
    oscTCP.on('error', (e: any) => {
      oscLog('OSC Error: ', e);
    });

    oscTCP.on('*', (message: OSC.Message) => {
      if (!message.address.startsWith('/frontend/monitor')) {
        MonitorService.sendToMonitor('tcp', 'receive', {
          types: message.types,
          address: message.address,
          data: message.args,
        });
      }

      let address = message.address.split('/');

      const controlModules = ModuleService.getControlModules();
      for (const c in controlModules) {
        if (controlModules[c].onOSC != null) {
          controlModules[c].onOSC(message);
        }
      }

      const activePlugins = PluginService.getActivePlugins();
      for (let p in activePlugins) {
        //Only the plugin with its name in the beginning of the address
        //will call its onOSC
        if (p.startsWith(address[1])) {
          if (activePlugins[p].onOSC != null) {
            activePlugins[p].onOSC(message);
          }
        }
      }

      /*if (address[1] == 'frontend') {
        if (address[2] == 'monitor') {
          if (address[3] == 'logging') {
            this.monitorLogs.liveLogging = message.args[0] as number;
          } else if (address[3] == 'get') {
            if (message.args[0] == 'all') {
              OSCService.sendToTCP(
                '/frontend/monitor/get/all',
                JSON.stringify(this.monitorLogs),
                false,
              );
              return;
            }
          }
        }
      }*/

      if (address[1] == 'spooder') {
        if (address[2] == 'plugin') {
          if (address[3] == 'error') {
            let errorObj = JSON.parse(message.args[0] as string);
            //oscLog("GOT PLUGIN ERROR", errorObj);
            MonitorService.pluginError(errorObj.name, errorObj.type, errorObj.message);
            return;
          }
        }
      }

      //Tell the overlay it's connected
      if (message.address.endsWith('/connect')) {
        oscTCP.send(new OSC.Message(message.address.split('/')[1] + '/connect/success', 1.0));
        return;
      }
    });

    oscTCP.open();

    this.updateOSCListeners();
  }
}
