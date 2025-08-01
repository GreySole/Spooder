import { spooderLog } from 'src/core/Logging';
import { EventService, sayInChat } from '../EventService';
import ModuleService from '../ModuleService';
import Discord from 'src/integration/discord/main';
import { runResponseScript } from 'src/core/util/ResponseUtil';

export default function EventDiscordCommand(
  eCommand: any,
  eventName: string,
  streamMessage: any,
  extra: any,
) {
  const discord = ModuleService.getCommunityModule('discord') as Discord;
  return async () => {
    if (eCommand.function === 'message') {
      try {
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
        spooderLog(
          `Failed to run response script for ${eventName}. Check the event settings to verify it.`,
          e,
        );
      }
    }
  };
}
