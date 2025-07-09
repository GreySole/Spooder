import { KeyedObject, StreamMessage } from 'src/Types.ts';
import { EventService, sayInChat } from '../service/EventService.ts';
import { triggerExistsAndEnabled } from './EventTriggerUtil.ts';
import ModuleService from '../service/ModuleService.ts';

function matchConditions(a: string, b: string) {
  if (a.includes('|')) {
    let cSplitOR = a.split('|');
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
  let searchMode = false;
  if (triggerExistsAndEnabled(eventData.triggers, 'chat')) {
    if (eventData.triggers.chat.search) {
      searchMode = true;
    }
  }
  if (triggerExistsAndEnabled(eventData.triggers, 'osc')) {
    if (eventData.triggers.osc.search) {
      searchMode = true;
    }
  }
  let command = '';
  if (message.platform == 'osc') {
    command = eventData.triggers.osc.search?.command.toLowerCase();
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
  const responseScript = String.raw`
    async (runCommands, sayInChat, modules, _eventStorage, _saveEventStorage) => {
      const event = ${JSON.stringify(message)};
      const extra = ${JSON.stringify(extra)};
      function say(txt) {
        sayInChat(txt, ${JSON.stringify(message.platform)}, ${JSON.stringify(message.channel)});
      }
      const toUser = ${JSON.stringify(message.message.split(' ')[1])};
      const command = ${JSON.stringify(message.message.toLowerCase().split(' '))};
      function getVar(key, defaultVal = 0) {
        return _eventStorage[${JSON.stringify(eventName)}]?.[key] ?? defaultVal;
      }
      function setVar(key, value, save = true) {
        _eventStorage[${JSON.stringify(eventName)}] ??= {};
        _eventStorage[${JSON.stringify(eventName)}][key] = value;
        if (save == true && ${!useFakeStorage}) {
          _saveEventStorage(_eventStorage);
        }
      }
      function getSharedVar(eventname, key, defaultVal = 0) {
        return _eventStorage[eventname]?.[key] ?? defaultVal;
      }
      function setSharedVar(eventname, key, value, save = true) {
        _eventStorage[eventname] ??= {};
        _eventStorage[eventname][key] = value;
        if (save == true && ${!useFakeStorage}) {
          _saveEventStorage(_eventStorage);
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
      EventService.getEventStorage(),
      EventService.saveEventStorage,
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
