import { v4 as uuidv4 } from 'uuid';
import { EventGraph, EventGraphEdge, EventGraphFile, EventGraphNode, KeyedObject } from '../../Types';
import { getNodeIdForSubscriptionType, getSubscriptionTypeForNodeId } from '../../integration/twitch/TwitchEventSubTriggers';

function execEdge(fromNode: string, toNode: string): EventGraphEdge {
  return { id: uuidv4(), fromNode, fromPort: 'exec', toNode, toPort: 'exec' };
}

// Keyed by `${fromNode}::${fromPort}`, not just fromNode, so a node can fan out through
// several named exec ports (e.g. an 'if' node's 'then'/'else') instead of one generic
// 'exec' port. Every existing graph only ever uses fromPort:'exec', so every key becomes
// `${id}::exec` - identical partitioning to before this supported named ports.
export function buildExecAdjacency(graph: EventGraph): Map<string, string[]> {
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.toPort !== 'exec') {
      continue;
    }
    const key = `${edge.fromNode}::${edge.fromPort}`;
    if (!outgoing.has(key)) {
      outgoing.set(key, []);
    }
    outgoing.get(key)!.push(edge.toNode);
  }
  return outgoing;
}

// Entry points are whatever a callback node's exec edge points to, plus any action node
// with no incoming exec edge at all - covering events with no enabled trigger that are
// still invokable directly by name (e.g. a response script's runEvent() helper).
export function findEntryNodeIds(graph: EventGraph): string[] {
  const outgoing = buildExecAdjacency(graph);
  const entries = new Set<string>();
  const callbacks = graph.nodes.filter((n) => n.kind === 'callback');

  for (const node of callbacks) {
    for (const target of outgoing.get(`${node.id}::exec`) ?? []) {
      entries.add(target);
    }
  }

  // An action with nothing wired into its exec input is only an entry point when the graph has
  // no trigger at all - those events exist (they're run by a Trigger Event node or a script's
  // runEvent) and their first action is the only place to start. In a graph that does have a
  // trigger, an unwired action is unfinished work, not a second entry: treating it as one makes
  // every node you drop on the canvas run on every fire, whatever the trigger decided.
  if (callbacks.length > 0) {
    return [...entries];
  }

  const hasIncoming = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.toPort === 'exec') {
      hasIncoming.add(edge.toNode);
    }
  }
  for (const node of graph.nodes) {
    if (node.kind === 'action' && !hasIncoming.has(node.id)) {
      entries.add(node.id);
    }
  }
  return [...entries];
}

// The callback node types a dispatch could have come from. An event can hold several triggers
// (a chat command and a timer in one graph), and each should run only its own branch.
export const CHAT_TRIGGER_NODE_TYPES = ['chat_command', 'chat_message'];
export const OSC_TRIGGER_NODE_TYPES = ['osc_trigger'];

function triggerToCallbackNode(triggerType: string, triggerConfig: KeyedObject, index: number): EventGraphNode {
  const { enabled, ...values } = triggerConfig;
  const base = {
    id: `callback_${index}`,
    kind: 'callback' as const,
    values,
    position: { x: 0, y: index * 120 },
  };

  if (triggerType === 'chat') {
    return { ...base, moduleName: 'twitch', nodeTypeId: 'chat_command' };
  }
  if (triggerType === 'chatMessage') {
    return { ...base, moduleName: 'twitch', nodeTypeId: 'chat_message' };
  }
  if (triggerType === 'osc') {
    return { ...base, moduleName: 'core', nodeTypeId: 'osc_trigger' };
  }
  // triggerType === 'twitch'
  if (triggerConfig.type === 'redeem') {
    return {
      ...base,
      moduleName: 'twitch',
      nodeTypeId: 'channel_point_redeem',
      values: { rewardId: triggerConfig.reward?.id, overrideAutoFulfill: triggerConfig.reward?.override },
    };
  }
  // Land on the dedicated node for this subscription type where one exists (e.g.
  // 'channel.follow' -> 'follow'), so re-editing a migrated event shows the typed node
  // instead of the freeform 'eventsub_event' escape hatch.
  const dedicatedNodeId = getNodeIdForSubscriptionType(triggerConfig.type);
  if (dedicatedNodeId) {
    return { ...base, moduleName: 'twitch', nodeTypeId: dedicatedNodeId, values: {} };
  }
  return { ...base, moduleName: 'twitch', nodeTypeId: 'eventsub_event' };
}

function commandToActionNode(command: KeyedObject, index: number): EventGraphNode {
  const { type, delay, ...rest } = command;
  const moduleName = type === 'obs' || type === 'discord' ? type : 'core';

  // Core executors (EventModCommand, etc.) read `function` off their values directly,
  // so it must stay in `values` for 'core' nodes. For obs/discord, `function` becomes
  // the nodeTypeId itself and is excluded from values to avoid a redundant duplicate field.
  let nodeTypeId: string;
  let values: KeyedObject;
  if (moduleName === 'core') {
    nodeTypeId = type;
    values = rest;
  } else {
    const { function: fn, ...restWithoutFn } = rest;
    nodeTypeId = fn;
    values = restWithoutFn;
  }

  return {
    id: `action_${index}`,
    kind: 'action',
    moduleName,
    nodeTypeId,
    values,
    delay: delay ?? 0,
    position: { x: 300, y: index * 120 },
  };
}

export function migrateFlatEventToGraph(flatEvent: KeyedObject): EventGraph {
  const nodes: EventGraphNode[] = [];
  const edges: EventGraphEdge[] = [];

  const callbackIndexes: number[] = [];
  let cbIndex = 0;
  for (const triggerType of ['chat', 'chatMessage', 'osc', 'twitch']) {
    const triggerConfig = flatEvent.triggers?.[triggerType];
    if (triggerConfig?.enabled) {
      nodes.push(triggerToCallbackNode(triggerType, triggerConfig, cbIndex));
      callbackIndexes.push(cbIndex);
      cbIndex++;
    }
  }

  const actionNodes = (flatEvent.commands ?? []).map((command: KeyedObject, i: number) =>
    commandToActionNode(command, i),
  );
  nodes.push(...actionNodes);

  if (actionNodes.length > 0) {
    for (const cbIdx of callbackIndexes) {
      edges.push(execEdge(`callback_${cbIdx}`, actionNodes[0].id));
    }
    for (let i = 0; i < actionNodes.length - 1; i++) {
      edges.push(execEdge(actionNodes[i].id, actionNodes[i + 1].id));
    }
  }

  return {
    name: flatEvent.name,
    description: flatEvent.description ?? '',
    group: flatEvent.group,
    cooldown: flatEvent.cooldown ?? 0,
    chatnotification: flatEvent.chatnotification ?? false,
    cooldownnotification: flatEvent.cooldownnotification ?? false,
    nodes,
    edges,
  };
}

export function migrateEventsFileToGraphs(oldFile: KeyedObject): EventGraphFile {
  const graphs: { [eventId: string]: EventGraph } = {};
  for (const eventId in oldFile.events ?? {}) {
    graphs[eventId] = migrateFlatEventToGraph(oldFile.events[eventId]);
  }
  return {
    graphs,
    groups: oldFile.groups ?? ['Default'],
    disabledGroups: oldFile.disabledGroups ?? [],
  };
}

// Reconstructs the legacy flat event shape from a graph, for the ~13 existing call
// sites (triggerExistsAndEnabled, ChatUtil, OnEventSubReceived, response scripts, etc.)
// that still expect `{ triggers: {...}, commands: [...] }`. Only meaningful for
// straight-chain graphs (which is all the migration above produces and all the current
// node editor can express); branching graphs would linearize best-effort.
export function reconstructFlatEventFromGraph(graph: EventGraph): KeyedObject {
  const triggers: KeyedObject = {};
  const callbackNodes = graph.nodes.filter((n) => n.kind === 'callback');

  for (const node of callbackNodes) {
    // 'chat_command'/'chat_message' are matched by nodeTypeId alone, not moduleName, so any
    // StreamModuleInterface implementation (Twitch today, a future YouTube module, etc.) can
    // reuse the same trigger shape and land in the same triggers.chat*/ slot.
    if (node.nodeTypeId === 'chat_command') {
      triggers.chat = { enabled: true, ...node.values };
    } else if (node.nodeTypeId === 'chat_message') {
      triggers.chatMessage = { enabled: true, ...node.values };
    } else if (node.moduleName === 'core' && node.nodeTypeId === 'osc_trigger') {
      triggers.osc = { enabled: true, ...node.values };
    } else if (node.moduleName === 'twitch' && node.nodeTypeId === 'channel_point_redeem') {
      triggers.twitch = {
        enabled: true,
        type: 'redeem',
        reward: { id: node.values.rewardId, override: node.values.overrideAutoFulfill },
      };
    } else if (node.moduleName === 'twitch' && node.nodeTypeId === 'eventsub_event') {
      triggers.twitch = { enabled: true, ...node.values };
    } else if (node.moduleName === 'twitch' && getSubscriptionTypeForNodeId(node.nodeTypeId)) {
      triggers.twitch = { enabled: true, type: getSubscriptionTypeForNodeId(node.nodeTypeId), ...node.values };
    } else {
      // Generic path for community/control module triggers (OBS, Discord, etc.), matched by
      // EventService.emitTrigger()/matchesTriggerValues() via triggers[moduleName].nodeTypeId
      // rather than the bespoke shapes above.
      triggers[node.moduleName] = { enabled: true, nodeTypeId: node.nodeTypeId, ...node.values };
    }
  }

  const outgoing = buildExecAdjacency(graph);
  let cursor: string[] = findEntryNodeIds(graph);

  const commands: KeyedObject[] = [];
  const visited = new Set<string>();
  while (cursor.length > 0) {
    const nodeId = cursor.shift()!;
    if (visited.has(nodeId)) {
      continue;
    }
    visited.add(nodeId);
    const node = graph.nodes.find((n) => n.id === nodeId && n.kind === 'action');
    if (!node) {
      continue;
    }
    const type = node.moduleName === 'core' ? node.nodeTypeId : node.moduleName;
    const command: KeyedObject = { type, ...node.values, delay: node.delay ?? 0 };
    if (node.moduleName !== 'core') {
      command.function = node.nodeTypeId;
    }
    commands.push(command);
    cursor.push(...(outgoing.get(`${nodeId}::exec`) ?? []));
  }

  return {
    name: graph.name,
    description: graph.description,
    group: graph.group,
    triggers,
    commands,
    cooldown: graph.cooldown,
    chatnotification: graph.chatnotification,
    cooldownnotification: graph.cooldownnotification,
  };
}

// Upgrades already-stored graphs to node shapes that changed after they were saved. Runs on
// every load and is idempotent; the caller persists only when something actually changed, so a
// graph is rewritten once and then left alone.
export function upgradeGraphNodes(graphs: { [eventId: string]: EventGraph }): number {
  let changed = 0;

  for (const eventId in graphs) {
    const graph = graphs[eventId];
    graph.nodes = graph.nodes ?? [];
    graph.edges = graph.edges ?? [];

    // Matching used to live in the chat trigger - a command prefix, or a search pattern behind
    // a `search` flag (later its own chat_search node). Both are operation nodes now, so the
    // trigger becomes an ordinary Chat Message and the matching moves into a node that gates the
    // branch. Run first, since it produces chat_message nodes already on 'core'.
    for (const node of [...graph.nodes]) {
      const matcher = matcherForTrigger(node);
      if (matcher) {
        rewriteMatchingTrigger(graph, node, matcher);
        changed++;
      }
    }

    // The chat triggers moved out of the Twitch module into core, where they belong: they read
    // a StreamMessage, which every platform module produces the same way.
    graph.nodes = graph.nodes.map((node) => {
      if (node.moduleName === 'core') {
        return node;
      }
      if (node.nodeTypeId !== 'chat_command' && node.nodeTypeId !== 'chat_message') {
        return node;
      }
      changed++;
      return { ...node, moduleName: 'core' };
    });
  }

  return changed;
}

// What a matching trigger becomes: the operation node that now does its matching, and the values
// that node needs. Everything else about the rewrite is identical for both.
function matcherForTrigger(node: EventGraphNode): { nodeTypeId: string; values: KeyedObject } | undefined {
  if (node.nodeTypeId === 'chat_search' || (node.nodeTypeId === 'chat_command' && node.values?.search)) {
    return { nodeTypeId: 'search_match', values: { text: '', pattern: String(node.values?.command ?? '') } };
  }
  // A plain chat command is a trigger again, so old ones need no rewriting at all - only the
  // search flag, which has no trigger of its own any more.
  return undefined;
}

function dataEdge(fromNode: string, fromPort: string, toNode: string, toPort: string): EventGraphEdge {
  return { id: uuidv4(), fromNode, fromPort, toNode, toPort };
}

// trigger --exec--> [if] --then--> whatever the trigger used to run
//    \--message--> [matcher] --matched--> if.condition
//                             \--matches--> any response script that reads extra[]
function rewriteMatchingTrigger(
  graph: EventGraph,
  node: EventGraphNode,
  matcher: { nodeTypeId: string; values: KeyedObject },
) {
  const { command, search, ...gates } = node.values ?? {};
  const searchId = uuidv4();
  const ifId = uuidv4();

  // The trigger keeps its own id, so nothing else in the graph has to be found and repointed.
  graph.nodes = graph.nodes.map((n) =>
    n.id === node.id ? { ...n, moduleName: 'core', nodeTypeId: 'chat_message', values: gates } : n,
  );
  // Dropped below the trigger rather than in line with it: the actions this event already has
  // are laid out to the right, and this way nothing lands on top of them.
  graph.nodes.push({
    id: searchId,
    kind: 'operation',
    moduleName: 'string',
    nodeTypeId: matcher.nodeTypeId,
    values: matcher.values,
    position: { x: node.position.x, y: node.position.y + 240 },
  });
  graph.nodes.push({
    id: ifId,
    kind: 'action',
    moduleName: 'core',
    nodeTypeId: 'if',
    // Overridden by the wire below; present so the node reads as a complete 'if' either way.
    values: { condition: false },
    position: { x: node.position.x + 320, y: node.position.y + 240 },
  });

  graph.edges = graph.edges.map((edge) => {
    if (edge.fromNode !== node.id) {
      return edge;
    }
    // What the trigger ran unconditionally now hangs off the 'then' branch.
    if (edge.fromPort === 'exec') {
      return { ...edge, fromNode: ifId, fromPort: 'then' };
    }
    // Match ports moved to the search node, and kept their ids there.
    if (edge.fromPort === 'matches' || /^match\d+$/.test(edge.fromPort)) {
      return { ...edge, fromNode: searchId };
    }
    return edge;
  });

  graph.edges.push(
    dataEdge(node.id, 'exec', ifId, 'exec'),
    dataEdge(node.id, 'message', searchId, 'text'),
    dataEdge(searchId, 'matched', ifId, 'condition'),
  );

  // A response script's extra[] came from the search trigger. Nothing supplies it now, so the
  // match array is wired into the scripts that actually reference it - the others are left
  // alone rather than given a wire they never read. Chat commands never populated extra, so
  // their scripts are left exactly as they were.
  for (const target of matcher.nodeTypeId === 'search_match' ? graph.nodes : []) {
    if (
      target.moduleName === 'core' &&
      target.nodeTypeId === 'response' &&
      /\bextra\b/.test(String(target.values?.message ?? ''))
    ) {
      graph.edges.push(dataEdge(searchId, 'matches', target.id, 'extra'));
    }
  }
}
