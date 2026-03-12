import Discord from '../../../integration/discord/discord';
import { spooderLog } from '../../Logging';
import { runResponseScript } from '../../util/ResponseUtil';
import ModuleService from '../ModuleService';

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

        const roleTag = eCommand.role ? discord.chat.makeRoleTag(eCommand.role) : null;

        discord.chat.sendToChannel(
          eCommand.guild,
          eCommand.channel,
          `${roleTag ? roleTag + ' ' : ''}${response.response}`,
          components,
        );
      } catch (e) {
        spooderLog(
          `Failed to run response script for ${eventName}. Check the event settings to verify it.`,
          e,
        );
      }
    }
  };
}
