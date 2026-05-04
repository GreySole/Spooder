import { ButtonStyle, ButtonBuilder, ActionRowBuilder } from 'discord.js';

export default function DiscordButtons() {
  function makeLinkButton(label: string, url: string) {
    const button = new ButtonBuilder().setLabel(label).setURL(url).setStyle(ButtonStyle.Link);
    const row = new ActionRowBuilder().addComponents(button);
    return row;
  }

  function makeConfirmCancelButtons(confirmLabel: string, cancelLabel: string) {
    const confirmButton = new ButtonBuilder()
      .setCustomId('confirm')
      .setLabel(confirmLabel)
      .setStyle(ButtonStyle.Primary);
    const cancelButton = new ButtonBuilder()
      .setCustomId('cancel')
      .setLabel(cancelLabel)
      .setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
    return row;
  }

  return { makeLinkButton, makeConfirmCancelButtons };
}
