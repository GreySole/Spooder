import { EventService } from '../EventService.ts';
import OSCService from '../OSCService.ts';

export default function EventSoftwareCommand(
  eCommand: any,
  isChat: boolean,
  streamMessage: any,
  isOSC: boolean,
  event: any,
  activeEvents: any,
  eventName: string,
) {
  return () => {
    let commandDuration = parseFloat(eCommand.duration);
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
        OSCService.sendToUDP(eCommand.dest_udp, eCommand.address, eCommand.valueOn);
      }

      EventService.createTimeout(
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
                      OSCService.sendToUDP(
                        eCommand.dest_udp,
                        activeEvents[ae][command].event.address,
                        activeEvents[ae][command].event.valueOn,
                      );
                    } else {
                      continue;
                    }
                  }
                } else {
                  OSCService.sendToUDP(
                    eCommand.dest_udp,
                    activeEvents[ae][command].event.address,
                    activeEvents[ae][command].event.valueOn,
                  );
                }

                return;
              }
            }
          }
          OSCService.sendToUDP(eCommand.dest_udp, eCommand.address, eCommand.valueOff);
        },
        commandDuration,
      );
    } else if (eCommand.etype == 'button-press') {
      OSCService.sendToUDP(eCommand.dest_udp, eCommand.address, eCommand.valueOn);
      setTimeout(function () {
        OSCService.sendToUDP(eCommand.dest_udp, eCommand.address, eCommand.valueOff);
      }, 500);
    } else if (eCommand.etype == 'oneshot') {
      OSCService.sendToUDP(eCommand.dest_udp, eCommand.address, eCommand.valueOn);
    }
  };
}
