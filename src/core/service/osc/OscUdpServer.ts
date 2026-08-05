import OSC from '@spooder/osc-js';
import { oscLog, spooderLog } from '../../Logging';
import { triggerExistsAndEnabled } from '../../util/EventTriggerUtil';
import { checkResponseTrigger } from '../../util/ResponseUtil';
import { StreamMessage, OSCConditionGroup } from '../../../Types';
import ConfigService from '../ConfigService';
import { EventService } from '../EventService';
import ModuleService from '../ModuleService';
import MonitorService, { MonitorDataType, MonitorDirection } from '../MonitorService';
import OSCService from '../OSCService';
import PluginService from '../PluginService';

export default class OscUdpServer {
  public oscUdp: OSC;
  constructor() {
    const sconfig = ConfigService.getConfig();
    const udpConfig = {
      type: 'udp4',
      open: {
        host: sconfig.network.host,
        port: sconfig.network.osc.osc_udp_port,
        exclusive: false,
      },
      send: {
        port: sconfig.network.osc.osc_udp_port,
      },
    };
    this.oscUdp = new OSC({ plugin: new OSC.DatagramPlugin(udpConfig) });
    this.oscUdp.on('*', (message: OSC.Message) => {
      const events = EventService.getEvents();

      MonitorService.addLog(
        MonitorDataType.UDP,
        MonitorDirection.Receive,
        message.address,
        message.args,
      );

      for (const e of Object.keys(events)) {
        if (triggerExistsAndEnabled(events[e], 'osc')) {
          if (events[e].triggers.osc.handletype == 'search') {
            if (message.address == events[e].triggers.osc.address) {
              const searchArg = events[e].triggers.osc.search?.arg ?? 0;
              const streamMessage = {
                userId: '',
                username: '',
                displayName: '',
                platform: 'osc',
                channel: 'udp',
                message: `${message.args[searchArg]}`,
                messageType: 'osc',
                respond: () => {},
                emotes: [],
                tags: {},
                isBroadcaster: false,
                isMod: false,
                isSubscriber: false,
                isVIP: false,
                isFirstMessage: false,
                isReturningChatter: false,
              } as StreamMessage;

              const check = checkResponseTrigger(events[e], streamMessage);

              if (check != null) {
                EventService.runCommands(check.message, e, 'osc', check.extra);
              }
            }
          } else if (message.address == events[e].triggers.osc.address) {
            const conditions = EventService.eventIsRunning(e)
              ? (events[e].triggers.osc.condition_groups_off as OSCConditionGroup[])
              : (events[e].triggers.osc.condition_groups_on as OSCConditionGroup[]);

            if (!conditions) {
              return;
            }

            if (message.args.length < conditions?.length) {
              return;
            }

            function runConditions(args: any[], conditionGroups: OSCConditionGroup[]) {
              for (let groupIndex = 0; groupIndex < conditionGroups.length; groupIndex++) {
                const groupConditionMode = conditionGroups[groupIndex].mode;
                const conditionValues = conditionGroups[groupIndex].conditions;
                if (groupConditionMode === 'AND') {
                  for (
                    let conditionIndex = 0;
                    conditionIndex < conditionValues.length;
                    conditionIndex++
                  ) {
                    const conditionArg = conditionValues[conditionIndex].arg;
                    const conditionType = conditionValues[conditionIndex].type;
                    const conditionValue = conditionValues[conditionIndex].value;

                    if (
                      eval(
                        args[conditionArg ?? conditionIndex] + conditionType + conditionValue,
                      ) === false
                    ) {
                      return false;
                    }
                  }
                  return true;
                } else if (groupConditionMode === 'OR') {
                  for (
                    let conditionIndex = 0;
                    conditionIndex < conditionValues.length;
                    conditionIndex++
                  ) {
                    const conditionArg = conditionValues[conditionIndex].arg;
                    const conditionType = conditionValues[conditionIndex].type;
                    const conditionValue = conditionValues[conditionIndex].value;
                    if (
                      eval(
                        args[conditionArg ?? conditionIndex] + conditionType + conditionValue,
                      ) === true
                    ) {
                      return true;
                    }
                  }
                  return false;
                }
              }
            }

            if (EventService.eventIsRunning(e)) {
              if (runConditions(message.args, conditions)) {
                EventService.stopEvent(e);
              }
            } else {
              if (runConditions(message.args, conditions)) {
                const streamMessage = {
                  userId: '',
                  username: '',
                  displayName: '',
                  platform: 'osc',
                  channel: 'udp',
                  message: `${message.args[0]}`,
                  messageType: 'osc',
                  respond: () => {},
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
            }
          }
        }

        const controlModules = ModuleService.getControlModules();
        for (const c in controlModules) {
          if (controlModules[c].onOSC != null) {
            controlModules[c].onOSC(message);
          }
        }
      }
      const activePlugins = PluginService.getActivePlugins();
      for (const p in activePlugins) {
        if (activePlugins[p].onOSC != null) {
          activePlugins[p].onOSC(message);
        }
      }
    });

    this.oscUdp.on('open', () => {
      oscLog('OSC UDP OPEN');
    });

    this.oscUdp.on('error', (e: any) => {
      oscLog('OSC Error: ', e);
    });
    const osctunnels = OSCService.getTunnels();
    for (let o in osctunnels) {
      this.oscUdp.on(osctunnels[o]['addressFrom'], (message: OSC.Message) => {
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
            OSCService.sendToTCP(address, message.args, true);
            break;
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
          default:
            OSCService.sendToUDP(osctunnels[o]['clientTo'], address, message.args.join(','));
        }
      });
    }

    this.oscUdp.open();
  }

  public sendToUDP = (dest: string, address: string, oscValue: any) => {
    const udpServers = OSCService.getUdpServers();

    type OSCArgType = 'i' | 'f' | 's' | 'b' | 'h' | 't' | 'd' | 'T' | 'F' | 'N' | 'I';
    let valueType: OSCArgType = 'i';
    spooderLog('Sending OSC UDP to ', dest, address, oscValue);
    function getValueType(value: any): { valueType: OSCArgType; value: any } {
      spooderLog('Determining OSC Value Type for: ', value);
      if (!isNaN(Number(value))) {
        if (String(value).includes('.')) {
          spooderLog('OSC Value is float');
          valueType = 'f';
          value = parseFloat(value);
        } else {
          spooderLog('OSC Value is integer');
          valueType = 'i';
          value = parseInt(value);
        }
      } else {
        if (String(value).toLowerCase() == 'true') {
          valueType = 'b';
          value = true;
        } else if (String(value).toLowerCase() == 'false') {
          valueType = 'b';
          value = false;
        } else {
          valueType = 's';
          value = `${value}`;
        }
      }
      return { valueType, value };
    }

    if (dest == '-1') {
      return;
    }

    const message = new OSC.TypedMessage(address, []);

    if (typeof oscValue == 'string') {
      spooderLog('OSC Value is string');
      if (oscValue.includes(',')) {
        oscValue = oscValue.split(',');
        for (let o in oscValue) {
          const val = getValueType(oscValue[o]);
          message.add(val.valueType, val.value);
        }
      } else {
        const val = getValueType(oscValue);
        message.add(val.valueType, val.value);
      }
    } else if (Array.isArray(oscValue)) {
      for (let o in oscValue) {
        const val = getValueType(oscValue[o]);
        message.add(val.valueType, val.value);
      }
    } else {
      const val = getValueType(oscValue);
      message.add(val.valueType, val.value);
    }

    if (dest == '-2') {
      for (let u in udpServers) {
        this.oscUdp.send(message, {
          host: udpServers[u].ip,
          port: udpServers[u].port,
        });
      }
    } else {
      this.oscUdp.send(message, {
        host: udpServers[dest].ip,
        port: udpServers[dest].port,
      });
    }

    const oscValueLog = Array.isArray(oscValue) ? oscValue : [oscValue];

    MonitorService.addLog(MonitorDataType.UDP, MonitorDirection.Send, address, [
      dest,
      ...oscValueLog,
    ]);
  };

  public getUdpServer() {
    return this.oscUdp;
  }
}
