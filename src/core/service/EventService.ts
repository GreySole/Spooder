import { KeyedObject, userDir, StreamMessage } from '../../Types.ts';
import { spooderLog } from '../Logging.ts';
import { triggerExistsAndEnabled } from '../util/EventTriggerUtil.ts';
import ConfigService from './ConfigService.ts';
import EventModCommand from './event/EventModCommand.ts';
import EventOBSCommand from './event/EventOBSCommand.ts';
import EventPluginCommand from './event/EventPluginCommand.ts';
import EventResponseCommand from './event/EventResponseCommand.ts';
import EventSoftwareCommand from './event/EventSoftwareCommand.ts';
import ModuleService from './ModuleService.ts';
import OSCService from './OSCService.ts';
import fs from 'fs';
import ShareService from './ShareService.ts';

export function sayInChat(message: string, platform?: string, channel?: string) {
  const activeStreams = ModuleService.getStreamModules();
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

export class EventService {
  private static instance: EventService;

  constructor() {
    if (EventService.instance) {
      return EventService.instance;
    }

    EventService.instance = this;

    try {
      let settingFile = fs.readFileSync(userDir + '/settings/commands.json', {
        encoding: 'utf8',
      });

      let eventsObj = JSON.parse(settingFile);
      this.events = eventsObj.events;
      this.eventGroups = eventsObj.groups;

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
  eventstorage = {} as KeyedObject;

  events = {} as KeyedObject;
  eventGroups = ['Default'];

  static getEvents() {
    return EventService.instance.events;
  }

  static getEventStorage() {
    return EventService.instance.eventstorage;
  }

  static getGroups() {
    return EventService.instance.eventGroups;
  }

  static getActiveEvents() {
    return EventService.instance.activeEvents;
  }

  static getStreamChatCommands(
    bangOnly: boolean = false,
    sharePlatform?: string,
    shareChannel?: string,
  ) {
    const events = EventService.getEvents();
    const shares = ShareService.getShares();
    let chatCommands = {} as KeyedObject;

    for (let e in events) {
      if (sharePlatform && shareChannel) {
      }
      if (triggerExistsAndEnabled(events[e].triggers, 'chat')) {
        if (bangOnly && !events[e].triggers.chat.command.startsWith('!')) {
          continue;
        }
        chatCommands[e] = {
          name: events[e].name,
          command: events[e].triggers.chat.command,
        };
      }
    }

    return chatCommands;
  }

  static saveEventStorage() {
    fs.writeFileSync(
      userDir + '/settings/eventstorage.json',
      JSON.stringify(EventService.instance.eventstorage),
      'utf-8',
    );
  }

  static saveEvents(newEvents: KeyedObject, newGroups: string[]) {
    EventService.instance.events = newEvents;
    EventService.instance.eventGroups = newGroups;

    fs.writeFileSync(
      userDir + '/settings/commands.json',
      JSON.stringify({
        events: newEvents,
        groups: newGroups,
      }),
      'utf-8',
    );

    const activePlatforms = ModuleService.getStreamModules();
    for (let p in activePlatforms) {
      if (activePlatforms[p].onEventFileSaved) {
        activePlatforms[p].onEventFileSaved();
      }
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
      streamMessage.message ?? '';
    }

    const events = EventService.getEvents();
    const activeEvents = EventService.getActiveEvents();

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
            OSCService.sendToTCP('/events/end/' + eventName, event.name + ' has been deactivated!');
          },
          event.cooldown,
        );
      }
    } else if (isChat || isOSC) {
      if (event.cooldown != 0) {
        EventService.createTimeout(eventName, null, 'event', function () {}, event.cooldown);
      }
    }

    const eventData = {
      event: events[eventName],
      eventType: eventType,
      message: streamMessage,
    };

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
          thisCommand = EventPluginCommand(eCommand, eventName, streamMessage);

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

    let timeout = seconds > -1 ? EventService.instance.uptime + seconds : -1;
    activeEvents[name].push({
      function: funct,
      event: command,
      timeout: Math.ceil(timeout),
      timeoutEvent: seconds != -1 ? setTimeout(funct, seconds * 1000) : null,
      etype: etype,
    });
  }

  private runInterval = () => {
    this.uptime = Math.floor(Date.now() / 1000);
    const activeEvents = EventService.getActiveEvents();
    for (let e in activeEvents) {
      //Loop 1 for action
      for (let command in activeEvents[e]) {
        if (activeEvents[e][command]['timeout'] != -1) {
          OSCService.sendToTCP(
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
          OSCService.sendToTCP(
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

  private sayAlreadyOn(name: string) {
    const events = EventService.getEvents();
    const activeEvents = EventService.getActiveEvents();
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

  upInterval = setInterval(this.runInterval, 1000);
}
