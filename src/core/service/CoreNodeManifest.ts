import { ActionNodeDef, OperationNodeDef } from '../../Types';

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
  ];
}
