import { KeyedObject, StreamMessage } from '../../Types';
import EventStorageService from '../service/EventStorageService';
import { EventService, sayInChat } from '../service/EventService';
import ModuleService from '../service/ModuleService';
import { matchSearchPattern } from './SearchMatchUtil';

export function checkResponseTrigger(eventData: KeyedObject, message: StreamMessage) {
  // Which trigger's own settings apply is decided by where this message actually came from,
  // not by OR-ing every trigger type's `search` flag together: an OSC trigger node always
  // carries a `search` sub-object (its arg/command config, present regardless of handletype),
  // so an event with both a chat_command and an osc_trigger node had every chat message pulled
  // into OSC's pattern matcher instead of chat's own plain command-prefix check - and a `!`
  // -prefixed command can never match there, since the matcher strips punctuation from the
  // incoming text but not from the pattern.
  const isOscMessage = message.platform == 'osc';
  let command = '';
  let searchMode = false;
  if (isOscMessage) {
    command = eventData.triggers.osc.search?.command.toLowerCase();
    searchMode = eventData.triggers.osc.handletype === 'search';
  } else {
    command = eventData.triggers.chat.command.toLowerCase();
    searchMode = Boolean(eventData.triggers.chat.search);
  }
  if (searchMode == true) {
    // The matcher itself lives in SearchMatchUtil, shared with the Search & Match operation
    // node. The words it returns become this event's `extra` - the match array a response
    // script reads as extra[] and the trigger node's Match ports resolve from.
    const matched = matchSearchPattern(command, message.message);
    if (matched) {
      return {
        message: message,
        extra: matched,
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

export function buildMockStreamMessage(message: string): StreamMessage {
  return {
    userId: '000000000',
    username: 'testchannel',
    displayName: 'TestChannel',
    platform: 'twitch',
    channel: '#testchannel',
    message: message,
    messageType: 'twitch-chat',
    respond: (txt: string) => {},
    emotes: [],
    tags: {
      badgeInfo: 'subscriber/1',
      badges: { broadcaster: true, subscriber: 0 },
      clientNonce: '00000000000000000000000000000000',
      color: '#1E90FF',
      displayName: 'TestChannel',
      emotes: [],
      firstMsg: '0',
      flags: '',
      id: '00000000-0000-0000-0000-000000000000',
      mod: '0',
      roomId: '000000000',
      subscriber: '1',
      tmiSentTs: '0000000000000',
      turbo: '0',
      userId: '000000000',
      userType: '',
      bits: undefined,
      emoteSets: [],
      username: 'testchannel',
      isModerator: false,
    },
    isBroadcaster: false,
    isMod: false,
    isSubscriber: false,
    isVIP: false,
    isFirstMessage: false,
    isReturningChatter: false,
  };
}

export async function runResponseScript(
  eventName: string,
  message: StreamMessage,
  extra: any,
  script: string,
  useFakeStorage = false,
) {
  console.log("Processing message", message);

  // In fake/test mode (verifyResponseScript), reads/writes are shadowed by a local overlay
  // so a script preview never touches the real database - only visible within this one call.
  const fakeOverlay = useFakeStorage ? new Map<string, any>() : null;
  const overlayKey = (evName: string, key: string) => `${evName}::${key}`;

  function getStorageValue(evName: string, key: string, defaultVal: any) {
    if (fakeOverlay?.has(overlayKey(evName, key))) {
      return fakeOverlay.get(overlayKey(evName, key));
    }
    return EventStorageService.getRawValue(evName, key, defaultVal);
  }

  function setStorageValue(evName: string, key: string, value: any) {
    if (fakeOverlay) {
      fakeOverlay.set(overlayKey(evName, key), value);
      return;
    }
    EventStorageService.setRawValue(evName, key, value);
  }

  const responseScript = String.raw`
    async (runCommands, sayInChat, modules, activeVars, _getStorageValue, _setStorageValue) => {
      const event = ${JSON.stringify(message)};
      const extra = ${JSON.stringify(extra)};
      function say(txt) {
        sayInChat(txt, ${JSON.stringify(message.platform)}, ${JSON.stringify(message.channel)});
      }
      const toUser = ${JSON.stringify(message?.message?.split(' ')[1])};
      const command = ${JSON.stringify(message?.message?.toLowerCase().split(' '))};
      function getVar(key, defaultVal = 0) {
        return _getStorageValue(${JSON.stringify(eventName)}, key, defaultVal);
      }
      function setVar(key, value, save = true) {
        if (save == true) {
          _setStorageValue(${JSON.stringify(eventName)}, key, value);
        }
      }
      function getSharedVar(eventname, key, defaultVal = 0) {
        return _getStorageValue(eventname, key, defaultVal);
      }
      function setSharedVar(eventname, key, value, save = true) {
        if (save == true) {
          _setStorageValue(eventname, key, value);
        }
      }
      function getTimer(name){
        return activeVars[name] ?? 0;
      }
      function setTimer(name, duration, cb) {
        activeVars[name] = {
          expires: Date.now() + duration * 1000,
          callback:cb,
          timeout: setTimeout(() => {
            delete activeVars[name];
            try {
              cb();
            } catch (e) {
              console.error('Error in timer callback for ' + name + ':', e);
            }
          }, duration * 1000),
          duration
        };
      }
      function clearTimer(name, callCallback = false){
        const timer = activeVars[name];
        if (timer) {
          clearTimeout(timer.timeout);
          if (callCallback) {
            try {
              timer.callback();
            } catch (e) {
              console.error('Error in timer callback for ' + name + ':', e);
            }
          }
          delete activeVars[name];
        }
      }
      function chooseRandom(...randArray) {
        return randArray[Math.floor(Math.random() * randArray.length)];
      }
      function chooseRandom(randArray) {
        return randArray[Math.floor(Math.random() * randArray.length)];
      }
      function sanitize(text) {
        return text.replace(/[\`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/g, '');
      }
      function runEvent(eName, extra) {
        runCommands(event, eName, event.messageType, extra);
      }
      ${script}
    }
  `;

  const responseHandlers = ModuleService.getResponseHandlers();
  const responseHandlerFunctions = {} as KeyedObject;
  Object.entries(responseHandlers).forEach(([key, value]) => {
    responseHandlerFunctions[key] = value.functions;
  });
  try {
    const responseFunct = await eval(responseScript);
    const response = await responseFunct(
      EventService.runCommands,
      sayInChat,
      responseHandlerFunctions,
      EventService.getActiveResponseVariables(),
      getStorageValue,
      setStorageValue,
    );
    return { status: 'ok', response };
  } catch (e: any) {
    return { status: 'error', response: typeof e == 'object' ? e.message : e };
  }
}

export async function verifyResponseScript(
  eventName: string,
  message: StreamMessage,
  extra: string[],
  script: string,
) {
  return await runResponseScript(eventName, message, extra, script, true);
}
