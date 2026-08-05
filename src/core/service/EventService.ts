import { v4 as uuidv4 } from 'uuid';
import { KeyedObject, userDir, StreamMessage } from '../../Types';
import { spooderLog } from '../Logging';
import { triggerExistsAndEnabled } from '../util/EventTriggerUtil';
import ConfigService from './ConfigService';
import EventModCommand from './event/EventModCommand';
import EventOBSCommand from './event/EventOBSCommand';
import EventPluginCommand from './event/EventPluginCommand';
import EventResponseCommand from './event/EventResponseCommand';
import EventSoftwareCommand from './event/EventSoftwareCommand';
import ModuleService from './ModuleService';
import OSCService from './OSCService';
import fs from 'fs';
import ShareService from './ShareService';
import EventDiscordCommand from './event/EventDiscordCommand';
import { buildMockStreamMessage } from '../util/ResponseUtil';

export function sayInChat(message: string, platform?: string, channel?: string) {
  const activeStreams = ModuleService.getStreamModules();
  if (platform && activeStreams[platform]) {
    if (channel) {
      activeStreams[platform].sayInChat(message, channel);
    } else {
      activeStreams[platform].sayInChat(message, activeStreams[platform].homeChannel);
    }
  } else {
    for (let p in activeStreams) {
      console.log('Saying in chat for platform', p, activeStreams[p].homeChannel);
      activeStreams[p].sayInChat(message, activeStreams[p].homeChannel);
    }
  }
}

export class EventService {
  private static instance: EventService;

  constructor() {
    if (EventService.instance) {
      return EventService.instance;
    }

    EventService.instance = this;

    try {
      const modCommandFile = fs.readFileSync(userDir + '/settings/mod_commands.json', {
        encoding: 'utf8',
      });

      const modCommandsObj = JSON.parse(modCommandFile);
      this.modCommands = modCommandsObj;

      spooderLog('Got Mod Commands');
    } catch (e: any) {
      this.modCommands = {};
    }

    try {
      const settingFile = fs.readFileSync(userDir + '/settings/commands.json', {
        encoding: 'utf8',
      });

      const eventsObj = JSON.parse(settingFile);
      this.events = eventsObj.events;
      this.eventGroups = eventsObj.groups;
      this.disabledGroups = eventsObj.disabledGroups || [];

      if (fs.existsSync(userDir + '/settings/eventstorage.json')) {
        try {
          this.eventstorage = JSON.parse(
            fs.readFileSync(userDir + '/settings/eventstorage.json', { encoding: 'utf-8' }),
          );
        } catch (e) {
          spooderLog('Error accessing Event Storage. Event Storage remains empty.');
        }
      }

      spooderLog('Got events');
    } catch (e: any) {
      this.events = {};
      this.eventGroups = ['Default'];
    }
  }

  uptime = 0;

  activeEvents = {} as KeyedObject;
  activeResponseVariables = {} as KeyedObject;
  eventstorage = {} as KeyedObject;

  modCommands = {} as KeyedObject;
  events = {} as KeyedObject;
  eventGroups = ['Default'];
  disabledGroups = [] as string[];
  recurringMessages = {} as KeyedObject;

  static getActiveEventEndTime(eventName: string) {
    const event = EventService.instance.activeEvents[eventName];
    if (event && event.length > 0) {
      let maxEndTime = 0;
      for (const command of event) {
        if (command.timeout > maxEndTime) {
          maxEndTime = command.timeout;
        }
      }
      return maxEndTime;
    }
    return null;
  }

  static startRecurringMessage(eventName: string, key: string, commandData: KeyedObject) {
    console.log('Starting recurring message for', eventName, key, commandData);

    EventService.instance.recurringMessages[key] = {
      data: commandData,
      count: 0,
      interval: setInterval(
        async () => {
          console.log('Running recurring message for', eventName, key);
          if (!EventService.instance.recurringMessages[key]) {
            clearInterval(EventService.instance.recurringMessages[key].interval);
            return;
          }
          const streamMessage = buildMockStreamMessage(eventName);
          streamMessage.platform = '';
          streamMessage.channel = '';
          const thisCommand = await EventResponseCommand(
            {
              etype: 'response',
              message: commandData.message,
            },
            eventName,
            streamMessage,
            {
              count: EventService.instance.recurringMessages[key].count,
            },
          );

          thisCommand();

          EventService.instance.recurringMessages[key].count++;
        },
        commandData.interval * 1000 * 60,
      ),
    };
  }

  static stopRecurringMessage(key: string) {
    if (EventService.instance.recurringMessages[key] != null) {
      clearInterval(EventService.instance.recurringMessages[key].interval);
      delete EventService.instance.recurringMessages[key];
    }
  }

  static getModCommands() {
    return EventService.instance.modCommands;
  }

  static getModCommandsAsEvents() {
    const modCommands = EventService.getModCommands();
    const modEvents = {} as KeyedObject;

    for (let c in modCommands) {
      modEvents[c] = {
        name: c,
        description: '',
        group: '_ModCommands',
        triggers: {
          chat: {
            enabled: modCommands[c].enabled,
            command: modCommands[c].command,
            search: modCommands[c].search,
            vip: modCommands[c].vip,
            mod: modCommands[c].mod,
            sub: modCommands[c].sub,
            broadcaster: modCommands[c].broadcaster,
          },
        },
        commands: [
          {
            type: 'response',
            message: modCommands[c].script,
            delay: 0,
          },
        ],
        cooldown: 0,
        chatnotification: false,
        cooldownnotification: false,
      };
    }
    return modEvents;
  }

  static addModCommand(command: string, search: boolean, permissions: KeyedObject, script: string) {
    const newCommandId = uuidv4();
    const commandObj = { enabled: true, command, search, permissions, script };
    EventService.instance.modCommands[newCommandId] = commandObj;
    OSCService.sendToTCP('/mod/command/update', 1);
    this.saveModCommands();
  }

  static updateModCommand(
    commandId: string,
    enabled: boolean,
    command: string,
    search: boolean,
    permissions: KeyedObject,
    script: string,
  ) {
    const commandObj = { enabled, command, search, permissions, script };
    EventService.instance.modCommands[commandId] = commandObj;
    OSCService.sendToTCP('/mod/command/update', 1);
    this.saveModCommands();
  }

  static removeModCommand(commandId: string) {
    delete EventService.instance.modCommands[commandId];
    OSCService.sendToTCP('/mod/command/update', 1);
    this.saveModCommands();
  }

  static saveModCommands() {
    fs.writeFileSync(
      userDir + '/settings/mod_commands.json',
      JSON.stringify(EventService.instance.modCommands),
      'utf-8',
    );
  }

  static getEvents() {
    return EventService.instance.events;
  }

  static getEventStorage() {
    return EventService.instance.eventstorage;
  }

  static getActiveResponseVariables() {
    return EventService.instance.activeResponseVariables;
  }

  static getGroups() {
    return EventService.instance.eventGroups;
  }

  static getDisabledGroups() {
    return EventService.instance.disabledGroups;
  }

  static getActiveEvents() {
    return EventService.instance.activeEvents;
  }

  static getStreamChatCommands(bangOnly: boolean = false, shareId?: string) {
    const events = EventService.getEvents();
    const shares = ShareService.getShares();

    let chatCommands = [];

    if (shareId && shares[shareId]) {
      const share = shares[shareId];
      const sharedCommands = Object.values(share.streamPlatforms)[0].commands;
      for (let cmdEventName in sharedCommands) {
        if (triggerExistsAndEnabled(events[cmdEventName], 'chat')) {
          if (bangOnly && !events[cmdEventName].triggers.chat.command.startsWith('!')) {
            continue;
          }
          chatCommands.push(events[cmdEventName].triggers.chat.command);
        }
      }
      return chatCommands;
    }

    for (let e in events) {
      if (triggerExistsAndEnabled(events[e], 'chat')) {
        if (bangOnly && !events[e].triggers.chat.command.startsWith('!')) {
          continue;
        }
        chatCommands.push(events[e].triggers.chat.command);
      }
    }

    return chatCommands;
  }

  static saveEventStorage(newEventStorage: KeyedObject) {
    EventService.instance.eventstorage = newEventStorage;
    fs.writeFileSync(
      userDir + '/settings/eventstorage.json',
      JSON.stringify(EventService.instance.eventstorage),
      'utf-8',
    );
  }

  static saveEvents(newEvents: KeyedObject, newGroups: string[], newDisabledGroups: string[]) {
    EventService.instance.events = newEvents;
    EventService.instance.eventGroups = newGroups;
    EventService.instance.disabledGroups = newDisabledGroups;

    fs.writeFileSync(
      userDir + '/settings/commands.json',
      JSON.stringify({
        events: newEvents,
        groups: newGroups,
        disabledGroups: newDisabledGroups,
      }),
      'utf-8',
    );

    const activePlatforms = ModuleService.getStreamModules();
    for (let p in activePlatforms) {
      activePlatforms[p].onEventFileSaved();
    }
  }

  static convertDuration(numSeconds: number) {
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

  static eventIsRunning(eventName: string) {
    const activeEvents = EventService.getActiveEvents();
    if (activeEvents[eventName] != null) {
      return true;
    }
    return false;
  }

  static stopEvent(cEvent: string) {
    const activeEvents = EventService.getActiveEvents();
    if (activeEvents[cEvent] !== undefined) {
      for (let e in activeEvents[cEvent]) {
        if (activeEvents[cEvent][e].timeoutEvent) {
          clearTimeout(activeEvents[cEvent][e].timeoutEvent);
        }
        if (activeEvents[cEvent][e]['function']) {
          activeEvents[cEvent][e]['function']();
        }
      }
      delete EventService.instance.activeEvents[cEvent];
    }
  }

  static runCommands = (
    streamMessage: StreamMessage,
    eventName: string,
    eventType: string,
    extra: KeyedObject = {},
  ) => {
    const sconfig = ConfigService.getConfig();
    let isChat = eventType.includes('chat');
    let isOSC = eventType.includes('osc');

    if (isOSC) {
      streamMessage.username = sconfig.bot.bot_name;
      streamMessage.displayName = sconfig.bot.bot_name;
      streamMessage.message = streamMessage.message ?? '';
    }

    const modCommands = EventService.getModCommandsAsEvents();
    const events = EventService.getEvents();
    const activeEvents = EventService.getActiveEvents();

    let event = events[eventName] ?? modCommands[eventName];

    streamMessage.triggeredEventData = event;

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
          EventService.instance.sayAlreadyOn(eventName);
        }

        return;
      }
    } else if (isOSC && event.triggers.osc) {
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
      OSCService.sendToTCP(
        '/events/start/' + eventName,
        streamMessage.username + ' has activated ' + event.name + '!',
      );
      if (event.cooldown != 0) {
        EventService.createTimeout(
          eventName,
          null,
          'event',
          function () {
            sayInChat(
              event.name + ' has been deactivated!',
              streamMessage.platform,
              streamMessage.channel,
            );
          },
          event.cooldown,
        );
      }
    } else if (isChat || isOSC) {
      if (event.cooldown != 0) {
        EventService.createTimeout(eventName, null, 'event', function () {}, event.cooldown);
      }
    }

    for (let c in event.commands) {
      let eCommand = event.commands[c];

      let thisCommand = null;
      switch (eCommand.type) {
        case 'response':
          thisCommand = EventResponseCommand(eCommand, eventName, streamMessage, extra);
          if (eCommand.delay == 0) {
            thisCommand();
          } else {
            setTimeout(thisCommand, eCommand.delay);
          }

          break;
        case 'plugin':
          thisCommand = EventPluginCommand(eCommand, eventName, streamMessage, extra);

          if (eCommand.delay == 0) {
            thisCommand();
          } else {
            setTimeout(thisCommand, eCommand.delay);
          }

          break;
        case 'software':
          thisCommand = EventSoftwareCommand(
            eCommand,
            isChat,
            isOSC,
            event,
            activeEvents,
            streamMessage,
            eventName,
          );
          if (eCommand.delay == 0) {
            thisCommand();
          } else {
            setTimeout(thisCommand, eCommand.delay);
          }
          break;
        case 'obs':
          if (ModuleService.getControlModule('obs') != null) {
            thisCommand = EventOBSCommand(eCommand, eventName);
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
          thisCommand = EventModCommand(eCommand, eventName, streamMessage, extra);
          if (eCommand.delay == 0) {
            thisCommand();
          } else {
            setTimeout(thisCommand, eCommand.delay);
          }
          break;
        case 'discord':
          thisCommand = EventDiscordCommand(eCommand, eventName, streamMessage, extra);
          if (eCommand.delay == 0) {
            thisCommand();
          } else {
            setTimeout(thisCommand, eCommand.delay);
          }
          break;
      }
    }
  };

  static createTimeout(
    name: string,
    command: any,
    etype: string,
    funct: () => void,
    seconds: number,
  ) {
    const activeEvents = EventService.getActiveEvents();
    if (activeEvents[name] == null) {
      activeEvents[name] = [];
    }

    function endCommand() {
      funct();

      for (let activeCommand in activeEvents[name]) {
        if (
          activeEvents[name][activeCommand]['timeout'] != -1 &&
          Date.now() / 1000 >= activeEvents[name][activeCommand]['timeout']
        ) {
          activeEvents[name].splice(activeCommand, 1);
          OSCService.sendToTCP('/events/end/' + name, activeCommand);
        }
      }

      if (activeEvents[name].length == 0) {
        delete activeEvents[name];
      }
    }

    const timeout = seconds > -1 ? Date.now() / 1000 + seconds : -1;
    activeEvents[name].push({
      function: funct,
      command: command,
      start_time: Date.now(),
      timeout: timeout * 1000,
      timeoutEvent: seconds != -1 ? setTimeout(endCommand, seconds * 1000) : null,
      etype: etype,
    });
    OSCService.sendToTCP('/events/start/' + name, {
      etype: etype,
      command: command,
      start_time: Date.now(),
      timeout: timeout * 1000,
    });
  }

  private sayAlreadyOn(name: string) {
    const events = EventService.getEvents();
    const activeEvents = EventService.getActiveEvents();
    for (let c in activeEvents[name]) {
      if (activeEvents[name][c].etype == 'event') {
        sayInChat(
          events[name].name +
            ' is cooling down. Time Left: ' +
            Math.abs(
              Math.floor(
                (activeEvents[name][c]['start_time'] - activeEvents[name][c]['timeout']) / 1000,
              ),
            ) +
            's',
        );
        break;
      }
    }
  }

  //upInterval = setInterval(this.runInterval, 1000);
}
