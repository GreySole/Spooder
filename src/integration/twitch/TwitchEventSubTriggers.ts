import { KeyedObject, NodePortDef, TriggerNodeDef, TriggerTestParam } from '../../Types';

// Which knobs a node's test panel offers, and how each becomes a `twitch event trigger` flag.
//
// The flag never comes from the frontend: the panel sends param ids and values, and this table
// is the only thing that turns them into argv. An unknown id is dropped, so nothing the client
// sends can add a flag - or a shell fragment - the node didn't declare (the CLI is spawned
// without a shell too, see TwitchCLI.executeCommand).
type TestParamId =
  | 'fromUser'
  | 'fromUserName'
  | 'cost'
  | 'tier'
  | 'anonymous'
  | 'status'
  | 'itemId'
  | 'itemName'
  | 'description'
  | 'gameId'
  | 'giftUser'
  | 'banEnd'
  | 'count';

interface TestParamSpec {
  flag: string;
  type: TriggerTestParam['type'];
  label: string;
  description?: string;
  selections?: { [value: string]: string };
  default?: string | number | boolean;
}

const TEST_PARAMS: { [id in TestParamId]: TestParamSpec } = {
  fromUser: {
    flag: '--from-user',
    type: 'text',
    label: 'From User ID',
    description: 'Twitch user id the event is attributed to. Random if left blank.',
  },
  fromUserName: {
    flag: '--from-user-name',
    type: 'text',
    label: 'From Username',
    description: 'Login name to go with the user id above.',
  },
  cost: { flag: '--cost', type: 'number', label: 'Cost' },
  tier: {
    flag: '--tier',
    type: 'select',
    label: 'Tier',
    selections: { '1000': 'Tier 1', '2000': 'Tier 2', '3000': 'Tier 3' },
    default: '1000',
  },
  // Valueless: the CLI takes `-a` as a bare boolean flag, so the value only decides whether
  // the flag is passed at all.
  anonymous: { flag: '--anonymous', type: 'boolean', label: 'Anonymous' },
  status: {
    flag: '--event-status',
    type: 'select',
    label: 'Status',
    selections: { fulfilled: 'Fulfilled', unfulfilled: 'Unfulfilled', canceled: 'Canceled' },
  },
  itemId: { flag: '--item-id', type: 'text', label: 'Item ID' },
  itemName: { flag: '--item-name', type: 'text', label: 'Item Name' },
  description: { flag: '--description', type: 'text', label: 'Title' },
  gameId: { flag: '--game-id', type: 'text', label: 'Category ID' },
  giftUser: { flag: '--gift-user', type: 'text', label: 'Gifter User ID' },
  banEnd: {
    flag: '--ban-end',
    type: 'text',
    label: 'Ban Ends In',
    description: 'Duration such as 600s or 10d4h - blank for a permanent ban.',
  },
  count: {
    flag: '--count',
    type: 'number',
    label: 'Repeat',
    description: 'Fire the event this many times in a row.',
    default: 1,
  },
};

// A node's test knobs: a bare param id, or the id with the wording that suits this event
// (`cost` is bits on a cheer, months on a resub) and a starting value.
type TestParamRef = TestParamId | ({ id: TestParamId } & Partial<TestParamSpec>);

// Offered on every testable node: who the event came from. The receiving side is always this
// channel - a test that arrived as some other broadcaster's event would be dropped before it
// reached a graph (see OnEventSubReceived's broadcaster guard).
const COMMON_TEST_PARAMS: TestParamRef[] = ['fromUser', 'fromUserName', 'count'];

function resolveTestParam(ref: TestParamRef): TriggerTestParam & { paramId: TestParamId } {
  const paramId = typeof ref === 'string' ? ref : ref.id;
  const spec = { ...TEST_PARAMS[paramId], ...(typeof ref === 'string' ? {} : ref) };
  return {
    paramId,
    id: paramId,
    label: spec.label,
    type: spec.type,
    selections: spec.selections,
    default: spec.default,
    description: spec.description,
  };
}

// The `twitch event trigger` flags for one test run, as argv. `subscriptionType` is passed
// straight through as the event name: the CLI accepts an EventSub topic as an alias for its
// own shorthand on the websocket/webhook transports, so the table below never has to carry a
// second set of event names that could drift from the real subscription types.
export function buildTestArgs(
  allowedParams: TestParamRef[],
  values: KeyedObject | undefined,
): string[] {
  const args: string[] = [];
  for (const ref of allowedParams) {
    const { paramId, type } = resolveTestParam(ref);
    const value = values?.[paramId];
    if (value == null || value === '') {
      continue;
    }
    const { flag } = TEST_PARAMS[paramId];
    if (type === 'boolean') {
      if (value === true || value === 'true') {
        args.push(flag);
      }
      continue;
    }
    args.push(flag, String(value));
  }
  return args;
}

// EventSub subscription version for a type, matching what the transports subscribe with.
// Shared so a test can't fire a different version of an event than the one Spooder is
// actually listening for - and because the CLI errors out on channel.update, which ships two
// versions, unless it is told which one.
export function getSubscriptionVersion(subscriptionType: string): string {
  if (subscriptionType === 'channel.follow' || subscriptionType === 'channel.update') {
    return '2';
  }
  if (subscriptionType.startsWith('channel.guest_star')) {
    return 'beta';
  }
  return '1';
}

// Every dedicated EventSub trigger node below is a thin, typed wrapper around one Twitch
// EventSub subscription `type` string. Subscription creation (TwitchEventSubWebsocket/
// Webhook's initEventSub), condition-building, and dispatch (OnEventSubReceived's generic
// `events[e].triggers.twitch.type == type` branch) are all already generic over the type
// string - adding a node here needs no changes there, only an entry in this table so
// EventGraphMigration can translate between the node's id and the real subscription type.
interface EventSubTriggerSpec {
  nodeTypeId: string;
  subscriptionType: string;
  label: string;
  description: string;
  outputs: NodePortDef[];
  // Test knobs beyond COMMON_TEST_PARAMS, listed only where the CLI actually reads them -
  // every other field of a mock payload is randomized and a control for it would do nothing.
  testParams?: TestParamRef[];
}

const EVENTSUB_TRIGGER_SPECS: EventSubTriggerSpec[] = [
  {
    nodeTypeId: 'channel_update',
    subscriptionType: 'channel.update',
    label: 'Channel Update',
    description: 'Fires when the channel title, category, or language changes.',
    outputs: [
      { id: 'title', label: 'Title', dataType: 'string' },
      { id: 'category_name', label: 'Category Name', dataType: 'string' },
    ],
    testParams: ['description', { id: 'itemName', label: 'Category Name' }, 'gameId'],
  },
  {
    nodeTypeId: 'follow',
    subscriptionType: 'channel.follow',
    label: 'Follow',
    description: 'Fires when someone follows the channel.',
    outputs: [
      { id: 'username', label: 'Username', dataType: 'string' },
      { id: 'displayName', label: 'Display Name', dataType: 'string' },
      { id: 'userId', label: 'User ID', dataType: 'string' },
      { id: 'followed_at', label: 'Followed At', dataType: 'string' },
    ],
  },
  {
    nodeTypeId: 'subscribe',
    subscriptionType: 'channel.subscribe',
    label: 'Subscribe',
    description: 'Fires when someone subscribes to the channel.',
    outputs: [
      { id: 'username', label: 'Username', dataType: 'string' },
      { id: 'displayName', label: 'Display Name', dataType: 'string' },
      { id: 'userId', label: 'User ID', dataType: 'string' },
      { id: 'tier', label: 'Tier', dataType: 'string' },
      { id: 'is_gift', label: 'Is Gift', dataType: 'boolean' },
    ],
    // Setting a gifter is what makes the mock sub a gifted one, so it drives the Is Gift port.
    testParams: ['tier', 'giftUser'],
  },
  {
    nodeTypeId: 'subscription_end',
    subscriptionType: 'channel.subscription.end',
    label: 'Subscription End',
    description: 'Fires when a subscription ends.',
    outputs: [
      { id: 'username', label: 'Username', dataType: 'string' },
      { id: 'displayName', label: 'Display Name', dataType: 'string' },
      { id: 'userId', label: 'User ID', dataType: 'string' },
      { id: 'tier', label: 'Tier', dataType: 'string' },
      { id: 'is_gift', label: 'Is Gift', dataType: 'boolean' },
    ],
    testParams: ['tier'],
  },
  {
    nodeTypeId: 'subscription_gift',
    subscriptionType: 'channel.subscription.gift',
    label: 'Subscription Gift',
    description: 'Fires when someone gifts subscriptions to the channel.',
    outputs: [
      { id: 'username', label: 'Gifter Username', dataType: 'string' },
      { id: 'displayName', label: 'Display Name', dataType: 'string' },
      { id: 'userId', label: 'User ID', dataType: 'string' },
      { id: 'total', label: 'Total Gifted', dataType: 'number' },
      { id: 'tier', label: 'Tier', dataType: 'string' },
      { id: 'is_anonymous', label: 'Is Anonymous', dataType: 'boolean' },
    ],
    testParams: ['tier', { id: 'cost', label: 'Subs Gifted', default: 5 }, 'anonymous'],
  },
  {
    nodeTypeId: 'subscription_message',
    subscriptionType: 'channel.subscription.message',
    label: 'Resub Message',
    description: 'Fires when a subscriber shares a resub message.',
    outputs: [
      { id: 'username', label: 'Username', dataType: 'string' },
      { id: 'displayName', label: 'Display Name', dataType: 'string' },
      { id: 'userId', label: 'User ID', dataType: 'string' },
      { id: 'tier', label: 'Tier', dataType: 'string' },
      { id: 'cumulative_months', label: 'Cumulative Months', dataType: 'number' },
      { id: 'streak_months', label: 'Streak Months', dataType: 'number' },
    ],
    testParams: ['tier', { id: 'cost', label: 'Streak Months', default: 3 }],
  },
  {
    nodeTypeId: 'cheer',
    subscriptionType: 'channel.cheer',
    label: 'Cheer',
    description:
      'Fires when someone cheers bits. Cheermotes carries the cheermote art found in the message - wire it, with Message, into an overlay plugin action to render the cheer as Twitch draws it.',
    outputs: [
      { id: 'username', label: 'Username', dataType: 'string' },
      { id: 'displayName', label: 'Display Name', dataType: 'string' },
      { id: 'userId', label: 'User ID', dataType: 'string' },
      { id: 'bits', label: 'Bits', dataType: 'number' },
      { id: 'message', label: 'Message', dataType: 'string' },
      // Resolved in OnEventSubReceived, since the raw channel.cheer payload has no positional
      // data at all. 'any' because it's an array of objects - see CheermoteMatch in
      // functions/parseCheermotes, whose {id, start, end} prefix matches the chat emote shape.
      { id: 'cheermotes', label: 'Cheermotes', dataType: 'any' },
      { id: 'is_anonymous', label: 'Is Anonymous', dataType: 'boolean' },
    ],
    testParams: [{ id: 'cost', label: 'Bits', default: 100 }, 'anonymous'],
  },
  {
    nodeTypeId: 'raid',
    subscriptionType: 'channel.raid',
    label: 'Raid',
    description: 'Fires when the channel is raided (or raids another channel).',
    outputs: [
      { id: 'username', label: 'Username', dataType: 'string' },
      { id: 'displayName', label: 'Display Name', dataType: 'string' },
      { id: 'userId', label: 'User ID', dataType: 'string' },
      { id: 'viewers', label: 'Viewers', dataType: 'number' },
      { id: 'isReceived', label: 'Is Received', dataType: 'boolean' },
    ],
  },
  {
    nodeTypeId: 'ban',
    subscriptionType: 'channel.ban',
    label: 'Ban',
    description: 'Fires when a user is banned or timed out.',
    outputs: [
      { id: 'username', label: 'Username', dataType: 'string' },
      { id: 'displayName', label: 'Display Name', dataType: 'string' },
      { id: 'userId', label: 'User ID', dataType: 'string' },
      { id: 'reason', label: 'Reason', dataType: 'string' },
      { id: 'is_permanent', label: 'Is Permanent', dataType: 'boolean' },
    ],
    testParams: ['banEnd'],
  },
  {
    nodeTypeId: 'unban',
    subscriptionType: 'channel.unban',
    label: 'Unban',
    description: 'Fires when a user is unbanned.',
    outputs: [
      { id: 'username', label: 'Username', dataType: 'string' },
      { id: 'displayName', label: 'Display Name', dataType: 'string' },
      { id: 'userId', label: 'User ID', dataType: 'string' },
    ],
  },
  {
    nodeTypeId: 'moderator_add',
    subscriptionType: 'channel.moderator.add',
    label: 'Moderator Added',
    description: 'Fires when a user is granted moderator status.',
    outputs: [
      { id: 'username', label: 'Username', dataType: 'string' },
      { id: 'displayName', label: 'Display Name', dataType: 'string' },
      { id: 'userId', label: 'User ID', dataType: 'string' },
    ],
  },
  {
    nodeTypeId: 'moderator_remove',
    subscriptionType: 'channel.moderator.remove',
    label: 'Moderator Removed',
    description: 'Fires when a user loses moderator status.',
    outputs: [
      { id: 'username', label: 'Username', dataType: 'string' },
      { id: 'displayName', label: 'Display Name', dataType: 'string' },
      { id: 'userId', label: 'User ID', dataType: 'string' },
    ],
  },
  {
    nodeTypeId: 'poll_begin',
    subscriptionType: 'channel.poll.begin',
    label: 'Poll Begin',
    description: 'Fires when a poll starts.',
    outputs: [{ id: 'title', label: 'Title', dataType: 'string' }],
    testParams: [{ id: 'description', label: 'Poll Title' }],
  },
  {
    nodeTypeId: 'poll_progress',
    subscriptionType: 'channel.poll.progress',
    label: 'Poll Progress',
    description: 'Fires as votes come in for an active poll.',
    outputs: [{ id: 'title', label: 'Title', dataType: 'string' }],
    testParams: [{ id: 'description', label: 'Poll Title' }],
  },
  {
    nodeTypeId: 'poll_end',
    subscriptionType: 'channel.poll.end',
    label: 'Poll End',
    description: 'Fires when a poll ends.',
    outputs: [
      { id: 'title', label: 'Title', dataType: 'string' },
      { id: 'status', label: 'Status', dataType: 'string' },
    ],
    testParams: [{ id: 'description', label: 'Poll Title' }],
  },
  {
    nodeTypeId: 'prediction_begin',
    subscriptionType: 'channel.prediction.begin',
    label: 'Prediction Begin',
    description: 'Fires when a prediction starts.',
    outputs: [{ id: 'title', label: 'Title', dataType: 'string' }],
    testParams: [{ id: 'description', label: 'Prediction Title' }],
  },
  {
    nodeTypeId: 'prediction_progress',
    subscriptionType: 'channel.prediction.progress',
    label: 'Prediction Progress',
    description: 'Fires as votes come in for an active prediction.',
    outputs: [{ id: 'title', label: 'Title', dataType: 'string' }],
    testParams: [{ id: 'description', label: 'Prediction Title' }],
  },
  {
    nodeTypeId: 'prediction_lock',
    subscriptionType: 'channel.prediction.lock',
    label: 'Prediction Lock',
    description: 'Fires when a prediction is locked.',
    outputs: [{ id: 'title', label: 'Title', dataType: 'string' }],
    testParams: [{ id: 'description', label: 'Prediction Title' }],
  },
  {
    nodeTypeId: 'prediction_end',
    subscriptionType: 'channel.prediction.end',
    label: 'Prediction End',
    description: 'Fires when a prediction is resolved or canceled.',
    outputs: [
      { id: 'title', label: 'Title', dataType: 'string' },
      { id: 'status', label: 'Status', dataType: 'string' },
    ],
    testParams: [{ id: 'description', label: 'Prediction Title' }],
  },
  {
    nodeTypeId: 'hype_train_begin',
    subscriptionType: 'channel.hype_train.begin',
    label: 'Hype Train Begin',
    description: 'Fires when a hype train starts.',
    outputs: [
      { id: 'total', label: 'Total', dataType: 'number' },
      { id: 'level', label: 'Level', dataType: 'number' },
    ],
  },
  {
    nodeTypeId: 'hype_train_progress',
    subscriptionType: 'channel.hype_train.progress',
    label: 'Hype Train Progress',
    description: 'Fires as an active hype train progresses.',
    outputs: [
      { id: 'total', label: 'Total', dataType: 'number' },
      { id: 'level', label: 'Level', dataType: 'number' },
      { id: 'progress', label: 'Progress', dataType: 'number' },
    ],
  },
  {
    nodeTypeId: 'hype_train_end',
    subscriptionType: 'channel.hype_train.end',
    label: 'Hype Train End',
    description: 'Fires when a hype train ends.',
    outputs: [
      { id: 'total', label: 'Total', dataType: 'number' },
      { id: 'level', label: 'Level', dataType: 'number' },
    ],
  },
  {
    nodeTypeId: 'shoutout_create',
    subscriptionType: 'channel.shoutout.create',
    label: 'Shoutout Given',
    description: 'Fires when the channel gives a shoutout to another channel.',
    outputs: [
      { id: 'to_broadcaster_user_name', label: 'Shoutout To', dataType: 'string' },
      { id: 'viewer_count', label: 'Viewer Count', dataType: 'number' },
    ],
  },
  {
    nodeTypeId: 'shoutout_receive',
    subscriptionType: 'channel.shoutout.receive',
    label: 'Shoutout Received',
    description: 'Fires when the channel receives a shoutout from another channel.',
    // The standard trio every other trigger exposes, and here it is the channel that gave the
    // shoutout. No mapping needed: OnEventSubReceived already falls back to this payload's
    // from_broadcaster_* fields when building the StreamMessage, which is where these resolve
    // from - the raw event carries no 'username'/'displayName'/'userId' of its own.
    //
    // This replaces the old 'Shoutout From' port, which was from_broadcaster_user_name - a
    // display name, despite reading like a login. Splitting it into the three says which is
    // which, and Username is the one an API call wants.
    outputs: [
      { id: 'username', label: 'Username', dataType: 'string' },
      { id: 'displayName', label: 'Display Name', dataType: 'string' },
      { id: 'userId', label: 'User ID', dataType: 'string' },
      { id: 'viewer_count', label: 'Viewer Count', dataType: 'number' },
    ],
  },
  {
    nodeTypeId: 'goal_begin',
    subscriptionType: 'channel.goal.begin',
    label: 'Goal Begin',
    description: 'Fires when a creator goal starts.',
    outputs: [
      { id: 'current_amount', label: 'Current Amount', dataType: 'number' },
      { id: 'target_amount', label: 'Target Amount', dataType: 'number' },
    ],
    testParams: [
      { id: 'description', label: 'Goal Description' },
      { id: 'itemName', label: 'Goal Type' },
    ],
  },
  {
    nodeTypeId: 'goal_progress',
    subscriptionType: 'channel.goal.progress',
    label: 'Goal Progress',
    description: 'Fires as an active creator goal progresses.',
    outputs: [
      { id: 'current_amount', label: 'Current Amount', dataType: 'number' },
      { id: 'target_amount', label: 'Target Amount', dataType: 'number' },
    ],
    testParams: [
      { id: 'description', label: 'Goal Description' },
      { id: 'itemName', label: 'Goal Type' },
    ],
  },
  {
    nodeTypeId: 'goal_end',
    subscriptionType: 'channel.goal.end',
    label: 'Goal End',
    description: 'Fires when a creator goal ends.',
    outputs: [
      { id: 'current_amount', label: 'Current Amount', dataType: 'number' },
      { id: 'target_amount', label: 'Target Amount', dataType: 'number' },
      { id: 'is_achieved', label: 'Is Achieved', dataType: 'boolean' },
    ],
    testParams: [
      { id: 'description', label: 'Goal Description' },
      { id: 'itemName', label: 'Goal Type' },
    ],
  },
  {
    nodeTypeId: 'shield_mode_begin',
    subscriptionType: 'channel.shield_mode.begin',
    label: 'Shield Mode Begin',
    description: 'Fires when shield mode is activated.',
    outputs: [{ id: 'moderator_user_name', label: 'Activated By', dataType: 'string' }],
  },
  {
    nodeTypeId: 'shield_mode_end',
    subscriptionType: 'channel.shield_mode.end',
    label: 'Shield Mode End',
    description: 'Fires when shield mode is deactivated.',
    outputs: [{ id: 'moderator_user_name', label: 'Deactivated By', dataType: 'string' }],
  },
  {
    nodeTypeId: 'stream_online',
    subscriptionType: 'stream.online',
    label: 'Stream Online',
    description: 'Fires when the channel goes live.',
    outputs: [],
    testParams: [
      { id: 'description', label: 'Stream Title' },
      { id: 'itemId', label: 'Category ID' },
    ],
  },
  {
    nodeTypeId: 'stream_offline',
    subscriptionType: 'stream.offline',
    label: 'Stream Offline',
    description: 'Fires when the channel goes offline.',
    outputs: [],
  },
];

// The knobs a node's test panel draws, in order: the event-specific ones first, then the
// 'who from' pair every event shares.
function testParamsForSpec(spec: EventSubTriggerSpec): TestParamRef[] {
  return [...(spec.testParams ?? []), ...COMMON_TEST_PARAMS];
}

export function getTwitchEventSubTriggerNodes(): TriggerNodeDef[] {
  return EVENTSUB_TRIGGER_SPECS.map((spec) => ({
    id: spec.nodeTypeId,
    label: spec.label,
    description: spec.description,
    form: {},
    defaults: {},
    outputs: spec.outputs,
    // What core's legacy-format migration keys off of, in place of reaching into this file.
    legacyTriggerType: spec.subscriptionType,
    test: {
      params: testParamsForSpec(spec).map(resolveTestParam),
      note:
        spec.subscriptionType === 'channel.raid'
          ? 'A test raid always arrives as an incoming raid, so Is Received is true.'
          : undefined,
    },
  }));
}

// Everything the test route needs to fire one node's event: which EventSub type to trigger,
// which version of it, and which of the caller's values are allowed to become CLI flags.
export interface TwitchTriggerTestSpec {
  subscriptionType: string;
  version: string;
  buildArgs: (values: KeyedObject | undefined) => string[];
}

export function getTestSpecForNodeId(nodeTypeId: string): TwitchTriggerTestSpec | undefined {
  const spec = EVENTSUB_TRIGGER_SPECS.find((s) => s.nodeTypeId === nodeTypeId);
  if (!spec) {
    return undefined;
  }
  const params = testParamsForSpec(spec);
  return {
    subscriptionType: spec.subscriptionType,
    version: getSubscriptionVersion(spec.subscriptionType),
    buildArgs: (values) => buildTestArgs(params, values),
  };
}

// The two Twitch trigger nodes that aren't in the spec table: the redemption node (whose
// subscription type is fixed but whose reward id comes off the node itself) and the freeform
// escape hatch (whose type the user typed). Exported as ready-made test defs so twitch.ts
// declares them the same way the table does.
export const REDEEM_TEST_PARAMS: TriggerTestParam[] = [
  { ...resolveTestParam({ id: 'cost', label: 'Channel Points', default: 150 }) },
  {
    ...resolveTestParam({
      id: 'status',
      label: 'Status',
      default: 'fulfilled',
      description:
        "Redemptions only run their event when fulfilled, unless the node's Override Auto-Fulfill is on.",
    }),
  },
  { ...resolveTestParam({ id: 'itemName', label: 'Reward Title' }) },
  ...COMMON_TEST_PARAMS.map(resolveTestParam),
];

export const GENERIC_TEST_PARAMS: TriggerTestParam[] = COMMON_TEST_PARAMS.map(resolveTestParam);

export function buildRedeemTestArgs(values: KeyedObject | undefined): string[] {
  return buildTestArgs(
    [
      { id: 'cost' },
      { id: 'status' },
      { id: 'itemName' },
      // The reward the node triggers off - filled in by the route from the node's own
      // rewardId, not by the panel, so a test can't fire a redemption of some other reward
      // and quietly not match.
      { id: 'itemId' },
      ...COMMON_TEST_PARAMS,
    ],
    values,
  );
}

export function buildGenericTestArgs(values: KeyedObject | undefined): string[] {
  return buildTestArgs(COMMON_TEST_PARAMS, values);
}

// The node id <-> subscription type mapping core's legacy-format migration needs is published
// on each trigger node as `legacyTriggerType` (see getTwitchEventSubTriggerNodes), so core
// reads it through ModuleService instead of importing this file.
