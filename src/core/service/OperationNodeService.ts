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
];

export default class OperationNodeService {
  static getOperationNodes(): OperationNodeDef[] {
    return [...MATH_NODES, ...STRING_NODES];
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
      case 'trim':
        return { result: String(values.text).trim() };
      case 'concat':
        return { result: String(values.a) + String(values.b) };
      case 'substring':
        return { result: String(values.text).substring(Number(values.start), Number(values.end)) };
      default:
        throw new Error(`Unknown operation node '${nodeTypeId}'`);
    }
  }
}
