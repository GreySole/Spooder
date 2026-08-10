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
