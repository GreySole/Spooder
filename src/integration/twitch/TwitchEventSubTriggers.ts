import { NodePortDef, TriggerNodeDef } from '../../Types';

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
  },
  {
    nodeTypeId: 'follow',
    subscriptionType: 'channel.follow',
    label: 'Follow',
    description: 'Fires when someone follows the channel.',
    outputs: [
      { id: 'username', label: 'Username', dataType: 'string' },
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
      { id: 'tier', label: 'Tier', dataType: 'string' },
      { id: 'is_gift', label: 'Is Gift', dataType: 'boolean' },
    ],
  },
  {
    nodeTypeId: 'subscription_end',
    subscriptionType: 'channel.subscription.end',
    label: 'Subscription End',
    description: 'Fires when a subscription ends.',
    outputs: [
      { id: 'username', label: 'Username', dataType: 'string' },
      { id: 'tier', label: 'Tier', dataType: 'string' },
      { id: 'is_gift', label: 'Is Gift', dataType: 'boolean' },
    ],
  },
  {
    nodeTypeId: 'subscription_gift',
    subscriptionType: 'channel.subscription.gift',
    label: 'Subscription Gift',
    description: 'Fires when someone gifts subscriptions to the channel.',
    outputs: [
      { id: 'username', label: 'Gifter Username', dataType: 'string' },
      { id: 'total', label: 'Total Gifted', dataType: 'number' },
      { id: 'tier', label: 'Tier', dataType: 'string' },
      { id: 'is_anonymous', label: 'Is Anonymous', dataType: 'boolean' },
    ],
  },
  {
    nodeTypeId: 'subscription_message',
    subscriptionType: 'channel.subscription.message',
    label: 'Resub Message',
    description: 'Fires when a subscriber shares a resub message.',
    outputs: [
      { id: 'username', label: 'Username', dataType: 'string' },
      { id: 'tier', label: 'Tier', dataType: 'string' },
      { id: 'cumulative_months', label: 'Cumulative Months', dataType: 'number' },
      { id: 'streak_months', label: 'Streak Months', dataType: 'number' },
    ],
  },
  {
    nodeTypeId: 'cheer',
    subscriptionType: 'channel.cheer',
    label: 'Cheer',
    description: 'Fires when someone cheers bits.',
    outputs: [
      { id: 'username', label: 'Username', dataType: 'string' },
      { id: 'bits', label: 'Bits', dataType: 'number' },
      { id: 'message', label: 'Message', dataType: 'string' },
      { id: 'is_anonymous', label: 'Is Anonymous', dataType: 'boolean' },
    ],
  },
  {
    nodeTypeId: 'raid',
    subscriptionType: 'channel.raid',
    label: 'Raid',
    description: 'Fires when the channel is raided (or raids another channel).',
    outputs: [
      { id: 'username', label: 'Username', dataType: 'string' },
      { id: 'viewers', label: 'Viewers', dataType: 'number' },
      { id: 'raidType', label: 'Raid Type (send/receive)', dataType: 'string' },
    ],
  },
  {
    nodeTypeId: 'ban',
    subscriptionType: 'channel.ban',
    label: 'Ban',
    description: 'Fires when a user is banned or timed out.',
    outputs: [
      { id: 'username', label: 'Username', dataType: 'string' },
      { id: 'reason', label: 'Reason', dataType: 'string' },
      { id: 'is_permanent', label: 'Is Permanent', dataType: 'boolean' },
    ],
  },
  {
    nodeTypeId: 'unban',
    subscriptionType: 'channel.unban',
    label: 'Unban',
    description: 'Fires when a user is unbanned.',
    outputs: [{ id: 'username', label: 'Username', dataType: 'string' }],
  },
  {
    nodeTypeId: 'moderator_add',
    subscriptionType: 'channel.moderator.add',
    label: 'Moderator Added',
    description: 'Fires when a user is granted moderator status.',
    outputs: [{ id: 'username', label: 'Username', dataType: 'string' }],
  },
  {
    nodeTypeId: 'moderator_remove',
    subscriptionType: 'channel.moderator.remove',
    label: 'Moderator Removed',
    description: 'Fires when a user loses moderator status.',
    outputs: [{ id: 'username', label: 'Username', dataType: 'string' }],
  },
  {
    nodeTypeId: 'poll_begin',
    subscriptionType: 'channel.poll.begin',
    label: 'Poll Begin',
    description: 'Fires when a poll starts.',
    outputs: [{ id: 'title', label: 'Title', dataType: 'string' }],
  },
  {
    nodeTypeId: 'poll_progress',
    subscriptionType: 'channel.poll.progress',
    label: 'Poll Progress',
    description: 'Fires as votes come in for an active poll.',
    outputs: [{ id: 'title', label: 'Title', dataType: 'string' }],
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
  },
  {
    nodeTypeId: 'prediction_begin',
    subscriptionType: 'channel.prediction.begin',
    label: 'Prediction Begin',
    description: 'Fires when a prediction starts.',
    outputs: [{ id: 'title', label: 'Title', dataType: 'string' }],
  },
  {
    nodeTypeId: 'prediction_progress',
    subscriptionType: 'channel.prediction.progress',
    label: 'Prediction Progress',
    description: 'Fires as votes come in for an active prediction.',
    outputs: [{ id: 'title', label: 'Title', dataType: 'string' }],
  },
  {
    nodeTypeId: 'prediction_lock',
    subscriptionType: 'channel.prediction.lock',
    label: 'Prediction Lock',
    description: 'Fires when a prediction is locked.',
    outputs: [{ id: 'title', label: 'Title', dataType: 'string' }],
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
    outputs: [
      { id: 'from_broadcaster_user_name', label: 'Shoutout From', dataType: 'string' },
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
  },
  {
    nodeTypeId: 'stream_offline',
    subscriptionType: 'stream.offline',
    label: 'Stream Offline',
    description: 'Fires when the channel goes offline.',
    outputs: [],
  },
];

export function getTwitchEventSubTriggerNodes(): TriggerNodeDef[] {
  return EVENTSUB_TRIGGER_SPECS.map((spec) => ({
    id: spec.nodeTypeId,
    label: spec.label,
    description: spec.description,
    form: {},
    defaults: {},
    outputs: spec.outputs,
  }));
}

const NODE_ID_TO_SUBSCRIPTION_TYPE: { [nodeTypeId: string]: string } = Object.fromEntries(
  EVENTSUB_TRIGGER_SPECS.map((spec) => [spec.nodeTypeId, spec.subscriptionType]),
);

const SUBSCRIPTION_TYPE_TO_NODE_ID: { [subscriptionType: string]: string } = Object.fromEntries(
  EVENTSUB_TRIGGER_SPECS.map((spec) => [spec.subscriptionType, spec.nodeTypeId]),
);

// Real Twitch EventSub `type` string a dedicated trigger node represents, e.g.
// 'follow' -> 'channel.follow'. Used when flattening a graph node into the legacy
// `triggers.twitch.type` shape that subscription refresh/dispatch already key off of.
export function getSubscriptionTypeForNodeId(nodeTypeId: string): string | undefined {
  return NODE_ID_TO_SUBSCRIPTION_TYPE[nodeTypeId];
}

// Inverse of getSubscriptionTypeForNodeId - used when migrating legacy flat events (or the
// generic 'eventsub_event' node's freeform type field) back into a graph, so data that
// already names a real subscription type lands on its dedicated node where one exists.
export function getNodeIdForSubscriptionType(subscriptionType: string): string | undefined {
  return SUBSCRIPTION_TYPE_TO_NODE_ID[subscriptionType];
}
