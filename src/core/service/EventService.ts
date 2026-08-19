import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { EventGraph, KeyedObject, StreamMessage, userDir } from '../../Types';
import { spooderLog } from '../Logging';
import {
  CHAT_TRIGGER_NODE_TYPES,
  migrateEventsFileToGraphs,
  OSC_TRIGGER_NODE_TYPES,
  upgradeGraphNodes,
  reconstructFlatEventFromGraph,
} from '../util/EventGraphMigration';
import { matchesTriggerValues, triggerExistsAndEnabled } from '../util/EventTriggerUtil';
import { buildMockStreamMessage } from '../util/ResponseUtil';
import ConfigService from './ConfigService';
import EventResponseCommand from './event/EventResponseCommand';
import { entryNodesForDispatch, walkEventGraph } from './event/EventGraphExecutor';
import EventGraphStorageService from './EventGraphStorageService';
import EventStorageService from './EventStorageService';
import ModuleService from './ModuleService';
import OscLayerService from './OscLayerService';
import OSCService from './OSCService';
import ShareService from './ShareService';

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

    EventGraphStorageService.initialize();
    const loaded = EventGraphStorageService.loadAll();
    this.graphs = loaded.graphs;
    this.eventGroups = loaded.groups;
    this.disabledGroups = loaded.disabledGroups;

    // Written straight back to storage rather than re-derived every boot. Saved through the
    // storage service directly, not saveEventGraphs, because the stream modules it notifies
    // aren't up yet at this point in startup.
    const upgraded = upgradeGraphNodes(this.graphs);
    if (upgraded > 0) {
      EventGraphStorageService.saveAll(this.graphs, this.eventGroups, this.disabledGroups);
      spooderLog(`Upgraded ${upgraded} node(s) to current node types`);
    }
    spooderLog('Got events');

    EventStorageService.initialize();
  }

  uptime = 0;

  activeEvents = {} as KeyedObject;
  activeResponseVariables = {} as KeyedObject;

  modCommands = {} as KeyedObject;
  graphs = {} as { [eventId: string]: EventGraph };
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

  // Derived, backward-compatible flat view for the existing chat/OSC/twitch trigger-matching
  // and response-script call sites that expect `{ triggers: {...}, commands: [...] }`.
  static getEvents() {
    const flatEvents: KeyedObject = {};
    for (const id in EventService.instance.graphs) {
      flatEvents[id] = reconstructFlatEventFromGraph(EventService.instance.graphs[id]);
    }
    return flatEvents;
  }

  static getGraphs() {
    return EventService.instance.graphs;
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

  // Accepts the legacy flat shape (for any caller still posting it) and converts to graphs
  // before persisting, since events.json only ever stores the graph format on disk.
  static saveEvents(newEvents: KeyedObject, newGroups: string[], newDisabledGroups: string[]) {
    const migrated = migrateEventsFileToGraphs({
      events: newEvents,
      groups: newGroups,
      disabledGroups: newDisabledGroups,
    });
    EventService.saveEventGraphs(migrated.graphs, migrated.groups, migrated.disabledGroups);
  }

  static saveEventGraphs(
    newGraphs: { [eventId: string]: EventGraph },
    newGroups: string[],
    newDisabledGroups: string[],
  ) {
    EventService.instance.graphs = newGraphs;
    EventService.instance.eventGroups = newGroups;
    EventService.instance.disabledGroups = newDisabledGroups;

    EventGraphStorageService.saveAll(newGraphs, newGroups, newDisabledGroups);

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
    // Layered OSC claims live in OscLayerService, not in activeEvents, so stopping an event
    // before it reaches its OSC Release node would otherwise leave the address held forever.
    OscLayerService.releaseAllForOwner(cEvent);

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

  static emitTrigger(
    moduleName: string,
    triggerNodeId: string,
    payload: KeyedObject,
    streamMessage: StreamMessage,
  ) {
    const events = EventService.getEvents();
    for (let e in events) {
      const event = events[e];
      if (!triggerExistsAndEnabled(event, moduleName)) {
        continue;
      }
      if (!matchesTriggerValues(triggerNodeId, event.triggers[moduleName], payload)) {
        continue;
      }
      EventService.runCommands(streamMessage, e, 'event');
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

    // The walk decides whether this event actually did anything: matching moved into the graph
    // (Chat Message -> a matcher -> If), so runCommands is now asked on every message and only
    // the walk knows whether a branch was taken. The activation notice and the cooldown that
    // follow used to run before this, which - once an event could decline - meant announcing and
    // locking out an event for a message it ignored.
    const graph = EventService.getGraphs()[eventName];
    let ranActions = 0;
    if (graph) {
      const graphContext = { eventName, streamMessage, extra, isChat, isOSC, event, activeEvents };
      // Only the branch belonging to the trigger that fired, and only if that trigger's
      // condition input (if it has one wired) says yes. A graph can hold more than one trigger -
      // a chat command and the Timer Elapsed it starts, say - and walking from every entry point
      // would run the timer's actions the moment a chat message arrived.
      const triggerNodeTypes = isChat
        ? CHAT_TRIGGER_NODE_TYPES
        : isOSC
          ? OSC_TRIGGER_NODE_TYPES
          : undefined;
      ranActions = walkEventGraph(
        graph,
        graphContext,
        entryNodesForDispatch(graph, graphContext, triggerNodeTypes),
      );
    } else if (event.commands) {
      // Mod-command virtual events aren't backed by a graph (they live in mod_commands.json)
      // and are always exactly one 'response' command - handled directly.
      const eCommand = event.commands[0];
      const thisCommand = EventResponseCommand(eCommand, eventName, streamMessage, extra);
      if (eCommand.delay == 0) {
        thisCommand();
      } else {
        setTimeout(thisCommand, eCommand.delay);
      }
      ranActions = 1;
    }

    if (ranActions === 0) {
      return;
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

  };

  // Runs only the branch hanging off one specific callback node, rather than every entry
  // point in the graph. Used by TimerService so a Timer Elapsed and a Timer Tick can live in
  // the same event without each firing the other's actions. Skips the cooldown/toggle
  // bookkeeping in runCommands, which is keyed to chat/OSC semantics that don't apply here.
  static runCommandsFromNode(
    streamMessage: StreamMessage,
    eventName: string,
    callbackNodeId: string,
    extra: KeyedObject = {},
  ) {
    const graph = EventService.getGraphs()[eventName];
    if (!graph) {
      return;
    }
    const event = EventService.getEvents()[eventName];
    streamMessage.triggeredEventData = event;

    // The callback itself isn't executed - its exec targets are where the branch begins.
    const entryNodeIds = graph.edges
      .filter((e) => e.fromNode === callbackNodeId && e.toPort === 'exec')
      .map((e) => e.toNode);
    if (entryNodeIds.length === 0) {
      return;
    }

    const graphContext = {
      eventName,
      streamMessage,
      extra,
      isChat: false,
      isOSC: false,
      event,
      activeEvents: EventService.getActiveEvents(),
    };

    walkEventGraph(graph, graphContext, entryNodeIds);
  }

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
