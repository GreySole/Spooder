import { spooderLog } from 'src/core/Logging.ts';
import { EventService, sayInChat } from '../EventService.ts';

export default function EventResponseCommand(
  eCommand: any,
  eventName: string,
  streamMessage: any,
  extra: any,
) {
  const eventstorage = EventService.getEventStorage();
  return async () => {
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
      spooderLog('Failed to run response script. Check the event settings to verify it.', e);
    }
  };
}
