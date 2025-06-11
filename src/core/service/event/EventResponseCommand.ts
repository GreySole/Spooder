import { spooderLog } from 'src/core/Logging.ts';
import { EventService, sayInChat } from '../EventService.ts';
import { runResponseScript } from 'src/core/util/ResponseUtil.ts';

export default function EventResponseCommand(
  eCommand: any,
  eventName: string,
  streamMessage: any,
  extra: any,
) {
  return async () => {
    if (eCommand.etype === 'recurring') {
      EventService.startRecurringMessage(eventName, eCommand.interval_key, eCommand);
      return;
    } else if (eCommand.etype === 'clear_recurring') {
      EventService.stopRecurringMessage(eCommand.interval_key);
      return;
    }
    try {
      const response = await runResponseScript(
        eventName,
        streamMessage,
        extra,
        eCommand.message,
        false,
      );

      if (response.status === 'error') {
        throw new Error(response.response);
      }

      sayInChat(response.response, streamMessage.platform, streamMessage.channel);
    } catch (e) {
      spooderLog(
        `Failed to run response script for ${eventName}. Check the event settings to verify it.`,
        e,
      );
    }
  };
}
