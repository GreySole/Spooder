import { ActionNodeDef, OperationNodeDef, TriggerNodeDef } from '../../Types';

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

export function getCoreActionNodes(): ActionNodeDef[] {
  return [
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
      form: {
        message: { label: 'Message', type: 'text', portType: 'string' },
      },
      defaults: { message: '' },
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

// The core manifest carried no triggers until timers arrived; NodeRegistryService now serves
// these the same way it serves module triggers, so the palette and executor share one source.
export function getCoreTriggerNodes(): TriggerNodeDef[] {
  return [
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
