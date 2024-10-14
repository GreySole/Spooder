import fs from 'fs';
import OSC from 'osc-js';
import {
  KeyedObject,
  StreamMessage,
  OSCConditionObject,
  PermissionType,
  backendDir,
} from '../../Types.ts';
import { oscLog } from '../Logging.ts';
import ConfigManager from './ConfigManager.ts';
import UserManager from './UserManager.ts';
import { EventManager, checkResponseTrigger, sayInChat } from './EventManager.ts';
import { ModerationManager } from './ModerationManager.ts';
import PluginManager from './PluginManager.ts';
import ModuleManager from './ModuleManager.ts';

export default class OSCManager {
  private static instance: OSCManager;

  constructor() {
    if (OSCManager.instance) {
      return OSCManager.instance;
    }

    OSCManager.instance = this;

    try {
      const oscFilePath = backendDir + '/settings/osc-tunnels.json';
      if (!fs.existsSync(oscFilePath)) {
        OSCManager.saveTunnels({});
      } else {
        const oscFile = fs.readFileSync(oscFilePath, {
          encoding: 'utf8',
        });
        OSCManager.instance.osctunnels = JSON.parse(oscFile);
      }
    } catch (e: any) {
      console.log('OSC file error', e);
    }

    this.initializeOSC();
  }

  private osctunnels = {} as KeyedObject;
  static getTunnels() {
    return OSCManager.instance.osctunnels;
  }

  static saveTunnels(newTunnels: KeyedObject) {
    OSCManager.instance.osctunnels = newTunnels;
    OSCManager.instance.updateOSCListeners();
    fs.writeFileSync(
      backendDir + '/settings/osc-tunnels.json',
      JSON.stringify(newTunnels),
      'utf-8',
    );
  }

  private osc = new OSC({
    plugin: new OSC.DatagramPlugin({
      type: 'udp4',
      open: {
        host: ConfigManager.getConfig().network.host,
        port: ConfigManager.getConfig().network.osc_udp_port,
        exclusive: false,
      },
      send: {
        port: ConfigManager.getConfig().network.osc_udp_port,
      },
    } as KeyedObject),
  });

  private oscTCP = new OSC({
    plugin: new OSC.WebsocketServerPlugin({
      host: '0.0.0.0',
      port: ConfigManager.getConfig().network.osc_tcp_port,
    }),
  });

  private udpClients = ConfigManager.getConfig().network.udp_clients;
  private monitorLogs = {
    logs: [] as KeyedObject[],
    pluginlogs: [] as KeyedObject[],
    liveLogging: 0,
  };

  pluginError = (pluginName: string, type: string, message: string) => {
    let timestamp = Date.now();
    this.monitorLogs.pluginlogs.push({
      timestamp: timestamp,
      name: pluginName,
      type: type,
      message: message,
    });
    if (this.monitorLogs.pluginlogs.length > 1000) {
      this.monitorLogs.pluginlogs.shift();
    }

    if (this.monitorLogs.liveLogging == 1) {
      this.oscTCP.send(
        new OSC.Message(
          '/frontend/monitor/plugin',
          JSON.stringify({
            timestamp: timestamp,
            name: pluginName,
            type: type,
            message: message,
          }),
        ),
      );
    }
  };

  static sendToMonitor = (proto: string, direction: string, data: KeyedObject) => {
    let timestamp = Date.now();
    OSCManager.instance.monitorLogs.logs.push({
      timestamp: timestamp,
      type: 'osc',
      protocol: proto,
      direction: direction,
      data: data,
    });
    if (OSCManager.instance.monitorLogs.logs.length > 1000) {
      OSCManager.instance.monitorLogs.logs.shift();
    }
    if (OSCManager.instance.monitorLogs.liveLogging == 1) {
      OSCManager.instance.oscTCP.send(
        new OSC.Message(
          '/frontend/monitor/osc',
          JSON.stringify({
            timestamp: timestamp,
            type: 'osc',
            protocol: proto,
            direction: direction,
            data: data,
          }),
        ),
      );
    }
  };

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
      OSCManager.sendToMonitor('tcp', 'send', {
        types: newMessage.types,
        address: address,
        data: oscValue,
      });
    }

    OSCManager.instance.oscTCP.send(newMessage);
  };

  static sendToUDP = (dest: string, address: string, oscValue: any) => {
    var udpClients = ConfigManager.getConfig().network.udp_clients;

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

    OSCManager.sendToMonitor('udp', 'send', {
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
        OSCManager.instance.osc.send(allMessage, {
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
      OSCManager.instance.osc.send(message, {
        host: udpClients[dest].ip,
        port: udpClients[dest].port,
      });
    }
  };

  updateOSCListeners() {
    var osc = this.osc;
    var oscTCP = this.oscTCP;

    const osctunnels = OSCManager.getTunnels();

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
              OSCManager.sendToTCP(address, message.args);
              break;
            case 'udp':
              if (OSCManager.instance.udpClients[osctunnels[o]['clientTo']] != null) {
                OSCManager.sendToUDP(osctunnels[o]['clientTo'], address, message.args.join(','));
              } else {
                OSCManager.sendToUDP('-2', address, message.args.join(','));
              }
              break;
            case 'plugin':
              const activePlugins = PluginManager.getActivePlugins();
              if (activePlugins[osctunnels[o]['clientTo']]?.onOSC != null) {
                activePlugins[osctunnels[o]['clientTo']].onOSC(message);
              }
              break;
            default:
              OSCManager.sendToUDP(osctunnels[o]['clientTo'], address, message.args.join(','));
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
              OSCManager.sendToTCP(address, message.args);
              break;
            case 'udp':
              if (OSCManager.instance.udpClients[osctunnels[o]['clientTo']] != null) {
                OSCManager.sendToUDP(osctunnels[o]['clientTo'], address, message.args.join(','));
              } else {
                OSCManager.sendToUDP('-2', address, message.args.join(','));
              }

              break;
            case 'plugin':
              const activePlugins = PluginManager.getActivePlugins();
              if (activePlugins[osctunnels[o]['clientTo']]?.onOSC != null) {
                activePlugins[osctunnels[o]['clientTo']].onOSC(message);
              }
              break;
            default:
              OSCManager.sendToUDP(osctunnels[o]['clientTo'], address, message.args.join(','));
          }
        });
      }
    }
  }

  initializeOSC() {
    const sconfig = ConfigManager.getConfig();
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

    this.osc = new OSC({ plugin: new OSC.DatagramPlugin(udpConfig) });
    var osc = this.osc;

    osc.on('*', (message: OSC.Message) => {
      console.log('OSC UDP MESSAGE', message.address);
      const events = EventManager.getEvents();
      OSCManager.sendToMonitor('udp', 'receive', {
        types: message.types,
        address: message.address,
        data: message.args,
      });

      for (let e in events) {
        if (events[e].triggers.osc?.enabled == true) {
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
                EventManager.runCommands(check.message, e, 'osc', check.extra);
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

              EventManager.runCommands(streamMessage, e, 'osc');
            }

            if (runConditions(message.args, conditionsOff, comparisonOff)) {
              EventManager.stopEvent(e);
            }
          }
        }
      }

      const controlModules = ModuleManager.getControlModules();
      for (const c in controlModules) {
        if (controlModules[c].onOSC != null) {
          controlModules[c].onOSC(message);
        }
      }

      const activePlugins = PluginManager.getActivePlugins();
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
        OSCManager.sendToMonitor('tcp', 'receive', {
          types: message.types,
          address: message.address,
          data: message.args,
        });
      }

      let address = message.address.split('/');

      const controlModules = ModuleManager.getControlModules();
      for (const c in controlModules) {
        if (controlModules[c].onOSC != null) {
          controlModules[c].onOSC(message);
        }
      }

      const activePlugins = PluginManager.getActivePlugins();
      for (let p in activePlugins) {
        //Alert box plugins need to listen for any connect messages from other plugins
        if (activePlugins[p].isAlertBox != null) {
          activePlugins[p].onOSC(message);
          continue;
        }

        //Only the plugin with its name in the beginning of the address
        //will call its onOSC
        if (p.startsWith(address[1])) {
          if (activePlugins[p].onOSC != null) {
            activePlugins[p].onOSC(message);
          }
        }
      }

      if (address[1] == 'frontend') {
        if (address[2] == 'monitor') {
          if (address[3] == 'logging') {
            this.monitorLogs.liveLogging = message.args[0] as number;
          } else if (address[3] == 'get') {
            if (message.args[0] == 'all') {
              OSCManager.sendToTCP(
                '/frontend/monitor/get/all',
                JSON.stringify(this.monitorLogs),
                false,
              );
              return;
            }
          }
        }
      }

      if (address[1] == 'spooder') {
        if (address[2] == 'plugin') {
          if (address[3] == 'error') {
            let errorObj = JSON.parse(message.args[0] as string);
            //oscLog("GOT PLUGIN ERROR", errorObj);
            this.pluginError(errorObj.name, errorObj.type, errorObj.message);
            return;
          }
        }
      }

      if (address[1] == 'mod') {
        const activeMod = UserManager.getActiveUserFromToken(message.args[0] as string);
        if (activeMod != 'local') {
          if (
            activeMod == null ||
            activeMod != address[2] ||
            !UserManager.checkPermission(activeMod, [PermissionType.admin, PermissionType.mod])
          ) {
            console.log('Unauthorized mod OSC!', address[2], message.args[0]);
            return;
          }
        }
        if (address[3] == 'lock') {
          let lockString = message.args[1] === true ? 'lock' : 'unlock';
          if (address[4] == 'event') {
            ModerationManager.lockEvent(message.args[1] as string, address[5]);
            sayInChat(address[2] + ' ' + lockString + 'ed ' + address[5]);
          } else if (address[4] == 'plugin') {
            let pluginName = activePlugins[address[5]]?.name;

            if (address[6] == null) {
              ModerationManager.lockPlugin(message.args[1] as string, address[5]);
              sayInChat(address[2] + ' ' + lockString + 'ed ' + pluginName);
            } else {
              ModerationManager.lockPlugin(message.args[1] as string, address[5], address[6]);
              sayInChat(address[2] + ' ' + lockString + 'ed ' + address[6] + ' in ' + pluginName);
            }
          }
        } else if (address[3] == 'blacklist') {
          ModerationManager.blacklistUser(address[4], -1);
          sayInChat(
            address[2] + (message.args[1] == 1 ? ' blacklisted ' : ' unblacklisted ') + address[4],
          );
        } else if (address[3] == 'spamguard') {
          ModerationManager.setSpamGuard(address[4]);

          sayInChat(
            address[2] + ' turned ' + (message.args[1] == 1 ? ' on ' : ' off ') + 'Spam Guard',
          );
        } else if (address[3] == 'get') {
          if (address[4] == 'all') {
            const events = EventManager.getEvents();
            const modlocks = ModerationManager.getModlocks();
            OSCManager.sendToTCP(
              '/mod/' + address[2] + '/get',
              JSON.stringify({
                _events: Object.keys(events),
                _plugins: Object.keys(activePlugins),
                _modlocks: modlocks,
              }),
            );
          }
        } else if (address[3] == 'save') {
          if (address[4] == 'theme') {
            const themes = ConfigManager.getThemes();
            if (themes.modui[address[2]] == null) {
              themes.modui[address[2]] = {};
            }
            themes.modui[address[2]] = JSON.parse(message.args[1] as string);
            ConfigManager.saveThemes(themes);
            OSCManager.sendToTCP('/mod/' + address[2] + '/save/theme', message.args[1]);
          }
        }
        OSCManager.sendToTCP(message.address, message.args[1]);
        return;
      }

      //Tell the overlay it's connected
      if (message.address.endsWith('/connect')) {
        oscTCP.send(new OSC.Message(message.address.split('/')[1] + '/connect/success', 1.0));
        return;
      }

      //Legacy block to get plugin settings. They're set when they're loaded now
      //but this can be used for on the fly updates
      if (message.address.startsWith('/settings')) {
        let addressSplit = message.address.split('/');
        let pluginName = addressSplit[addressSplit.length - 1];
        let settingsJSON = fs.readFileSync(
          backendDir + '/plugins/' + pluginName + '/settings.json',
          { encoding: 'utf8' },
        );
        oscTCP.send(new OSC.Message('/' + pluginName + '/settings', settingsJSON));
        return;
      }
    });

    oscTCP.open();

    this.updateOSCListeners();
  }
}
