import { ActionNodeDef, NodePortDef, OperationNodeDef, TriggerNodeDef } from '../../Types';

function eventNameField() {
  return {
    label: 'Event Name (empty = current event)',
    type: 'text' as const,
    portType: 'string' as const,
  };
}

export function getCoreOperationNodes(): OperationNodeDef[] {
  return [
    {
      id: 'get_string_value',
      label: 'Get String Value',
      category: 'storage',
      form: {
        eventName: eventNameField(),
        key: { label: 'Key', type: 'text', portType: 'string' },
        defaultValue: { label: 'Default Value', type: 'text', portType: 'string' },
      },
      defaults: { eventName: '', key: '', defaultValue: '' },
      outputs: [{ id: 'value', label: 'Value', dataType: 'string' }],
    },
    {
      id: 'get_number_value',
      label: 'Get Number Value',
      category: 'storage',
      form: {
        eventName: eventNameField(),
        key: { label: 'Key', type: 'text', portType: 'string' },
        defaultValue: { label: 'Default Value', type: 'number', portType: 'number' },
      },
      defaults: { eventName: '', key: '', defaultValue: 0 },
      outputs: [{ id: 'value', label: 'Value', dataType: 'number' }],
    },
    {
      id: 'get_array_value',
      label: 'Get Array Value',
      description: 'Reads an array stored by a Set Array Value node. Missing keys - and keys holding something that is not an array - read as an empty array.',
      category: 'storage',
      form: {
        eventName: eventNameField(),
        key: { label: 'Key', type: 'text', portType: 'string' },
      },
      defaults: { eventName: '', key: '' },
      outputs: [
        { id: 'value', label: 'Array', dataType: 'any' },
        { id: 'length', label: 'Length', dataType: 'number' },
      ],
    },
    {
      id: 'get_boolean_value',
      label: 'Get Boolean Value',
      category: 'storage',
      form: {
        eventName: eventNameField(),
        key: { label: 'Key', type: 'text', portType: 'string' },
        defaultValue: { label: 'Default Value', type: 'boolean', portType: 'boolean' },
      },
      defaults: { eventName: '', key: '', defaultValue: false },
      outputs: [{ id: 'value', label: 'Value', dataType: 'boolean' }],
    },
  ];
}

// `streamPlatforms` are the stream modules ModuleService actually loaded, so the branch node
// grows a port per platform without this module having to import (and cycle through) the module
// registry. An installed-but-logged-out module still counts: modules register at load, and ports
// that came and went with a login would strand the edges wired to them.
export function getCoreActionNodes(streamPlatforms: string[] = []): ActionNodeDef[] {
  return [
    {
      id: 'platform_branch',
      label: 'Branch By Platform',
      description:
        "Runs the branch matching the stream module a message came from. Leave Platform unwired to use the platform of the event being handled; wire it to test some other value. A platform with no branch wired simply stops here.",
      form: {
        platform: {
          label: 'Platform (empty = this event\'s)',
          type: 'port',
          portType: 'string',
        },
      },
      defaults: {},
      execOutputs: streamPlatforms.map((platform) => ({ id: platform, label: platform })),
    },
    {
      id: 'if',
      label: 'If',
      description: 'Branches execution based on a boolean condition (then/else).',
      form: {
        condition: { label: 'Condition', type: 'boolean', portType: 'boolean' },
      },
      defaults: { condition: false },
      execOutputs: [
        { id: 'then', label: 'Then' },
        { id: 'else', label: 'Else' },
      ],
    },
    {
      id: 'set_array_value',
      label: 'Set Array Value',
      description: "Stores an array under a key, for any event to read back later. Wire it from an array node - a scalar is stored as a one-item array.",
      form: {
        eventName: eventNameField(),
        key: { label: 'Key', type: 'text', portType: 'string' },
        value: { label: 'Array', type: 'port', portType: 'any' },
      },
      defaults: { eventName: '', key: '' },
    },
    {
      id: 'set_string_value',
      label: 'Set String Value',
      form: {
        eventName: eventNameField(),
        key: { label: 'Key', type: 'text', portType: 'string' },
        value: { label: 'Value', type: 'text', portType: 'string' },
      },
      defaults: { eventName: '', key: '', value: '' },
    },
    {
      id: 'set_number_value',
      label: 'Set Number Value',
      form: {
        eventName: eventNameField(),
        key: { label: 'Key', type: 'text', portType: 'string' },
        value: { label: 'Value', type: 'number', portType: 'number' },
      },
      defaults: { eventName: '', key: '', value: 0 },
    },
    {
      id: 'set_boolean_value',
      label: 'Set Boolean Value',
      form: {
        eventName: eventNameField(),
        key: { label: 'Key', type: 'text', portType: 'string' },
        value: { label: 'Value', type: 'boolean', portType: 'boolean' },
      },
      defaults: { eventName: '', key: '', value: false },
    },
    {
      id: 'say_in_chat',
      label: 'Say In Chat',
      description:
        "Posts a message to chat. Platform 'None' replies wherever the event came from - the channel of the message that triggered it, or every platform's home channel when nothing chatted (a timer, an OSC message). Pick a platform to post there instead, or 'All platforms' to post to every connected one at once.",
      form: {
        message: { label: 'Message', type: 'text', portType: 'string' },
        // A select that still takes a wire: the options are the platforms installed right now,
        // and a wired value (a chat trigger's Platform output, say) overrides the picker.
        platform: {
          label: 'Platform (None = where the event came from)',
          type: 'select',
          portType: 'string',
          options: {
            selections: {
              all: 'All platforms',
              ...Object.fromEntries(streamPlatforms.map((platform) => [platform, platform])),
            },
          },
        },
        channel: {
          label: 'Channel (empty = home channel)',
          type: 'text',
          portType: 'string',
        },
      },
      defaults: { message: '', platform: '', channel: '' },
    },
    {
      id: 'trigger_event',
      label: 'Trigger Event',
      description: 'Directly invokes another event by name, bypassing its trigger matching.',
      form: {
        eventName: { label: 'Event Name', type: 'text', portType: 'string' },
      },
      defaults: { eventName: '' },
    },
    {
      id: 'start_timer',
      label: 'Start Timer',
      description:
        'Starts a named countdown. Starting a running timer resets it. Timer names are global, so any event can react to it.',
      form: {
        name: { label: 'Timer Name', type: 'text', portType: 'string' },
        duration: { label: 'Duration (Seconds)', type: 'number', portType: 'number' },
        repeat: { label: 'Repeat', type: 'boolean', portType: 'boolean' },
      },
      defaults: { name: '', duration: 5, repeat: false },
    },
    {
      id: 'stop_timer',
      label: 'Stop Timer',
      description: 'Cancels a named timer, including any ticks it is driving.',
      form: {
        name: { label: 'Timer Name', type: 'text', portType: 'string' },
      },
      defaults: { name: '' },
    },
    {
      id: 'osc_claim',
      label: 'OSC Claim',
      description:
        'Takes shared ownership of an OSC address at a priority. The highest-priority active claim decides the value, so overlapping events do not clobber each other. Release it with OSC Release. Do not drive the same address with a legacy OSC Send node - the two do not share state.',
      form: {
        dest_udp: {
          label: 'Destination',
          type: 'custom',
          portType: 'string',
          options: { component: 'udpSelect' },
        },
        address: { label: 'Address', type: 'text', portType: 'string' },
        // Scopes contention within an address without changing what is sent: MIDI puts
        // everything on /cc, so two events only conflict on the same CC number.
        slot: { label: 'Slot (optional)', type: 'text', portType: 'string' },
        value: { label: 'Value', type: 'text', portType: 'string' },
        releaseValue: { label: 'Value On Release', type: 'text', portType: 'string' },
        priority: { label: 'Priority', type: 'number', portType: 'number' },
      },
      defaults: { dest_udp: '-1', address: '', slot: '', value: '1', releaseValue: '0', priority: 0 },
    },
    {
      id: 'osc_release',
      label: 'OSC Release',
      description:
        "Gives up this event's claim on an address. If another event still holds it, its value is restored; otherwise the claim's Value On Release is sent.",
      form: {
        dest_udp: {
          label: 'Destination',
          type: 'custom',
          portType: 'string',
          options: { component: 'udpSelect' },
        },
        address: { label: 'Address', type: 'text', portType: 'string' },
        slot: { label: 'Slot (optional)', type: 'text', portType: 'string' },
      },
      defaults: { dest_udp: '-1', address: '', slot: '' },
    },
    {
      id: 'delay',
      label: 'Delay',
      description:
        'Waits the given number of seconds, then continues to the next node. For pauses that do not need a named, externally controllable timer.',
      form: {
        seconds: { label: 'Seconds', type: 'number', portType: 'number' },
      },
      defaults: { seconds: 1 },
    },
  ];
}

// Chat triggers are core, not per-platform: every StreamModuleInterface builds the same
// StreamMessage, and EventGraphExecutor resolves these ports straight off it - so one node
// works for whichever platform delivered the message. A platform with no concept of a field
// (YouTube has no VIPs or first-message flag) simply reports false for it rather than needing
// a node shape of its own.
// Port ids are StreamMessage field names, because that's literally how they resolve: the
// executor reads `streamMessage[portId]` for a callback's data port. Adding a field to
// StreamMessage and listing it here is all a new output takes.
//
// 'respond' is deliberately absent (it's a function, only useful from plugin code), as are the
// three *EventData bags - those are raw platform payloads with no fixed shape to type a port
// with. A platform that has no concept of a field (YouTube has no VIPs) reports its StreamMessage
// default, so the port is false rather than missing.
function chatMessageOutputs(): NodePortDef[] {
  return [
    { id: 'username', label: 'Username', dataType: 'string' },
    { id: 'displayName', label: 'Display Name', dataType: 'string' },
    { id: 'userId', label: 'User ID', dataType: 'string' },
    { id: 'message', label: 'Message', dataType: 'string' },
    { id: 'platform', label: 'Platform', dataType: 'string' },
    { id: 'channel', label: 'Channel', dataType: 'string' },
    { id: 'messageType', label: 'Message Type', dataType: 'string' },
    { id: 'isBroadcaster', label: 'Is Broadcaster', dataType: 'boolean' },
    { id: 'isMod', label: 'Is Mod', dataType: 'boolean' },
    { id: 'isSubscriber', label: 'Is Subscriber', dataType: 'boolean' },
    { id: 'isVIP', label: 'Is VIP', dataType: 'boolean' },
    { id: 'isFirstMessage', label: 'Is First Message', dataType: 'boolean' },
    { id: 'isReturningChatter', label: 'Is Returning Chatter', dataType: 'boolean' },
    { id: 'shareId', label: 'Share ID', dataType: 'string' },
    // Arrays and objects: 'any' is as close as a port type gets. Useful wired into a plugin
    // action that knows their shape.
    { id: 'emotes', label: 'Emotes', dataType: 'any' },
    { id: 'tags', label: 'Tags', dataType: 'any' },
  ];
}

// The same mod/sub/vip/broadcaster gating both chat triggers offer.
function chatGateFields() {
  return {
    vip: { label: 'Require VIP', type: 'boolean' as const },
    mod: { label: 'Require Mod', type: 'boolean' as const },
    sub: { label: 'Require Subscriber', type: 'boolean' as const },
    broadcaster: { label: 'Require Broadcaster', type: 'boolean' as const },
  };
}

const CHAT_GATE_DEFAULTS = { vip: false, mod: false, sub: false, broadcaster: false };

// The core manifest carried no triggers until timers arrived; NodeRegistryService now serves
// these the same way it serves module triggers, so the palette and executor share one source.
export function getCoreTriggerNodes(): TriggerNodeDef[] {
  return [
    {
      id: 'chat_command',
      label: 'Chat Command',
      description:
        "Fires when a chat message starts with this command, on any connected chat platform. Set Arg Count to expose the words that follow it as Arg outputs. To match a phrase anywhere in a message instead, trigger on Chat Message and run its text through a Search & Match node.",
      form: {
        command: { label: 'Command', type: 'text' },
        argCount: { label: 'Arg Count', type: 'number' },
        ...chatGateFields(),
      },
      defaults: { command: '', argCount: 0, ...CHAT_GATE_DEFAULTS },
      // The Arg ports aren't listed: how many there are is the user's Arg Count, so the frontend
      // draws them from it and the executor resolves them off the message that fired the event.
      outputs: chatMessageOutputs(),
    },
    {
      id: 'chat_message',
      label: 'Chat Message',
      description:
        'Fires on every chat message on any connected chat platform, regardless of command.',
      form: chatGateFields(),
      defaults: { ...CHAT_GATE_DEFAULTS },
      outputs: chatMessageOutputs(),
    },
    {
      id: 'timer_elapsed',
      label: 'Timer Elapsed',
      description: "Fires when the named timer's time is up. Repeats fire it each cycle.",
      form: {
        name: { label: 'Timer Name', type: 'text', portType: 'string' },
      },
      defaults: { name: '' },
      outputs: [{ id: 'name', label: 'Timer Name', dataType: 'string' }],
    },
    {
      id: 'timer_tick',
      label: 'Timer Tick',
      description: 'Fires on a set interval for as long as the named timer is running.',
      form: {
        name: { label: 'Timer Name', type: 'text', portType: 'string' },
        interval: { label: 'Interval (Seconds)', type: 'number', portType: 'number' },
      },
      defaults: { name: '', interval: 1 },
      outputs: [
        { id: 'name', label: 'Timer Name', dataType: 'string' },
        { id: 'elapsed', label: 'Elapsed (Seconds)', dataType: 'number' },
        { id: 'remaining', label: 'Remaining (Seconds)', dataType: 'number' },
      ],
    },
  ];
}
