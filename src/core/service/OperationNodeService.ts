import { KeyedObject, OperationNodeDef } from '../../Types';

const MATH_NODES: OperationNodeDef[] = [
  {
    id: 'add',
    label: 'Add',
    category: 'math',
    form: {
      a: { label: 'A', type: 'number', portType: 'number' },
      b: { label: 'B', type: 'number', portType: 'number' },
    },
    defaults: { a: 0, b: 0 },
    outputs: [{ id: 'result', label: 'Result', dataType: 'number' }],
  },
  {
    id: 'subtract',
    label: 'Subtract',
    category: 'math',
    form: {
      a: { label: 'A', type: 'number', portType: 'number' },
      b: { label: 'B', type: 'number', portType: 'number' },
    },
    defaults: { a: 0, b: 0 },
    outputs: [{ id: 'result', label: 'Result', dataType: 'number' }],
  },
  {
    id: 'multiply',
    label: 'Multiply',
    category: 'math',
    form: {
      a: { label: 'A', type: 'number', portType: 'number' },
      b: { label: 'B', type: 'number', portType: 'number' },
    },
    defaults: { a: 0, b: 1 },
    outputs: [{ id: 'result', label: 'Result', dataType: 'number' }],
  },
  {
    id: 'divide',
    label: 'Divide',
    category: 'math',
    form: {
      a: { label: 'A', type: 'number', portType: 'number' },
      b: { label: 'B', type: 'number', portType: 'number' },
    },
    defaults: { a: 0, b: 1 },
    outputs: [{ id: 'result', label: 'Result', dataType: 'number' }],
  },
  {
    id: 'random_int',
    label: 'Random Integer',
    description: 'A random whole number between min and max, inclusive.',
    category: 'math',
    form: {
      min: { label: 'Min', type: 'number', portType: 'number' },
      max: { label: 'Max', type: 'number', portType: 'number' },
    },
    defaults: { min: 1, max: 6 },
    outputs: [{ id: 'result', label: 'Result', dataType: 'number' }],
  },
];

const STRING_NODES: OperationNodeDef[] = [
  {
    id: 'trim',
    label: 'Trim',
    category: 'string',
    form: {
      text: { label: 'Text', type: 'text', portType: 'string' },
    },
    defaults: { text: '' },
    outputs: [{ id: 'result', label: 'Result', dataType: 'string' }],
  },
  {
    id: 'concat',
    label: 'Concat',
    category: 'string',
    form: {
      a: { label: 'A', type: 'text', portType: 'string' },
      b: { label: 'B', type: 'text', portType: 'string' },
    },
    defaults: { a: '', b: '' },
    outputs: [{ id: 'result', label: 'Result', dataType: 'string' }],
  },
  {
    id: 'substring',
    label: 'Substring',
    category: 'string',
    form: {
      text: { label: 'Text', type: 'text', portType: 'string' },
      start: { label: 'Start', type: 'number', portType: 'number' },
      end: { label: 'End', type: 'number', portType: 'number' },
    },
    defaults: { text: '', start: 0, end: 0 },
    outputs: [{ id: 'result', label: 'Result', dataType: 'string' }],
  },
  {
    id: 'sanitize',
    label: 'Sanitize',
    description: 'Strips punctuation/symbol characters from text.',
    category: 'string',
    form: {
      text: { label: 'Text', type: 'text', portType: 'string' },
    },
    defaults: { text: '' },
    outputs: [{ id: 'result', label: 'Result', dataType: 'string' }],
  },
  {
    id: 'word_at',
    label: 'Word At',
    description: 'Splits text on spaces and returns the word at the given index (0-based).',
    category: 'string',
    form: {
      text: { label: 'Text', type: 'text', portType: 'string' },
      index: { label: 'Index', type: 'number', portType: 'number' },
    },
    defaults: { text: '', index: 0 },
    outputs: [{ id: 'result', label: 'Result', dataType: 'string' }],
  },
];

const LOGIC_NODES: OperationNodeDef[] = [
  {
    id: 'equals',
    label: 'Equals',
    category: 'logic',
    form: {
      a: { label: 'A', type: 'text', portType: 'any' },
      b: { label: 'B', type: 'text', portType: 'any' },
    },
    defaults: { a: '', b: '' },
    outputs: [{ id: 'result', label: 'Result', dataType: 'boolean' }],
  },
  {
    id: 'greater_than',
    label: 'Greater Than',
    category: 'logic',
    form: {
      a: { label: 'A', type: 'number', portType: 'number' },
      b: { label: 'B', type: 'number', portType: 'number' },
    },
    defaults: { a: 0, b: 0 },
    outputs: [{ id: 'result', label: 'Result', dataType: 'boolean' }],
  },
  {
    id: 'less_than',
    label: 'Less Than',
    category: 'logic',
    form: {
      a: { label: 'A', type: 'number', portType: 'number' },
      b: { label: 'B', type: 'number', portType: 'number' },
    },
    defaults: { a: 0, b: 0 },
    outputs: [{ id: 'result', label: 'Result', dataType: 'boolean' }],
  },
  {
    id: 'string_contains',
    label: 'String Contains',
    category: 'logic',
    form: {
      text: { label: 'Text', type: 'text', portType: 'string' },
      search: { label: 'Search', type: 'text', portType: 'string' },
    },
    defaults: { text: '', search: '' },
    outputs: [{ id: 'result', label: 'Result', dataType: 'boolean' }],
  },
  {
    id: 'string_starts_with',
    label: 'String Starts With',
    category: 'logic',
    form: {
      text: { label: 'Text', type: 'text', portType: 'string' },
      prefix: { label: 'Prefix', type: 'text', portType: 'string' },
    },
    defaults: { text: '', prefix: '' },
    outputs: [{ id: 'result', label: 'Result', dataType: 'boolean' }],
  },
  {
    id: 'and',
    label: 'And',
    category: 'logic',
    form: {
      a: { label: 'A', type: 'boolean', portType: 'boolean' },
      b: { label: 'B', type: 'boolean', portType: 'boolean' },
    },
    defaults: { a: false, b: false },
    outputs: [{ id: 'result', label: 'Result', dataType: 'boolean' }],
  },
  {
    id: 'or',
    label: 'Or',
    category: 'logic',
    form: {
      a: { label: 'A', type: 'boolean', portType: 'boolean' },
      b: { label: 'B', type: 'boolean', portType: 'boolean' },
    },
    defaults: { a: false, b: false },
    outputs: [{ id: 'result', label: 'Result', dataType: 'boolean' }],
  },
  {
    id: 'not',
    label: 'Not',
    category: 'logic',
    form: {
      value: { label: 'Value', type: 'boolean', portType: 'boolean' },
    },
    defaults: { value: false },
    outputs: [{ id: 'result', label: 'Result', dataType: 'boolean' }],
  },
];

const RANDOM_NODES: OperationNodeDef[] = [
  {
    id: 'choose_random',
    label: 'Choose Random',
    category: 'random',
    form: {
      a: { label: 'Option A', type: 'text', portType: 'string' },
      b: { label: 'Option B', type: 'text', portType: 'string' },
      c: { label: 'Option C (optional)', type: 'text', portType: 'string' },
      d: { label: 'Option D (optional)', type: 'text', portType: 'string' },
    },
    defaults: { a: '', b: '', c: '', d: '' },
    outputs: [{ id: 'result', label: 'Result', dataType: 'string' }],
  },
];

export default class OperationNodeService {
  static getOperationNodes(): OperationNodeDef[] {
    return [...MATH_NODES, ...STRING_NODES, ...LOGIC_NODES, ...RANDOM_NODES];
  }

  static isOperationNode(nodeTypeId: string): boolean {
    return OperationNodeService.getOperationNodes().some((n) => n.id === nodeTypeId);
  }

  // Pure evaluation: given resolved input values, returns the node's output port values.
  // No side effects, no ctx needed - safe to call repeatedly for the same inputs.
  static evaluate(nodeTypeId: string, values: KeyedObject): KeyedObject {
    switch (nodeTypeId) {
      case 'add':
        return { result: Number(values.a) + Number(values.b) };
      case 'subtract':
        return { result: Number(values.a) - Number(values.b) };
      case 'multiply':
        return { result: Number(values.a) * Number(values.b) };
      case 'divide':
        return { result: Number(values.a) / Number(values.b) };
      case 'random_int': {
        const min = Number(values.min);
        const max = Number(values.max);
        return { result: Math.floor(min + Math.random() * (max - min + 1)) };
      }
      case 'trim':
        return { result: String(values.text).trim() };
      case 'concat':
        return { result: String(values.a) + String(values.b) };
      case 'substring':
        return { result: String(values.text).substring(Number(values.start), Number(values.end)) };
      case 'sanitize':
        return { result: String(values.text).replace(/[`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/g, '') };
      case 'word_at':
        return { result: String(values.text).split(' ')[Number(values.index)] ?? '' };
      case 'equals':
        return { result: values.a == values.b };
      case 'greater_than':
        return { result: Number(values.a) > Number(values.b) };
      case 'less_than':
        return { result: Number(values.a) < Number(values.b) };
      case 'string_contains':
        return { result: String(values.text).includes(String(values.search)) };
      case 'string_starts_with':
        return { result: String(values.text).startsWith(String(values.prefix)) };
      case 'and':
        return { result: Boolean(values.a) && Boolean(values.b) };
      case 'or':
        return { result: Boolean(values.a) || Boolean(values.b) };
      case 'not':
        return { result: !values.value };
      case 'choose_random': {
        const options = [values.a, values.b, values.c, values.d].filter(
          (v) => v !== '' && v !== undefined && v !== null,
        );
        return { result: options[Math.floor(Math.random() * options.length)] };
      }
      default:
        throw new Error(`Unknown operation node '${nodeTypeId}'`);
    }
  }
}
