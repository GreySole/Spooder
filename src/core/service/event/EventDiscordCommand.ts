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
    if (eCommand.function === 'message') {
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

        const components = [];

        if (eCommand.use_link_button) {
          const link = eCommand.link_url;
          const label = eCommand.link_label || 'Button';
          const linkButton = discord.buttons.makeLinkButton(label, link);
          components.push(linkButton);
        }

        discord.chat.sendToChannel(eCommand.guild, eCommand.channel, response.response, components);
      } catch (e) {
        spooderLog('Failed to run response script. Check the event settings to verify it.', e);
      }
    }
  };
}
