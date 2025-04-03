import { spooderLog } from 'src/core/Logging.ts';
import { EventService, sayInChat } from '../EventService.ts';
import ModuleService from '../ModuleService.ts';
import Discord from 'src/integration/discord/main.ts';
import { runResponseScript } from 'src/core/util/ResponseUtil.ts';

export default function EventDiscordCommand(
  eCommand: any,
  eventName: string,
  streamMessage: any,
  extra: any,
) {
  const discord = ModuleService.getCommunityModule('discord') as Discord;

  const eventstorage = EventService.getEventStorage();
  return async () => {
    try {
      if (eventstorage[eventName] == null) {
        eventstorage[eventName] = {};
      }

      const response = await runResponseScript(
        eventName,
        streamMessage,
        extra,
        eCommand.message,
        false,
      );

      sayInChat(response.response, streamMessage.platform, streamMessage.channel);
      discord.sendToChannel(eCommand.guild, eCommand.channel, response);
    } catch (e) {
      spooderLog('Failed to run response script. Check the event settings to verify it.', e);
    }
  };
}
