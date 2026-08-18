import { KeyedObject, NodeForm, OperationNodeDef } from '../../Types';
import { matchSearchPattern, patternSlots } from '../util/SearchMatchUtil';

// Concat's inputs, in the order they're joined. A and B are always offered; the rest are
// `growable`, so the frontend reveals C once A and B hold something, D once C does, and so on -
// the node grows as it's used instead of showing eight empty boxes. Eight is simply the ceiling;
// nothing but this list has to change to raise it.
const CONCAT_SLOTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function concatForm(): NodeForm {
  const form: NodeForm = {};
  CONCAT_SLOTS.forEach((slot, index) => {
    form[slot] = {
      label: slot.toUpperCase(),
      type: 'text',
      portType: 'string',
      growable: index >= 2,
    };
  });
  return form;
}

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
    form: concatForm(),
    // Only the two always-present slots are seeded: an unused slot stays absent from the node's
    // values entirely, which is exactly what the evaluator and the frontend treat as empty.
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
    id: 'search_match',
    label: 'Search & Match',
    description:
      "Matches a pattern anywhere in some text and hands out the words it matched, one Match output per pattern word: '*' takes any word, '*word' skips ahead to that word, '>pre' matches a word starting with 'pre', '<suf' one ending with 'suf', and 'a|b' either. The same matcher the Chat Search & Match trigger runs, usable on any string - a Discord message, an OSC value, a stored variable.",
    category: 'string',
    form: {
      text: { label: 'Text', type: 'text', portType: 'string' },
      pattern: { label: 'Pattern', type: 'text', portType: 'string' },
    },
    defaults: { text: '', pattern: '' },
    // The Match ports aren't listed: how many there are depends on the pattern, so the frontend
    // derives them from it. They need no executor support of their own - an operation node's
    // outputs are whatever evaluate() returns, and it returns one entry per slot.
    outputs: [
      { id: 'matched', label: 'Matched', dataType: 'boolean' },
      // Every matched word in one go, for anything that wants to iterate them rather than wire
      // each slot: typed 'any' because a port type can't say 'array of string'.
      { id: 'matches', label: 'All Matches', dataType: 'any' },
    ],
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
  // Completes the comparison set the legacy OSC condition editor offered (==, !=, >=, <=, >, <)
  // so any old condition can be expressed directly as one node instead of a not/or combination.
  {
    id: 'not_equals',
    label: 'Not Equals',
    category: 'logic',
    form: {
      a: { label: 'A', type: 'text', portType: 'any' },
      b: { label: 'B', type: 'text', portType: 'any' },
    },
    defaults: { a: '', b: '' },
    outputs: [{ id: 'result', label: 'Result', dataType: 'boolean' }],
  },
  {
    id: 'greater_or_equal',
    label: 'Greater Than Or Equal',
    category: 'logic',
    form: {
      a: { label: 'A', type: 'number', portType: 'number' },
      b: { label: 'B', type: 'number', portType: 'number' },
    },
    defaults: { a: 0, b: 0 },
    outputs: [{ id: 'result', label: 'Result', dataType: 'boolean' }],
  },
  {
    id: 'less_or_equal',
    label: 'Less Than Or Equal',
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
        // Every slot in order, skipping the ones the node never grew into. Unset slots are
        // absent rather than empty, so they'd stringify to 'undefined' if they weren't dropped.
        return {
          result: CONCAT_SLOTS.map((slot) => values[slot])
            .filter((value) => value !== undefined && value !== null)
            .join(''),
        };
      case 'substring':
        return { result: String(values.text).substring(Number(values.start), Number(values.end)) };
      case 'sanitize':
        return { result: String(values.text).replace(/[`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/g, '') };
      case 'search_match': {
        const pattern = String(values.pattern ?? '');
        const matched = matchSearchPattern(pattern, String(values.text ?? ''));
        // Every slot is reported whether or not the text matched: a port that resolves to
        // undefined reads as the literal 'undefined' downstream, so an unmatched run gives
        // empty strings and the 'matched' flag to branch on.
        const result: KeyedObject = { matched: matched !== undefined, matches: matched ?? [] };
        patternSlots(pattern).forEach((_slot, i) => {
          result[`match${i}`] = matched?.[i] ?? '';
        });
        return result;
      }
      case 'word_at':
        return { result: String(values.text).split(' ')[Number(values.index)] ?? '' };
      case 'equals':
        return { result: values.a == values.b };
      case 'greater_than':
        return { result: Number(values.a) > Number(values.b) };
      case 'less_than':
        return { result: Number(values.a) < Number(values.b) };
      case 'not_equals':
        return { result: values.a != values.b };
      case 'greater_or_equal':
        return { result: Number(values.a) >= Number(values.b) };
      case 'less_or_equal':
        return { result: Number(values.a) <= Number(values.b) };
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
