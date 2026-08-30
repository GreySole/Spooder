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

    // Arg Count arrived after these nodes were saved, and a chat trigger migrated from the flat
    // event format never carried one either. Everything that reads it already treats absent as
    // zero, but the card's number input binds the raw value - undefined renders as a blank box
    // rather than the 0 the node actually behaves as - so the default is written in.
    graph.nodes = graph.nodes.map((node) => {
      if (node.nodeTypeId !== 'chat_command' || node.values?.argCount != null) {
        return node;
      }
      changed++;
      return { ...node, values: { ...node.values, argCount: 0 } };
    });

    // Timing last, and in this order: lifting a delayed node out of the chain works on the
    // shape a 0.5 event was migrated into, and expanding an OSC Send then hangs its release
    // off wherever that left it.
    changed += convertLegacyDelays(graph);
    changed += upgradeOscSendNodes(graph);
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

// --- 0.5 -> node-graph upgrades for timing and OSC sends -------------------------------

function delayNode(seconds: number, position: { x: number; y: number }): EventGraphNode {
  return {
    id: uuidv4(),
    kind: 'action',
    moduleName: 'core',
    nodeTypeId: 'delay',
    values: { seconds },
    position,
  };
}

// Exec edges into / out of a node, by the generic 'exec' port only. A node lifted out of a
// chain below keeps any named-port edges (an 'if' node's then/else) exactly where they are.
function execEdgesInto(graph: EventGraph, nodeId: string) {
  return graph.edges.filter((e) => e.toNode === nodeId && e.toPort === 'exec');
}

function execEdgesOutOf(graph: EventGraph, nodeId: string) {
  return graph.edges.filter((e) => e.fromNode === nodeId && e.fromPort === 'exec');
}

// A 0.5 event's commands each carried a `delay` in milliseconds, and the executor still
// honors it (see EventGraphExecutor) - but it is an offset from the start of the event, not a
// pause in the chain: the walk continues immediately and only that one command is postponed.
// Three commands delayed 3199ms in a row all fire at 3.199s, not at 3.2/6.4/9.6s.
//
// So the delay can't simply become a Delay node in front of the command - that would defer
// everything after it too, and the offsets would compound. Instead the delayed node is lifted
// out of the chain onto a branch of its own: whatever ran before it now runs straight into
// whatever ran after it, and the node hangs off that same predecessor behind a Delay. Absolute
// timing is preserved exactly, and the delay is finally visible on the canvas.
//
// Consecutive nodes sharing one delay are lifted together, as one branch behind one Delay
// node, which is the shape a 0.5 event that fired several commands at the same offset had.
function convertLegacyDelays(graph: EventGraph): number {
  let changed = 0;
  // graph.nodes is in chain order for migrated events, which is the order the runs below are
  // found in; a hand-built graph still converts correctly, just one node per branch.
  for (const node of [...graph.nodes]) {
    const delayMs = node.delay ?? 0;
    if (delayMs <= 0) {
      continue;
    }

    // The run this node starts: itself, plus each following node that is its only exec
    // successor, shares its delay, and is entered from nowhere else.
    const run = [node];
    for (;;) {
      const outs = execEdgesOutOf(graph, run[run.length - 1].id);
      if (outs.length !== 1) {
        break;
      }
      const next = graph.nodes.find((n) => n.id === outs[0].toNode);
      if (!next || (next.delay ?? 0) !== delayMs || execEdgesInto(graph, next.id).length !== 1) {
        break;
      }
      run.push(next);
    }

    const inEdges = execEdgesInto(graph, node.id);
    const outEdges = execEdgesOutOf(graph, run[run.length - 1].id);
    const delay = delayNode(delayMs / 1000, {
      x: node.position.x - 200,
      y: node.position.y,
    });

    graph.nodes.push(delay);
    graph.edges = graph.edges.filter((e) => !inEdges.includes(e) && !outEdges.includes(e));
    // The chain closes over the gap the run leaves, then the run hangs off the same
    // predecessors behind the Delay. A run with no predecessor (an orphan, or the graph's
    // own entry) just gains the Delay in front of it, which becomes the new entry.
    for (const inEdge of inEdges) {
      for (const outEdge of outEdges) {
        graph.edges.push(execEdge(inEdge.fromNode, outEdge.toNode));
      }
      graph.edges.push(execEdge(inEdge.fromNode, delay.id));
    }
    graph.edges.push(execEdge(delay.id, node.id));

    for (const runNode of run) {
      delete runNode.delay;
      changed++;
    }
  }
  return changed;
}

// The OSC Send node was three nodes in one. 'timed' sent a value, held the address for a
// duration, then sent an off value - arbitrating by `priority` against other events driving
// the same address, and restoring their value rather than switching off when it lost. That is
// exactly OSC Claim/OSC Release (see OscLayerService, which was written to replace it), so a
// timed send becomes Claim -> Delay -> Release. 'button-press' sent an off value 500ms later,
// which is a Delay and a second send. 'oneshot' was already just the send.
//
// The expansion hangs off the send's own exec port alongside whatever it already ran into:
// the old node started its off-timer and let the chain carry on immediately, so the release
// must not block what follows.
function upgradeOscSendNodes(graph: EventGraph): number {
  let changed = 0;
  for (const node of [...graph.nodes]) {
    if (node.moduleName !== 'core' || node.nodeTypeId !== 'software') {
      continue;
    }
    const values = node.values ?? {};
    // Already upgraded: the legacy fields are what identifies a node that still needs it.
    if (
      values.etype == null &&
      values.duration == null &&
      values.valueOff == null &&
      values.priority == null
    ) {
      continue;
    }

    const { etype, duration, valueOff, priority, ...send } = values;
    const seconds = Number(duration);
    const holdSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    const below = { x: node.position.x + 240, y: node.position.y + 110 };

    if (etype === 'timed') {
      // The node keeps its id so every edge already pointing at it still lands on the claim.
      node.nodeTypeId = 'osc_claim';
      node.values = {
        dest_udp: send.dest_udp,
        address: send.address,
        slot: '',
        value: send.valueOn,
        releaseValue: valueOff,
        priority: Number(priority) || 0,
      };
      const release: EventGraphNode = {
        id: uuidv4(),
        kind: 'action',
        moduleName: 'core',
        nodeTypeId: 'osc_release',
        values: { dest_udp: send.dest_udp, address: send.address, slot: '' },
        position: { x: below.x + 240, y: below.y },
      };
      graph.nodes.push(release);
      if (holdSeconds > 0) {
        const hold = delayNode(holdSeconds, below);
        graph.nodes.push(hold);
        graph.edges.push(execEdge(node.id, hold.id), execEdge(hold.id, release.id));
      } else {
        graph.edges.push(execEdge(node.id, release.id));
      }
      changed++;
      continue;
    }

    node.values = send;

    if (etype === 'button-press') {
      // 500ms was hard-coded in the old executor, not configurable.
      const hold = delayNode(0.5, below);
      const off: EventGraphNode = {
        id: uuidv4(),
        kind: 'action',
        moduleName: 'core',
        nodeTypeId: 'software',
        values: { dest_udp: send.dest_udp, address: send.address, valueOn: valueOff },
        position: { x: below.x + 240, y: below.y },
      };
      graph.nodes.push(hold, off);
      graph.edges.push(execEdge(node.id, hold.id), execEdge(hold.id, off.id));
    }

    // 'oneshot' (and anything unrecognised) is the send it always was; the legacy fields are
    // simply dropped, which the destructure above already did.
    changed++;
  }
  return changed;
}
