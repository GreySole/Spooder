import { KeyedObject, NodeForm, OperationNodeDef } from '../../Types';
import { spooderLog } from '../Logging';
import { toArray } from '../util/ArrayUtil';
import { matchCommand } from '../util/CommandMatchUtil';
import { matchSearchPattern, patternSlots } from '../util/SearchMatchUtil';
import { fillTemplate } from '../util/TemplateUtil';

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
    // Still 'random_int' because the id is what saved graphs store: renaming it would leave
    // every node anyone has already placed unresolvable. Only the label and the decimals
    // field grew.
    id: 'random_int',
    label: 'Random Number',
    description:
      'A random number between min and max, inclusive. Decimals says how many decimal places ' +
      'the result may have - 0 (the default) gives whole numbers, 2 gives values like 3.47.',
    category: 'math',
    form: {
      min: { label: 'Min', type: 'number', portType: 'number' },
      max: { label: 'Max', type: 'number', portType: 'number' },
      decimals: { label: 'Decimals', type: 'number', portType: 'number' },
    },
    defaults: { min: 1, max: 6, decimals: 0 },
    outputs: [{ id: 'result', label: 'Result', dataType: 'number' }],
  },
];

// How many decimal places Random Number is allowed to land on. Anything unreadable as a count
// - an empty field, a node saved before the field existed - means whole numbers, the node's
// original behaviour. The ceiling keeps min/max * 10^decimals inside the range integers are
// exact in; past it the grid arithmetic would start rounding on its own.
const MAX_RANDOM_DECIMALS = 10;

function randomDecimals(value: unknown): number {
  const decimals = Number(value);
  if (!Number.isFinite(decimals)) {
    return 0;
  }
  return Math.min(Math.max(Math.floor(decimals), 0), MAX_RANDOM_DECIMALS);
}

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
    id: 'text',
    label: 'Text',
    description:
      'A block of text, with room to write it in. Use it to keep a long string - a prompt, an announcement - out of the field it feeds, where a one-line box would hide most of it.',
    category: 'string',
    // No portType: wiring a value into a literal block would leave nothing for the block to do.
    form: { text: { label: 'Text', type: 'textarea' } },
    defaults: { text: '' },
    outputs: [{ id: 'result', label: 'Result', dataType: 'string' }],
  },
  {
    id: 'template',
    label: 'Template',
    description:
      'Fills in a block of text: every ${name} in it becomes an input port on this node, so the surrounding wording stays here and only the parts that vary get wired in. Repeating a name reuses the same input. Type into a slot to give it a fixed value instead, and an unfilled slot comes out empty.',
    category: 'string',
    // The slot ports aren't listed: which ones exist depends on what's written in the template,
    // so the frontend derives them from it (buildTemplateForm in nodeDefLookup.ts). They need no
    // executor support of their own - resolveNodeValues copies every incoming edge onto the
    // node's values by port id, which is exactly where fillTemplate looks for them.
    form: { template: { label: 'Template', type: 'textarea' } },
    defaults: { template: '' },
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
    description:
      'Strips characters out of text. Special Characters removes punctuation and symbols (the default, and what the sanitize() helper in a response script does); Numbers and Letters remove those; Custom Regex removes everything a pattern of your own matches.',
    category: 'string',
    form: {
      text: { label: 'Text', type: 'text', portType: 'string' },
      mode: {
        label: 'Remove',
        type: 'select',
        portType: 'string',
        options: {
          selections: {
            special: 'Special Characters',
            numbers: 'Numbers',
            letters: 'Letters',
            custom: 'Custom Regex',
          },
        },
      },
      pattern: {
        label: 'Regex',
        type: 'text',
        portType: 'string',
        showif: { variable: 'mode', condition: 'equals', value: 'custom' },
      },
      flags: {
        label: "Regex Flags ('g' is always on)",
        type: 'text',
        portType: 'string',
        showif: { variable: 'mode', condition: 'equals', value: 'custom' },
      },
    },
    defaults: { text: '', mode: 'special', pattern: '', flags: '' },
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
    id: 'split_text',
    label: 'Split',
    description:
      'Breaks text into an array on each occurrence of the separator. An empty separator splits into single characters.',
    category: 'string',
    form: {
      text: { label: 'Text', type: 'text', portType: 'string' },
      separator: { label: 'Separator', type: 'text', portType: 'string' },
    },
    defaults: { text: '', separator: ' ' },
    outputs: [
      { id: 'result', label: 'Items', dataType: 'any' },
      { id: 'length', label: 'Length', dataType: 'number' },
    ],
  },
  {
    id: 'command_match',
    label: 'Chat Command',
    description:
      "Whether text starts with a command, and the whitespace-separated arguments that follow it. Set Arg Count for how many argument outputs to draw; an argument the message didn't supply comes out empty. Matching is by prefix, so a command can be more than one word.",
    category: 'string',
    form: {
      text: { label: 'Message', type: 'text', portType: 'string' },
      command: { label: 'Command', type: 'text', portType: 'string' },
      argCount: { label: 'Arg Count', type: 'number' },
    },
    defaults: { text: '', command: '', argCount: 0 },
    // The Arg ports aren't listed: how many there are is the user's Arg Count, so the frontend
    // draws them the same way it draws the OSC trigger's args, and evaluate() returns one entry
    // per declared slot.
    outputs: [
      { id: 'matched', label: 'Matched', dataType: 'boolean' },
      { id: 'args', label: 'All Args', dataType: 'any' },
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

// A wire-only array input. Every array node takes one of these as its subject.
function arrayInput(label = 'Array') {
  return { label, type: 'port' as const, portType: 'any' as const };
}

// What each Sanitize mode strips. 'special' is the character list the sanitize() helper in a
// response script has always used, kept verbatim so the node and the helper agree.
const SANITIZE_PATTERNS: { [mode: string]: RegExp } = {
  special: /[`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/g,
  // Unicode-aware, so these do what they say for non-English text too: a full-width digit is a
  // number and an accented character is a letter.
  numbers: /\p{N}/gu,
  letters: /\p{L}/gu,
};

function sanitizeText(text: string, values: KeyedObject): string {
  const mode = String(values.mode || 'special');
  if (mode !== 'custom') {
    // An unknown mode (an empty select, an older saved node) sanitizes the way it always did.
    return text.replace(SANITIZE_PATTERNS[mode] ?? SANITIZE_PATTERNS.special, '');
  }

  const pattern = String(values.pattern ?? '');
  if (pattern === '') {
    return text;
  }
  try {
    // 'g' is forced on: without it a pattern would strip only its first match, which is never
    // what "remove this" means here.
    const flags = String(values.flags ?? '').replace(/[^a-z]/g, '');
    return text.replace(new RegExp(pattern, flags.includes('g') ? flags : `g${flags}`), '');
  } catch (e) {
    // An invalid pattern (or flag) leaves the text alone rather than taking the event down with
    // it - the node is usually mid-chain and a half-typed regex shouldn't stop the branch.
    spooderLog(`Sanitize node: invalid regex ${JSON.stringify(pattern)}`, e);
    return text;
  }
}

const ARRAY_NODES: OperationNodeDef[] = [
  {
    id: 'array_at',
    label: 'Item At',
    description:
      'The item at an index, counting from 0. Negative indexes count back from the end, so -1 is the last item.',
    category: 'array',
    form: {
      array: arrayInput(),
      index: { label: 'Index', type: 'number', portType: 'number' },
    },
    defaults: { index: 0 },
    outputs: [{ id: 'value', label: 'Item', dataType: 'any' }],
  },
  {
    id: 'array_length',
    label: 'Length',
    description: 'How many items the array holds.',
    category: 'array',
    form: { array: arrayInput() },
    defaults: {},
    outputs: [{ id: 'result', label: 'Length', dataType: 'number' }],
  },
  {
    id: 'array_join',
    label: 'Join',
    description: 'Glues the items into one string, separated by the given text.',
    category: 'array',
    form: {
      array: arrayInput(),
      separator: { label: 'Separator', type: 'text', portType: 'string' },
    },
    defaults: { separator: ' ' },
    outputs: [{ id: 'result', label: 'Text', dataType: 'string' }],
  },
  {
    id: 'array_includes',
    label: 'Includes',
    description: 'Whether the array contains a value, and where it sits. Index is -1 when absent.',
    category: 'array',
    form: {
      array: arrayInput(),
      value: { label: 'Value', type: 'text', portType: 'any' },
    },
    defaults: { value: '' },
    outputs: [
      { id: 'result', label: 'Includes', dataType: 'boolean' },
      { id: 'index', label: 'Index', dataType: 'number' },
    ],
  },
  {
    id: 'array_sort',
    label: 'Sort',
    description: 'A sorted copy of the array. Text sorts alphabetically, Number sorts numerically.',
    category: 'array',
    form: {
      array: arrayInput(),
      mode: {
        label: 'Order',
        type: 'select',
        options: {
          selections: {
            text_asc: 'Text A-Z',
            text_desc: 'Text Z-A',
            number_asc: 'Number 0-9',
            number_desc: 'Number 9-0',
          },
        },
      },
    },
    defaults: { mode: 'text_asc' },
    outputs: [{ id: 'result', label: 'Sorted', dataType: 'any' }],
  },
  {
    id: 'array_push',
    label: 'Push',
    description: 'The array with a value added to the end.',
    category: 'array',
    form: {
      array: arrayInput(),
      value: { label: 'Value', type: 'text', portType: 'any' },
    },
    defaults: { value: '' },
    outputs: [
      { id: 'result', label: 'Array', dataType: 'any' },
      { id: 'length', label: 'Length', dataType: 'number' },
    ],
  },
  {
    id: 'array_unshift',
    label: 'Unshift',
    description: 'The array with a value added to the front.',
    category: 'array',
    form: {
      array: arrayInput(),
      value: { label: 'Value', type: 'text', portType: 'any' },
    },
    defaults: { value: '' },
    outputs: [
      { id: 'result', label: 'Array', dataType: 'any' },
      { id: 'length', label: 'Length', dataType: 'number' },
    ],
  },
  {
    id: 'array_pop',
    label: 'Pop',
    description:
      "The last item, and the array without it. Nothing is modified in place - wire 'Array' onward to keep the shortened version.",
    category: 'array',
    form: { array: arrayInput() },
    defaults: {},
    outputs: [
      { id: 'value', label: 'Popped', dataType: 'any' },
      { id: 'result', label: 'Array', dataType: 'any' },
      { id: 'length', label: 'Length', dataType: 'number' },
    ],
  },
  {
    id: 'array_shift',
    label: 'Shift',
    description:
      "The first item, and the array without it. Nothing is modified in place - wire 'Array' onward to keep the shortened version.",
    category: 'array',
    form: { array: arrayInput() },
    defaults: {},
    outputs: [
      { id: 'value', label: 'Shifted', dataType: 'any' },
      { id: 'result', label: 'Array', dataType: 'any' },
      { id: 'length', label: 'Length', dataType: 'number' },
    ],
  },
  {
    id: 'array_splice',
    label: 'Splice',
    description:
      'Removes Count items from Start and optionally inserts in their place. An array wired into Insert is spliced in item by item; anything else goes in as a single item.',
    category: 'array',
    form: {
      array: arrayInput(),
      start: { label: 'Start', type: 'number', portType: 'number' },
      count: { label: 'Count', type: 'number', portType: 'number' },
      insert: { label: 'Insert (optional)', type: 'text', portType: 'any' },
    },
    defaults: { start: 0, count: 1, insert: '' },
    outputs: [
      { id: 'result', label: 'Array', dataType: 'any' },
      { id: 'removed', label: 'Removed', dataType: 'any' },
      { id: 'length', label: 'Length', dataType: 'number' },
    ],
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
    id: 'if_value',
    label: 'If Value',
    description:
      "Picks between two values on a condition - the value counterpart to the If node, which picks between two branches of execution. Both sides are worked out either way (operation nodes are pure, so there's nothing to skip); it's the answer that's chosen.",
    category: 'logic',
    form: {
      condition: { label: 'Condition', type: 'boolean', portType: 'boolean' },
      whenTrue: { label: 'If True', type: 'text', portType: 'any' },
      whenFalse: { label: 'If False', type: 'text', portType: 'any' },
    },
    defaults: { condition: false, whenTrue: '', whenFalse: '' },
    outputs: [{ id: 'value', label: 'Value', dataType: 'any' }],
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
    return [...MATH_NODES, ...STRING_NODES, ...ARRAY_NODES, ...LOGIC_NODES, ...RANDOM_NODES];
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
        // Picked on a grid of 10^-decimals steps rather than by scaling a raw float, so max is
        // as reachable as min and the two ends stay symmetric. At 0 decimals the grid is the
        // whole numbers, which is exactly what this node did before it grew the field.
        const decimals = randomDecimals(values.decimals);
        const scale = 10 ** decimals;
        const min = Math.round(Number(values.min) * scale);
        const max = Math.round(Number(values.max) * scale);
        return { result: (min + Math.floor(Math.random() * (max - min + 1))) / scale };
      }
      case 'trim':
        return { result: String(values.text).trim() };
      case 'text':
        return { result: String(values.text ?? '') };
      case 'template':
        return { result: fillTemplate(values.template, values) };
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
        return { result: sanitizeText(String(values.text ?? ''), values) };
      case 'command_match': {
        const { matched, args } = matchCommand(values.command, values.text);
        const result: KeyedObject = { matched, args };
        const argCount = Number(values.argCount);
        for (let i = 0; i < (Number.isFinite(argCount) ? argCount : 0); i++) {
          // Declared slots always resolve: an argument nobody typed reads as empty rather than
          // printing as 'undefined' downstream.
          result[`arg${i}`] = args[i] ?? '';
        }
        return result;
      }
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
      case 'array_at': {
        const items = toArray(values.array);
        const index = Number(values.index);
        const from = Number.isFinite(index) ? index : 0;
        // Array.prototype.at() semantics, spelled out: the project's TS lib target predates it,
        // and a node isn't a reason to move the whole build's target.
        const value = items[from < 0 ? items.length + from : from];
        return { value: value ?? '' };
      }
      case 'array_length':
        return { result: toArray(values.array).length };
      case 'array_join':
        return { result: toArray(values.array).join(String(values.separator ?? '')) };
      case 'split_text': {
        const items = String(values.text ?? '').split(String(values.separator ?? ''));
        return { result: items, length: items.length };
      }
      case 'array_includes': {
        const items = toArray(values.array);
        // Loose equality, matching the 'equals' node: a number that arrived down a wire and the
        // text typed into the Value box should still find each other.
        const index = items.findIndex((item) => item == values.value);
        return { result: index !== -1, index };
      }
      case 'array_sort': {
        const items = toArray(values.array);
        const numeric = String(values.mode ?? '').startsWith('number');
        const descending = String(values.mode ?? '').endsWith('desc');
        items.sort((a, b) => {
          const order = numeric ? Number(a) - Number(b) : String(a).localeCompare(String(b));
          return descending ? -order : order;
        });
        return { result: items };
      }
      case 'array_push': {
        const items = toArray(values.array);
        items.push(values.value);
        return { result: items, length: items.length };
      }
      case 'array_unshift': {
        const items = toArray(values.array);
        items.unshift(values.value);
        return { result: items, length: items.length };
      }
      case 'array_pop': {
        const items = toArray(values.array);
        const value = items.pop();
        return { result: items, value: value ?? '', length: items.length };
      }
      case 'array_shift': {
        const items = toArray(values.array);
        const value = items.shift();
        return { result: items, value: value ?? '', length: items.length };
      }
      case 'array_splice': {
        const items = toArray(values.array);
        const start = Number(values.start);
        const count = Number(values.count);
        // An empty Insert box is 'insert nothing', not 'insert an empty string' - the field is
        // optional and starts out empty.
        const insert =
          values.insert === undefined || values.insert === null || values.insert === ''
            ? []
            : Array.isArray(values.insert)
              ? values.insert
              : [values.insert];
        const removed = items.splice(
          Number.isFinite(start) ? start : 0,
          Number.isFinite(count) ? count : 0,
          ...insert,
        );
        return { result: items, removed, length: items.length };
      }
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
      case 'if_value':
        // Plain truthiness, matching what the If node does with the same input - the two should
        // never disagree about what counts as true.
        return { value: values.condition ? values.whenTrue : values.whenFalse };
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
