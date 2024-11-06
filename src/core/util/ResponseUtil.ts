import { KeyedObject, StreamMessage } from 'src/Types.ts';
import { EventService } from '../service/EventService.ts';

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
      JSON.stringify(EventService.getEventStorage()) +
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
    return {
      status: 'error',
      response: e.stack != null ? e.stack : e,
    };
  }
}
