import { KeyedObject, backendDir, StreamMessage } from '../../Types.ts';
import { spooderLog } from '../Logging.ts';
import ConfigManager from './ConfigManager.ts';
import { ModerationManager } from './ModerationManager.ts';
import ModuleManager from './ModuleManager.ts';
import OSCManager from './OSCManager.ts';
import PluginManager from './PluginManager.ts';
import fs from 'fs';

let eventstorage = {} as KeyedObject;

if (fs.existsSync(backendDir + '/settings/eventstorage.json')) {
  try {
    eventstorage = JSON.parse(
      fs.readFileSync(backendDir + '/settings/eventstorage.json', { encoding: 'utf-8' }),
    );
  } catch (e) {
    spooderLog('Error accessing Event Storage. Event Storage remains empty.');
  }
}

export function saveEventStorage() {
  fs.writeFileSync(
    backendDir + '/settings/eventstorage.json',
    JSON.stringify(eventstorage),
    'utf-8',
  );
}

function matchConditions(a: string, b: string) {
  if (a.includes('|')) {
    let cSplitOR = a.split('|');
    //console.log(cSplitOR);
    for (let c in cSplitOR) {
      if (cSplitOR[c].startsWith('>')) {
        if (b.startsWith(cSplitOR[c].replace('>', ''))) {
          return b;
        }
      } else if (cSplitOR[c].startsWith('<')) {
        if (b.endsWith(cSplitOR[c].replace('<', ''))) {
          return b;
        }
      } else if (cSplitOR[c].toLowerCase() == b.toLowerCase()) {
        return b;
      }
    }
    return false;
  } else if (a.startsWith('>')) {
    if (b.startsWith(a.replace('>', ''))) {
      return b;
    } else {
      return false;
    }
  } else if (a.startsWith('<')) {
    if (b.endsWith(a.replace('<', ''))) {
      return b;
    } else {
      return false;
    }
  } else if (a.toLowerCase() == b.toLowerCase()) {
    return b;
  } else {
    return false;
  }
}

export function checkResponseTrigger(eventData: KeyedObject, message: StreamMessage) {
  let searchMode = eventData.triggers.chat.search
    ? true
    : eventData.triggers.osc.handletype == 'search'
      ? true
      : false;
  let command = '';
  if (message.platform == 'osc') {
    command = eventData.triggers.osc.value.toLowerCase();
  } else {
    command = eventData.triggers.chat.command.toLowerCase();
  }
  if (searchMode == true) {
    let commandSplit = command.split(' ');
    let commandMatch = new Array(commandSplit.length).fill(false);
    let messageSplit = message.message
      .toLowerCase()
      .replaceAll(/[\p{P}\p{S}]/gu, '')
      .split(' ');
    let matchIndex = 0;
    let startInd = 0;
    for (let m = 0; m < messageSplit.length; m++) {
      if (commandSplit[matchIndex] == '*') {
        commandMatch[matchIndex] = messageSplit[m];
      } else if (commandSplit[matchIndex].startsWith('*')) {
        for (let n = m; n < messageSplit.length; n++) {
          if (matchConditions(commandSplit[matchIndex].substr(1), messageSplit[n]) != false) {
            commandMatch[matchIndex] = messageSplit[n];

            m = n;
            break;
          }
        }
      } else {
        commandMatch[matchIndex] = matchConditions(commandSplit[matchIndex], messageSplit[m]);
      }

      if (commandMatch[matchIndex] != false) {
        if (matchIndex == 0) {
          startInd = m;
        }
        matchIndex++;

        if (matchIndex == commandMatch.length) {
          console.log('FINISH', commandMatch);
          break;
        }
      } else {
        //console.log(commandMatch, m, startInd);
        if (matchIndex > 0) {
          m = startInd;
        }

        matchIndex = 0;
        commandMatch = new Array(commandSplit.length).fill(false);
      }
    }

    if (matchIndex == commandMatch.length) {
      return {
        message: message,
        extra: commandMatch,
      };
    }
  } else {
    if (message.message.toLowerCase().startsWith(command)) {
      return {
        message: message,
        extra: undefined,
      };
    }
  }
  return undefined;
}

export async function verifyResponseScript(
  eventName: string,
  message: StreamMessage,
  extra: string[],
  script: string,
) {
  try {
    let responseScript =
      'async () => { let event = ' +
      JSON.stringify(message) +
      '; let extra = ' +
      JSON.stringify(extra) +
      '; function say(txt){sayInChat(txt,' +
      JSON.stringify(message.platform) +
      ',' +
      JSON.stringify(message.channel) +
      ');}' +
      '; let toUser = ' +
      JSON.stringify(message.message.split(' ')[1]) +
      '' +
      '; let command = ' +
      JSON.stringify(message.message.toLowerCase().split(' ')) +
      '' +
      '; function getVar(key,defaultVal=0){return eventstorage[' +
      JSON.stringify(eventName) +
      ']?.[key]??defaultVal;}' +
      '; function setVar(key, value, save=true){eventstorage[' +
      JSON.stringify(eventName) +
      ']??={}; eventstorage[eventname][key] = value;}' +
      '; function getSharedVar(eventname, key,defaultVal=0){return eventstorage[eventname]?.[key]??defaultVal;}' +
      '; function setSharedVar(eventname, key, value, save=true){eventstorage[eventname]??={}; eventstorage[eventname][key] = value;}' +
      '; function chooseRandom(...randArray){return randArray[Math.floor(Math.random()*randArray.length)];}' +
      '; function chooseRandom(randArray){return randArray[Math.floor(Math.random()*randArray.length)];}' +
      '; function sanitize(text){return text.replace(/[`!@#$%^&*()_+\\-=\\[\\]{};\':"\\\\|,.<>\\/?~]/,"",\'\');}' +
      '; function runEvent(eName){runCommands(event, eName)}' +
      'let eventstorage = ' +
      JSON.stringify(eventstorage) +
      '; ' +
      script.replace(/\n/g, '') +
      '}';
    let responseFunct = await eval(responseScript);
    let response = await responseFunct();
    return {
      status: 'ok',
      response: response,
    };
  } catch (e: any) {
    console.log(e);
    return {
      status: 'error',
      response: e.stack != null ? e.stack : e,
    };
  }
}

export function sayInChat(message: string, platform?: string, channel?: string) {
  const activeStreams = ModuleManager.getStreamModules();
  if (platform != null) {
    if (activeStreams[platform] != null) {
      if (channel != null) {
        activeStreams[platform].sayInChat(message, channel);
      } else {
        activeStreams[platform].sayInChat(message, activeStreams[platform].homeChannel);
      }
    } else {
      throw new Error(`Platform unavailable: ${platform}`);
    }
  } else {
    for (let p in activeStreams) {
      activeStreams[p].sayInChat(message, activeStreams[p].homeChannel);
    }
  }
}

export class EventManager {
  private static instance: EventManager;

  constructor() {
    if (EventManager.instance) {
      return EventManager.instance;
    }

    EventManager.instance = this;

    try {
      let settingFile = fs.readFileSync(backendDir + '/settings/commands.json', {
        encoding: 'utf8',
      });

      let eventsObj = JSON.parse(settingFile);
      this.events = eventsObj.events;
      this.eventGroups = eventsObj.groups;

      spooderLog('Got events');
    } catch (e: any) {
      this.events = {};
      this.eventGroups = ['Default'];
    }
  }

  uptime = 0;

  activeEvents = {} as KeyedObject;

  events = {} as KeyedObject;
  eventGroups = ['Default'];

  static getEvents() {
    return EventManager.instance.events;
  }

  static getGroups() {
    return EventManager.instance.eventGroups;
  }

  static getActiveEvents() {
    return EventManager.instance.activeEvents;
  }

  static saveEvents(newEvents: KeyedObject, newGroups: string[]) {
    EventManager.instance.events = newEvents;
    EventManager.instance.eventGroups = newGroups;

    fs.writeFileSync(
      backendDir + '/settings/commands.json',
      JSON.stringify({
        events: newEvents,
        groups: newGroups,
      }),
      'utf-8',
    );

    const activePlatforms = ModuleManager.getStreamModules();
    for (let p in activePlatforms) {
      if (activePlatforms[p].onEventFileSaved) {
        activePlatforms[p].onEventFileSaved();
      }
    }
  }

  private sayAlreadyOn(name: string) {
    const events = EventManager.getEvents();
    const activeEvents = EventManager.getActiveEvents();
    for (let c in activeEvents[name]) {
      if (activeEvents[name][c].etype == 'event') {
        sayInChat(
          events[name].name +
            ' is cooling down. Time Left: ' +
            Math.abs(Math.floor(this.uptime - activeEvents[name][c]['timeout'])) +
            's',
        );
        break;
      }
    }
  }

  private convertDuration(numSeconds: number) {
    let timeTerm = 'seconds';
    let timeAmount = numSeconds;

    if (numSeconds / 60 == 1) {
      timeTerm = 'minute';
      timeAmount = numSeconds / 60;
    } else if (numSeconds / 60 > 1) {
      timeTerm = 'minutes';
      timeAmount = numSeconds / 60;
    }
    return timeAmount + ' ' + timeTerm;
  }

  static stopEvent(cEvent: string) {
    const activeEvents = EventManager.getActiveEvents();
    if (activeEvents[cEvent] !== undefined) {
      for (let e in activeEvents[cEvent]) {
        if (activeEvents[cEvent][e].timeoutEvent) {
          clearTimeout(activeEvents[cEvent][e].timeoutEvent);
        }
        if (activeEvents[cEvent][e]['function']) {
          activeEvents[cEvent][e]['function']();
        }
      }
      delete EventManager.instance.activeEvents[cEvent];
    }
  }

  static runCommands = (
    streamMessage: StreamMessage,
    eventName: string,
    eventType: string,
    extra: KeyedObject = {},
  ) => {
    const sconfig = ConfigManager.getConfig();
    const activePlugins = PluginManager.getActivePlugins();
    //console.log("RUNNING COMMANDS", eventData);
    let isChat = eventType.includes('chat');
    let isOSC = eventType.includes('osc');
    if (isOSC) {
      streamMessage.username = sconfig.bot_name;
      streamMessage.displayName = sconfig.bot_name;
      streamMessage.message ?? '';
    }

    const events = EventManager.getEvents();
    const activeEvents = EventManager.getActiveEvents();

    let event = events[eventName];

    if (isChat) {
      if (activeEvents[eventName] != null) {
        if (streamMessage.isBroadcaster) {
          const commandArgs = streamMessage.message.split(' ');
          if (commandArgs[1] != null) {
            if (commandArgs[1].toLowerCase() == 'off') {
              for (let e in activeEvents[eventName]) {
                if (activeEvents[eventName][e] != 'event') {
                  activeEvents[eventName][e]['function']();
                }
              }
              delete activeEvents[eventName];
              return;
            }
          }
        }
        if (event.cooldownnotification == true) {
          EventManager.instance.sayAlreadyOn(eventName);
        }

        return;
      }
    } else if (isOSC) {
      if (event.triggers.osc.handletype == 'toggle' && activeEvents[eventName] != null) {
        for (let e in activeEvents[eventName]) {
          if (activeEvents[eventName][e] != 'event') {
            activeEvents[eventName][e]['function']();
          }
        }
        delete activeEvents[eventName];
        return;
      }
    }

    if (isChat && event.chatnotification == true) {
      sayInChat(
        streamMessage.displayName + ' has activated ' + event.name + '!',
        streamMessage.platform,
        streamMessage.channel,
      );
      OSCManager.sendToTCP(
        '/events/start/' + eventName,
        streamMessage.username + ' has activated ' + event.name + '!',
      );
      if (event.cooldown != 0) {
        EventManager.instance.createTimeout(
          eventName,
          null,
          'event',
          function () {
            sayInChat(
              event.name + ' has been deactivated!',
              streamMessage.platform,
              streamMessage.channel,
            );
            OSCManager.sendToTCP('/events/end/' + eventName, event.name + ' has been deactivated!');
          },
          event.cooldown,
        );
      }
    } else if (isChat || isOSC) {
      if (event.cooldown != 0) {
        EventManager.instance.createTimeout(
          eventName,
          null,
          'event',
          function () {},
          event.cooldown,
        );
      }
    }

    const eventData = {
      event: events[eventName],
      eventType: eventType,
      message: streamMessage,
    };

    for (let c in event.commands) {
      let eCommand = event.commands[c];
      let commandDuration = parseFloat(eCommand.duration);

      let thisCommand = null;
      switch (eCommand.type) {
        case 'response':
          thisCommand = async () => {
            try {
              if (eventstorage[eventName] == null) {
                eventstorage[eventName] = {};
              }

              let responseFunct = await eval(
                'async () => { let event = ' +
                  JSON.stringify(streamMessage) +
                  '; let extra = ' +
                  JSON.stringify(extra) +
                  '; function say(txt){sayInChat(txt,' +
                  JSON.stringify(streamMessage.platform) +
                  ',' +
                  JSON.stringify(streamMessage.channel) +
                  ');}' +
                  '; let toUser = ' +
                  JSON.stringify(streamMessage.message.split(' ')[1]) +
                  '' +
                  '; let command = ' +
                  JSON.stringify(streamMessage.message.toLowerCase().split(' ')) +
                  '' +
                  '; function getVar(key,defaultVal=0){return eventstorage[' +
                  JSON.stringify(eventName) +
                  ']?.[key]??defaultVal;}' +
                  '; function setVar(key, value, save=true){eventstorage[' +
                  JSON.stringify(eventName) +
                  ']??={}; eventstorage[' +
                  JSON.stringify(eventName) +
                  '][key] = value; if(save==true){saveEventStorage();}}' +
                  '; function getSharedVar(eventname, key,defaultVal=0){return eventstorage[eventname]?.[key]??defaultVal;}' +
                  '; function setSharedVar(eventname, key, value, save=true){eventstorage[eventname]??={}; eventstorage[eventname][key] = value; if(save==true){saveEventStorage();}}' +
                  '; function chooseRandom(...randArray){return randArray[Math.floor(Math.random()*randArray.length)];}' +
                  '; function chooseRandom(randArray){return randArray[Math.floor(Math.random()*randArray.length)];}' +
                  '; function sanitize(text){return text.replace(/[`!@#$%^&*()_+\\-=\\[\\]{};\':"\\\\|,.<>\\/?~]/,"",\'\');}' +
                  '; function runEvent(eName){runCommands(event, eName)}' +
                  '; ' +
                  eCommand.message.replace(/\n/g, '') +
                  '}',
              );
              let response = await responseFunct();
              sayInChat(response, streamMessage.platform, streamMessage.channel);
            } catch (e) {
              spooderLog(
                'Failed to run response script. Check the event settings to verify it.',
                e,
              );
            }
          };
          if (eCommand.delay == 0) {
            thisCommand();
          } else {
            setTimeout(thisCommand, eCommand.delay);
          }

          break;
        case 'plugin':
          thisCommand = () => {
            if (activePlugins[eCommand.pluginname] != null) {
              if (typeof activePlugins[eCommand.pluginname].onEvent == 'undefined') {
                spooderLog(activePlugins[eCommand.pluginname], 'onEvent() NOT FOUND');
                return;
              }
            }

            if (activePlugins[eCommand.pluginname]?.onEvent != null) {
              if (eCommand.stop_eventname) {
                EventManager.instance.createTimeout(
                  eventName,
                  eCommand,
                  'timed',
                  function () {
                    activePlugins[eCommand.pluginname].onEvent(
                      eCommand.stop_eventname,
                      streamMessage,
                    );
                  },
                  commandDuration,
                );
              }
              activePlugins[eCommand.pluginname].onEvent(eCommand.eventname, streamMessage);
            }
          };

          if (eCommand.delay == 0) {
            thisCommand();
          } else {
            setTimeout(thisCommand, eCommand.delay);
          }

          break;
        case 'software':
          thisCommand = () => {
            if (eCommand.etype == 'timed') {
              let commandArgs = null;
              if (isChat && streamMessage.isBroadcaster) {
                commandArgs = streamMessage.message.split(' ');
                if (commandArgs[1] != null) {
                  if (commandArgs[1].toLowerCase() == 'on') {
                    commandDuration = -1;
                  }
                }
              } else if (isOSC) {
                if (event.triggers.osc.handletype == 'toggle') {
                  commandDuration = -1;
                }
              }
              //Checking Active Events for commands using the same address.
              let commandUsed = false;
              for (let ae in activeEvents) {
                if (ae == eventName) {
                  continue;
                }
                for (let command in activeEvents[ae]) {
                  if (activeEvents[ae][command].etype == 'event') {
                    continue;
                  }
                  if (activeEvents[ae][command].event.address == eCommand.address) {
                    if (activeEvents[ae][command].event.valueOn.includes(',')) {
                      let valueID = activeEvents[ae][command].event.valueOn.split(',');
                      if (eCommand.valueOn.includes(',')) {
                        let valueID2 = eCommand.valueOn.split(',');
                        if (
                          valueID[0].trim() == valueID2[0].trim() &&
                          eCommand.priority < activeEvents[ae][command].event.priority
                        ) {
                          commandUsed = true;
                        }
                      }
                    } else if (eCommand.priority < activeEvents[ae][command].event.priority) {
                      commandUsed = true;
                    }

                    continue;
                  }
                }
              }

              if (!commandUsed) {
                OSCManager.sendToUDP(eCommand.dest_udp, eCommand.address, eCommand.valueOn);
              }

              EventManager.instance.createTimeout(
                eventName,
                eCommand,
                eCommand.etype,
                () => {
                  for (let ae in activeEvents) {
                    if (ae == eventName) {
                      continue;
                    }
                    for (let command in activeEvents[ae]) {
                      if (activeEvents[ae][command].etype == 'event') {
                        continue;
                      }
                      if (activeEvents[ae][command].event.address == eCommand.address) {
                        if (activeEvents[ae][command].event.valueOn.includes(',')) {
                          let valueID = activeEvents[ae][command].event.valueOn.split(',');
                          if (eCommand.valueOn.includes(',')) {
                            let valueID2 = eCommand.valueOn.split(',');
                            if (valueID[0].trim() == valueID2[0].trim()) {
                              OSCManager.sendToUDP(
                                eCommand.dest_udp,
                                activeEvents[ae][command].event.address,
                                activeEvents[ae][command].event.valueOn,
                              );
                            } else {
                              continue;
                            }
                          }
                        } else {
                          OSCManager.sendToUDP(
                            eCommand.dest_udp,
                            activeEvents[ae][command].event.address,
                            activeEvents[ae][command].event.valueOn,
                          );
                        }

                        return;
                      }
                    }
                  }
                  OSCManager.sendToUDP(eCommand.dest_udp, eCommand.address, eCommand.valueOff);
                },
                commandDuration,
              );
            } else if (eCommand.etype == 'button-press') {
              OSCManager.sendToUDP(eCommand.dest_udp, eCommand.address, eCommand.valueOn);
              setTimeout(function () {
                OSCManager.sendToUDP(eCommand.dest_udp, eCommand.address, eCommand.valueOff);
              }, 500);
            } else if (eCommand.etype == 'oneshot') {
              OSCManager.sendToUDP(eCommand.dest_udp, eCommand.address, eCommand.valueOn);
            }
          };

          if (eCommand.delay == 0) {
            thisCommand();
          } else {
            setTimeout(thisCommand, eCommand.delay);
          }

          break;
        case 'obs':
          if (ModuleManager.getControlModule('obs') != null) {
            const obs = ModuleManager.getControlModule('obs');
            thisCommand = () => {
              if (eCommand.function == 'setinputmute') {
                if (eCommand.etype == 'timed') {
                  obs.call('SetInputMute', {
                    inputName: eCommand.item,
                    inputMuted: eCommand.valueOn == 1,
                  });
                  EventManager.instance.createTimeout(
                    eventName,
                    eCommand,
                    eCommand.type,
                    function () {
                      obs.call('SetInputMute', {
                        inputName: eCommand.item,
                        inputMuted: eCommand.valueOff == 1,
                      });
                    },
                    commandDuration,
                  );
                } else {
                  obs.call('SetInputMute', {
                    inputName: eCommand.item,
                    inputMuted: eCommand.valueOn == 1,
                  });
                }
              } else if (eCommand.function == 'switchscenes') {
                if (eCommand.etype == 'timed') {
                  obs.call('SetCurrentProgramScene', { sceneName: eCommand.itemOn });
                  EventManager.instance.createTimeout(
                    eventName,
                    eCommand,
                    eCommand.type,
                    function () {
                      obs.call('SetCurrentProgramScene', { sceneName: eCommand.itemOff });
                    },
                    commandDuration,
                  );
                } else {
                  obs.call('SetCurrentProgramScene', { sceneName: eCommand.itemOn });
                }
              } else if (eCommand.function == 'enablesceneitem') {
                if (eCommand.etype == 'timed') {
                  obs.call('SetSceneItemEnabled', {
                    sceneName: eCommand.scene,
                    sceneItemId: parseInt(eCommand.item),
                    sceneItemEnabled: eCommand.valueOn == 1,
                  });
                  EventManager.instance.createTimeout(
                    eventName,
                    eCommand,
                    eCommand.type,
                    function () {
                      obs.call('SetSceneItemEnabled', {
                        sceneName: eCommand.scene,
                        sceneItemId: parseInt(eCommand.item),
                        sceneItemEnabled: eCommand.valueOff == 0,
                      });
                    },
                    commandDuration,
                  );
                } else {
                  obs.call('SetSceneItemEnabled', {
                    sceneName: eCommand.scene,
                    sceneItemId: parseInt(eCommand.item),
                    sceneItemEnabled: eCommand.valueOn == 1,
                  });
                }
              }
            };

            if (eCommand.delay == 0) {
              thisCommand();
            } else {
              setTimeout(thisCommand, eCommand.delay);
            }
          } else {
            spooderLog(`Attempted command for the event '${eventName}' OBS module not found`);
          }

          break;
        case 'mod':
          thisCommand = () => {
            const modlocks = ModerationManager.getModlocks();
            if (eCommand.function == 'lock') {
              if (eCommand.targettype == 'all') {
                if (eCommand.etype == 'toggle') {
                  modlocks.lockdown = modlocks.lockdown == 1 ? 0 : 1;
                  ModerationManager.lockEvent(modlocks.lockdown == 1 ? 'unlock' : 'lock', 'all');
                  ModerationManager.lockPlugin(modlocks.lockdown == 1 ? 'unlock' : 'lock', 'all');
                  sayInChat(
                    modlocks.lockdown == 0
                      ? 'Lockdown initiated! All commands are blocked.'
                      : 'Lockdown lifted!',
                    streamMessage.platform,
                    streamMessage.channel,
                  );
                } else if (eCommand.etype == 'timed') {
                  modlocks.lockdown = 1;
                  ModerationManager.lockEvent('lock', 'all');
                  ModerationManager.lockPlugin('lock', 'all');
                  sayInChat(
                    'Lockdown initiated for ' +
                      EventManager.instance.convertDuration(commandDuration) +
                      '! All commands are blocked until then.',
                    streamMessage.platform,
                    streamMessage.channel,
                  );
                  EventManager.instance.createTimeout(
                    eventName,
                    eCommand,
                    eCommand.type,
                    function () {
                      ModerationManager.lockEvent('unlock', 'all');
                      ModerationManager.lockPlugin('unlock', 'all');
                      sayInChat('Lockdown lifted!', streamMessage.platform, streamMessage.channel);
                    },
                    commandDuration,
                  );
                }
              } else if (eCommand.targettype == 'event') {
                if (eCommand.etype == 'toggle') {
                  ModerationManager.lockEvent(
                    ModerationManager.isEventLocked(eCommand.target) ? 'unlock' : 'lock',
                    eCommand.target,
                  );
                } else if (eCommand.etype == 'timed') {
                  ModerationManager.lockEvent('lock', eCommand.target);
                  EventManager.instance.createTimeout(
                    eventName,
                    eCommand,
                    eCommand.type,
                    function () {
                      ModerationManager.lockEvent('unlock', eCommand.target);
                    },
                    commandDuration,
                  );
                }
                extra[eCommand.target] = ModerationManager.isEventLocked(eCommand.target);
              } else if (eCommand.targettype == 'plugin') {
                if (eCommand.etype == 'toggle') {
                  ModerationManager.lockPlugin(
                    ModerationManager.isPluginLocked(eCommand.target) ? 'unlock' : 'lock',
                    eCommand.target,
                  );
                } else if (eCommand.etype == 'timed') {
                  ModerationManager.lockPlugin('lock', eCommand.target);

                  EventManager.instance.createTimeout(
                    eventName,
                    eCommand,
                    eCommand.type,
                    function () {
                      ModerationManager.lockPlugin('unlock', eCommand.target);
                    },
                    commandDuration,
                  );
                }
                extra[eCommand.target] = ModerationManager.isPluginLocked(eCommand.target);
              }
            } else if (eCommand.function == 'spamguard') {
              sayInChat(
                ModerationManager.setSpamGuard(modlocks.spamguard == 1 ? 'off' : 'on'),
                streamMessage.platform,
                streamMessage.channel,
              );
              extra['_spamguard'] = modlocks.spamguard == 1;
            } else if (eCommand.function == 'stop') {
              if (eCommand.targettype == 'all') {
                sayInChat(
                  ModerationManager.stopEvent(eCommand.targettype),
                  streamMessage.platform,
                  streamMessage.channel,
                );
              } else {
                sayInChat(
                  ModerationManager.stopEvent(eCommand.target),
                  streamMessage.platform,
                  streamMessage.channel,
                );
              }
            }
          };
          if (eCommand.delay == 0) {
            thisCommand();
          } else {
            setTimeout(thisCommand, eCommand.delay);
          }
          break;
      }
    }
  };

  private runInterval = () => {
    this.uptime = Math.floor(Date.now() / 1000);
    const activeEvents = EventManager.getActiveEvents();
    //console.log(activeEvents);
    for (let e in activeEvents) {
      //Loop 1 for action
      for (let command in activeEvents[e]) {
        if (activeEvents[e][command]['timeout'] != -1) {
          OSCManager.sendToTCP(
            '/events/time/' + e + '/' + activeEvents[e][command]['etype'],
            this.uptime - activeEvents[e][command]['timeout'],
          );
        }

        if (
          activeEvents[e][command]['timeout'] != -1 &&
          this.uptime >= activeEvents[e][command]['timeout']
        ) {
          //activeEvents[e][command]["function"]();
          activeEvents[e][command].finished = true;
          OSCManager.sendToTCP(
            '/events/end/' + e + '/' + command,
            e + '-' + command + ' is now deactivated!',
          );
        }
      }

      //Loop 2 for cleanup
      for (let command in activeEvents[e]) {
        if (activeEvents[e][command].finished == true) {
          activeEvents[e].splice(command, 1);
        }
      }

      if (activeEvents[e].length == 0) {
        delete activeEvents[e];
      }
    }
  };

  upInterval = setInterval(this.runInterval, 1000);

  private createTimeout(
    name: string,
    command: any,
    etype: string,
    funct: () => void,
    seconds: number,
  ) {
    const activeEvents = EventManager.getActiveEvents();
    if (activeEvents[name] == null) {
      activeEvents[name] = [];
    }

    let timeout = seconds > -1 ? this.uptime + seconds : -1;
    activeEvents[name].push({
      function: funct,
      event: command,
      timeout: Math.ceil(timeout),
      timeoutEvent: seconds != -1 ? setTimeout(funct, seconds * 1000) : null,
      etype: etype,
    });
  }
}
