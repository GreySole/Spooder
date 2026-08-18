import { NodePortDef, TriggerNodeDef } from '../../Types';

// Every StreamModuleInterface implementation (Twitch today, eventually YouTube/etc.) builds
// its StreamMessage the same way, so a single 'Chat Message' trigger node shape works for
// all of them with no extra executor code - EventGraphExecutor resolves these output ports
// directly off the live StreamMessage for whichever platform fired it.
export function getChatMessageOutputs(): NodePortDef[] {
  return [
    { id: 'username', label: 'Username', dataType: 'string' },
    { id: 'displayName', label: 'Display Name', dataType: 'string' },
    { id: 'message', label: 'Message', dataType: 'string' },
    { id: 'isBroadcaster', label: 'Is Broadcaster', dataType: 'boolean' },
    { id: 'isMod', label: 'Is Mod', dataType: 'boolean' },
    { id: 'isSubscriber', label: 'Is Subscriber', dataType: 'boolean' },
    { id: 'isVIP', label: 'Is VIP', dataType: 'boolean' },
    { id: 'isFirstMessage', label: 'Is First Message', dataType: 'boolean' },
  ];
}

// A platform's 'any message' trigger, gated the same way chat_command is (mod/sub/vip/
// broadcaster) but with no command to match - it fires on every chat message.
export function buildChatMessageTriggerNode(): TriggerNodeDef {
  return {
    id: 'chat_message',
    label: 'Chat Message',
    description: 'Fires on every chat message, regardless of command.',
    form: {
      vip: { label: 'Require VIP', type: 'boolean' },
      mod: { label: 'Require Mod', type: 'boolean' },
      sub: { label: 'Require Subscriber', type: 'boolean' },
      broadcaster: { label: 'Require Broadcaster', type: 'boolean' },
    },
    defaults: { vip: false, mod: false, sub: false, broadcaster: false },
    outputs: getChatMessageOutputs(),
  };
}

// The old chat trigger's "search and match" mode, as a node of its own rather than a toggle on
// Chat Command - the two behave nothing alike (a prefix command vs a phrase matcher anywhere in
// the message) and don't even have the same ports, so one checkbox silently swapping between
// them was the wrong shape.
//
// The pattern field is still keyed `command`, not `pattern`: the runtime reads a chat trigger's
// text out of `triggers.chat.command` (see reconstructFlatEventFromGraph and
// checkResponseTrigger), and keeping the key means this node drops straight into that slot and
// an upgraded node keeps its pattern with no value rewriting.
export function buildChatSearchTriggerNode(): TriggerNodeDef {
  return {
    id: 'chat_search',
    label: 'Chat Search & Match',
    description:
      "Fires when a chat message matches a pattern anywhere in it, and hands out the words it matched. Each pattern word becomes a Match output: '*' takes any word, '*word' skips ahead to that word, '>pre' matches a word starting with 'pre', '<suf' one ending with 'suf', and 'a|b' either. Select the node for the full reference.",
    form: {
      command: { label: 'Pattern', type: 'text' },
      vip: { label: 'Require VIP', type: 'boolean' },
      mod: { label: 'Require Mod', type: 'boolean' },
      sub: { label: 'Require Subscriber', type: 'boolean' },
      broadcaster: { label: 'Require Broadcaster', type: 'boolean' },
    },
    defaults: { command: '', vip: false, mod: false, sub: false, broadcaster: false },
    // The Match ports aren't listed here: how many there are depends on the pattern the user
    // types, so the frontend derives them from it (see buildSearchMatchOutputs) and the executor
    // resolves them off the trigger's match array by port id.
    outputs: [
      { id: 'username', label: 'Username', dataType: 'string' },
      { id: 'message', label: 'Message', dataType: 'string' },
      // The whole match array, mirroring the Search & Match operation node. Typed 'any' because
      // a port type can't say 'array of string'.
      { id: 'matches', label: 'All Matches', dataType: 'any' },
    ],
  };
}
