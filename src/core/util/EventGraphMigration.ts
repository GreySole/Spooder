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
  const hasIncoming = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.toPort === 'exec') {
      hasIncoming.add(edge.toNode);
    }
  }

  const entries = new Set<string>();
  for (const node of graph.nodes) {
    if (node.kind === 'callback') {
      for (const target of outgoing.get(`${node.id}::exec`) ?? []) {
        entries.add(target);
      }
    } else if (node.kind === 'action' && !hasIncoming.has(node.id)) {
      entries.add(node.id);
    }
  }
  return [...entries];
}

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
    } else if (node.nodeTypeId === 'chat_search') {
      // Lands in the same slot as a chat command, with search mode implied by the node type
      // rather than carried as a field - so ChatUtil and checkResponseTrigger keep reading one
      // shape and never learn there are two nodes.
      triggers.chat = { enabled: true, ...node.values, search: true };
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
//
// 'chat_command' with `search: true` predates the Chat Search & Match node, which is the same
// trigger with the mode baked into the node type instead of a checkbox. The values carry over
// untouched (the pattern is still keyed `command`), so this is a node type swap and nothing else.
export function upgradeGraphNodes(graphs: { [eventId: string]: EventGraph }): number {
  let changed = 0;

  for (const eventId in graphs) {
    const graph = graphs[eventId];
    graph.nodes = (graph.nodes ?? []).map((node) => {
      if (node.nodeTypeId !== 'chat_command' || !node.values?.search) {
        return node;
      }
      changed++;
      const { search, ...values } = node.values;
      return { ...node, nodeTypeId: 'chat_search', values };
    });
  }

  return changed;
}
