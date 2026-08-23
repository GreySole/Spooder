import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// Discord's own ceilings. A message carries at most five action rows of five buttons each, and
// a label is capped at 80 characters; exceeding any of them is rejected by the API rather than
// trimmed, so all three are enforced here - the values coming in are whatever someone typed
// into a node.
const BUTTONS_PER_ROW = 5;
export const MAX_BUTTONS = BUTTONS_PER_ROW * 5;
const MAX_LABEL_LENGTH = 80;

// The four styles a clickable button can take. Discord's ButtonStyle also has Link and Premium,
// but neither carries a customId - the API types spell this out, restricting a custom-id button
// to exactly these four - so neither can be an interaction button and neither is offered.
// Keep the keys in step with BUTTON_STYLE_SELECTIONS in the editor's nodeDefLookup.
export const BUTTON_STYLES: { [name: string]: ButtonStyle } = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

const DEFAULT_BUTTON_STYLE = ButtonStyle.Primary;

export interface DiscordButtonDef {
  // Becomes the interaction's customId, and is the exec port the graph branches on. Positional
  // ('button0'), never derived from the label, so renaming a button can't move a wire.
  id: string;
  label: string;
  // A key of BUTTON_STYLES. Unset - a slot grown after the node was created, or one left on the
  // picker's 'None' - is Primary, which is Discord's own default for a plain button.
  style?: string;
}

export default function DiscordButtons() {
  function makeLinkButton(label: string, url: string) {
    const button = new ButtonBuilder().setLabel(label).setURL(url).setStyle(ButtonStyle.Link);
    const row = new ActionRowBuilder().addComponents(button);
    return row;
  }

  // Returns one action row per five buttons, which is how a prompt gets past five options at
  // all - the rows are a layout detail of the message, not something the graph should have to
  // think about, so the node counts buttons and this chunks them.
  function makeButtons(buttons: DiscordButtonDef[]) {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (const button of buttons.slice(0, MAX_BUTTONS)) {
      if (rows.length === 0 || rows[rows.length - 1].components.length === BUTTONS_PER_ROW) {
        rows.push(new ActionRowBuilder<ButtonBuilder>());
      }
      rows[rows.length - 1].addComponents(
        new ButtonBuilder()
          .setCustomId(button.id)
          .setLabel(button.label.slice(0, MAX_LABEL_LENGTH))
          .setStyle(BUTTON_STYLES[button.style ?? ''] ?? DEFAULT_BUTTON_STYLE),
      );
    }
    return rows;
  }

  return { makeLinkButton, makeButtons };
}
