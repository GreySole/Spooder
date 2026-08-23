import { spooderLog } from '../../Logging';
import { EventGraph, EventGraphNode, KeyedObject, StreamMessage } from '../../../Types';
import { matchCommand } from '../../util/CommandMatchUtil';
import { buildExecAdjacency, findEntryNodeIds } from '../../util/EventGraphMigration';
import { EventService, sayInChat } from '../EventService';
import EventStorageService from '../EventStorageService';
import NodeRegistryService from '../NodeRegistryService';
import OperationNodeService from '../OperationNodeService';
import OscLayerService from '../OscLayerService';
import TimerService from '../TimerService';
import EventModCommand from './EventModCommand';
import EventPluginCommand from './EventPluginCommand';
import EventResponseCommand from './EventResponseCommand';
import EventSoftwareCommand from './EventSoftwareCommand';

export interface GraphExecutionContext {
  eventName: string;
  streamMessage: StreamMessage;
  extra: KeyedObject;
  // Preserved verbatim from the caller (ChatUtil/OnEventSubReceived/OSC handling) so
  // 'software' nodes retain their original isChat/isOSC-dependent behavior.
  isChat: boolean;
  isOSC: boolean;
  // The legacy flat-shaped event (derived view), passed through unchanged so
  // EventSoftwareCommand's `event.triggers.osc.handletype` read keeps working as-is.
  event: KeyedObject;
  activeEvents: KeyedObject;
}

// Resolves a node's field values: an incoming data edge wins, otherwise the node's own
// manual/literal value is used. Operation node sources are evaluated lazily/on demand
// since they're pure (or, for get_*_value, side-effect-free from the automation's point of
// view) and have no fixed position in the exec order.
function resolveNodeValues(
  graph: EventGraph,
  node: EventGraphNode,
  ctx: GraphExecutionContext,
  actionOutputs: Map<string, KeyedObject>,
  depth = 0,
): KeyedObject {
  const resolved: KeyedObject = { ...node.values };
  if (depth > 20) {
    return resolved;
  }
  for (const edge of graph.edges) {
    if (edge.toNode !== node.id || edge.toPort === 'exec') {
      continue;
    }
    const sourceNode = graph.nodes.find((n) => n.id === edge.fromNode);
    if (!sourceNode) {
      continue;
    }
    if (sourceNode.kind === 'callback') {
      // 'match0'..'matchN' are the words a search-and-match trigger pulled out of the message
      // (see checkResponseTrigger in ResponseUtil): they aren't fields of the StreamMessage at
      // all, they're the per-fire match array the trigger handed to this walk as ctx.extra -
      // the same array a response script reads as extra[]. Matched on the port id rather than
      // on the node type so every trigger that runs a search pattern (chat_command today, the
      // OSC trigger's 'search' handle type) resolves them the same way.
      // A Chat Command trigger's args are the words after the command in the message that fired
      // the event. They're not StreamMessage fields, so they're parsed here with the same
      // matcher the trigger fired on - see CommandMatchUtil.
      if (sourceNode.nodeTypeId === 'chat_command') {
        const argPort = /^arg(\d+)$/.exec(edge.fromPort);
        if (argPort || edge.fromPort === 'args') {
          const { args } = matchCommand(sourceNode.values?.command, ctx.streamMessage.message);
          // '' rather than undefined for a missing arg, so an argument nobody typed doesn't
          // print as 'undefined' downstream.
          resolved[edge.toPort] = argPort ? (args[Number(argPort[1])] ?? '') : args;
          continue;
        }
      }
      if (edge.fromPort === 'matches') {
        // The match array itself. Guarded because ctx.extra is only an array when a search
        // pattern filled it - every other trigger leaves it an empty object.
        resolved[edge.toPort] = Array.isArray(ctx.extra) ? ctx.extra : [];
        continue;
      }
      const matchPort = /^match(\d+)$/.exec(edge.fromPort);
      if (matchPort) {
        // '' rather than undefined: an unmatched slot should read as empty text downstream,
        // not print as 'undefined' in a chat message.
        resolved[edge.toPort] = (ctx.extra as KeyedObject)?.[Number(matchPort[1])] ?? '';
        continue;
      }
      // Callback output ports (username, message, etc.) come from the live trigger payload,
      // not from the graph - platformEventData first (the actual per-event Twitch/etc.
      // payload), StreamMessage field as fallback. platformEventData is only ever set for
      // EventSub-sourced messages (chat messages never populate it), and StreamMessage's own
      // fields default to '' /false for those, so checking it first would silently shadow
      // real payload data (e.g. a cheer's `message`) with an empty default.
      const streamMessage = ctx.streamMessage as unknown as KeyedObject;
      resolved[edge.toPort] =
        streamMessage.platformEventData?.[edge.fromPort] ?? streamMessage[edge.fromPort];
      continue;
    }
    if (sourceNode.kind === 'action') {
      resolved[edge.toPort] = actionOutputs.get(sourceNode.id)?.[edge.fromPort];
      continue;
    }
    if (sourceNode.kind !== 'operation') {
      continue;
    }
    const outputs = evaluateOperationNode(graph, sourceNode, ctx, actionOutputs, depth + 1);
    resolved[edge.toPort] = outputs[edge.fromPort];
  }
  return resolved;
}

function evaluateOperationNode(
  graph: EventGraph,
  node: EventGraphNode,
  ctx: GraphExecutionContext,
  actionOutputs: Map<string, KeyedObject>,
  depth: number,
): KeyedObject {
  const inputValues = resolveNodeValues(graph, node, ctx, actionOutputs, depth);

  // Keyed off nodeTypeId, not node.moduleName: the frontend palette tags operation nodes
  // with their category as moduleName (these three carry category 'storage'), so a
  // moduleName === 'core' check here would never match and these would fall through to
  // OperationNodeService.evaluate() and throw.
  switch (node.nodeTypeId) {
    case 'get_string_value': {
      const eventName = inputValues.eventName || ctx.eventName;
      return { value: EventStorageService.getValue(eventName, inputValues.key, 'string', inputValues.defaultValue) };
    }
    case 'get_number_value': {
      const eventName = inputValues.eventName || ctx.eventName;
      return { value: EventStorageService.getValue(eventName, inputValues.key, 'number', inputValues.defaultValue) };
    }
    case 'get_array_value': {
      const eventName = inputValues.eventName || ctx.eventName;
      const value = EventStorageService.getValue(eventName, inputValues.key, 'array', []);
      return { value, length: value.length };
    }
    case 'get_boolean_value': {
      const eventName = inputValues.eventName || ctx.eventName;
      return { value: EventStorageService.getValue(eventName, inputValues.key, 'boolean', inputValues.defaultValue) };
    }
    default:
      return OperationNodeService.evaluate(node.nodeTypeId, inputValues);
  }
}

// Which named exec port(s) a node activates after running. Every existing node type
// (all 150 pre-existing events) defaults to the generic 'exec' port - unchanged behavior.
// Only 'if' branches, following just the port matching its resolved condition.
function activatedPorts(
  node: EventGraphNode,
  values: KeyedObject,
  ctx: GraphExecutionContext,
): string[] {
  if (node.moduleName === 'core' && node.nodeTypeId === 'platform_branch') {
    // The port ids are the stream module names, so the platform is the branch. Unwired, it's
    // the platform of the message being handled - which is the whole point of the node; the
    // input is there for testing some other value. A platform with no port wired resolves to
    // nothing in the exec adjacency and the branch simply ends.
    const platform = String(values.platform || ctx.streamMessage.platform || '');
    return platform ? [platform] : [];
  }
  if (node.moduleName === 'core' && node.nodeTypeId === 'if') {
    if (values.condition === undefined || values.condition === null) {
      spooderLog(`'if' node ${node.id} has no resolvable condition, following 'else'`);
      return ['else'];
    }
    return [values.condition ? 'then' : 'else'];
  }
  return ['exec'];
}

function executeGraphNode(node: EventGraphNode, values: KeyedObject, ctx: GraphExecutionContext) {
  if (node.nodeTypeId === 'promise_all') {
    return () => {};
  }
  if (node.moduleName === 'core') {
    switch (node.nodeTypeId) {
      case 'response':
        // A wired 'extra' input overrides what the trigger handed down - that's how a script
        // gets at graph values, e.g. a Search & Match node's matches.
        return EventResponseCommand(values, ctx.eventName, ctx.streamMessage, values.extra ?? ctx.extra);
      case 'plugin':
        return EventPluginCommand(values, ctx.eventName, ctx.streamMessage, ctx.extra);
      case 'mod':
        return EventModCommand(values, ctx.eventName, ctx.streamMessage, ctx.extra);
      case 'software':
        return EventSoftwareCommand(
          values,
          ctx.isChat,
          ctx.isOSC,
          ctx.event,
          ctx.activeEvents,
          ctx.streamMessage,
          ctx.eventName,
        );
      case 'if':
      case 'platform_branch':
        // Branching itself happens in activatedPorts(); neither node has a side effect of its
        // own to run.
        return () => {};
      case 'set_string_value':
        return () => EventStorageService.setValue(values.eventName || ctx.eventName, values.key, 'string', values.value);
      case 'set_number_value':
        return () => EventStorageService.setValue(values.eventName || ctx.eventName, values.key, 'number', values.value);
      case 'set_array_value':
        return () => EventStorageService.setValue(values.eventName || ctx.eventName, values.key, 'array', values.value);
      case 'set_boolean_value':
        return () => EventStorageService.setValue(values.eventName || ctx.eventName, values.key, 'boolean', values.value);
      case 'say_in_chat':
        return () => {
          const platform = String(values.platform ?? '');
          const channel = String(values.channel ?? '');
          if (platform === 'all') {
            // sayInChat with no platform posts to every connected stream module's home channel.
            // A channel means nothing across platforms, so it's ignored here rather than
            // silently applied to one of them.
            sayInChat(values.message);
            return;
          }
          if (platform) {
            // An explicit platform means this isn't a reply to the event's own conversation, so
            // the event's channel doesn't carry over - an empty channel is that platform's home.
            sayInChat(values.message, platform, channel || undefined);
            return;
          }
          sayInChat(values.message, ctx.streamMessage.platform, channel || ctx.streamMessage.channel);
        };
      case 'trigger_event':
        return () =>
          EventService.runCommands(ctx.streamMessage, values.eventName, ctx.streamMessage.messageType, ctx.extra);
      case 'start_timer':
        return () => TimerService.start(values.name, values.duration, values.repeat);
      case 'stop_timer':
        return () => TimerService.stop(values.name);
      case 'osc_claim':
        return () =>
          OscLayerService.claim(
            values.dest_udp,
            values.address,
            values.slot,
            ctx.eventName,
            values.priority,
            values.value,
            values.releaseValue,
          );
      case 'osc_release':
        return () =>
          OscLayerService.release(values.dest_udp, values.address, values.slot, ctx.eventName);
      default:
        return () => spooderLog(`Unknown core node '${node.nodeTypeId}' for event ${ctx.eventName}`);
    }
  }

  return NodeRegistryService.executeAction(node.moduleName, node.nodeTypeId, values, {
    eventName: ctx.eventName,
    streamMessage: ctx.streamMessage,
    extra: ctx.extra,
  });
}

// `entryNodeIds` scopes the walk to one trigger's branch. Without it the walk starts from
// every callback in the graph (findEntryNodeIds), so a graph with two triggers runs both
// branches whichever one fired - fine when an event has a single trigger, but wrong for e.g.
// a Timer Elapsed and a Timer Tick sharing one event. Callers that don't pass it keep the
// original behavior exactly.
// Where a fire starts. `triggerNodeTypes` narrows it to the kind of trigger that actually fired,
// so an event holding both a chat trigger and a timer runs only the branch that was triggered.
// Returns undefined when the graph has no trigger of that kind - the caller decides what that
// means, since the dispatch must then have come from somewhere else (a Trigger Event node, say).
export function entryNodesForDispatch(
  graph: EventGraph,
  ctx: GraphExecutionContext,
  triggerNodeTypes?: string[],
): string[] | undefined {
  const callbacks = graph.nodes.filter(
    (n) => n.kind === 'callback' && (!triggerNodeTypes || triggerNodeTypes.includes(n.nodeTypeId)),
  );
  if (callbacks.length === 0) {
    // A graph with no trigger at all is run programmatically and starts at its loose actions;
    // findEntryNodeIds knows that rule. A graph that has triggers but none of this kind is a
    // dispatch this function can't speak for.
    return triggerNodeTypes ? undefined : findEntryNodeIds(graph);
  }

  const outgoing = buildExecAdjacency(graph);
  const entries = new Set<string>();
  for (const callback of callbacks) {
    for (const target of outgoing.get(`${callback.id}::exec`) ?? []) {
      entries.add(target);
    }
  }
  return [...entries];
}

// Nodes whose whole job is choosing a branch: they run no side effect of their own (see the
// empty thunks in executeGraphNode).
function isControlFlowNode(node: EventGraphNode): boolean {
  return node.moduleName === 'core' && (node.nodeTypeId === 'if' || node.nodeTypeId === 'platform_branch');
}

// Returns how many action nodes it actually ran. Callers use that to tell "this event did
// something" from "this event was asked and declined": a graph that gates itself (Chat Message
// into a matcher into an If) is walked for every message, and treating those as activations
// would spend the event's cooldown on messages it ignored.
export function walkEventGraph(
  graph: EventGraph,
  ctx: GraphExecutionContext,
  entryNodeIds?: string[],
  actionOutputs = new Map<string, KeyedObject>(),
  completedActions = new Set<string>(),
): number {
  let executed = 0;
  const outgoing = buildExecAdjacency(graph);
  let cursor: string[] = entryNodeIds ?? findEntryNodeIds(graph);

  const visited = new Set<string>();
  while (cursor.length > 0) {
    const nodeId = cursor.shift()!;
    if (visited.has(nodeId)) {
      continue;
    }

    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node || node.kind !== 'action') {
      continue;
    }

    if (node.nodeTypeId === 'promise_all') {
      const predecessors = graph.edges
        .filter((edge) => edge.toNode === node.id && edge.toPort === 'exec')
        .map((edge) => edge.fromNode);
      if (predecessors.some((predecessor) => !completedActions.has(predecessor))) {
        continue;
      }
    }
    visited.add(nodeId);

    const values = resolveNodeValues(graph, node, ctx, actionOutputs);

    // A 'delay' node defers the rest of the branch rather than itself. The node's own `delay`
    // field (handled below) only postpones that one node's thunk - this loop pushes downstream
    // nodes immediately either way - so pausing the chain means scheduling a fresh walk from
    // this node's targets and stopping the current one here.
    if (node.moduleName === 'core' && node.nodeTypeId === 'delay') {
      const targets = activatedPorts(node, values, ctx).flatMap(
        (port) => outgoing.get(`${nodeId}::${port}`) ?? [],
      );
      const seconds = Number(values.seconds);
      if (targets.length > 0) {
        // Counted as having run: the branch is committed, it's just waiting.
        executed++;
        setTimeout(
          () => walkEventGraph(graph, ctx, targets, actionOutputs, completedActions),
          Math.max(0, Number.isFinite(seconds) ? seconds : 0) * 1000,
        );
      }
      continue;
    }

    const thunk = executeGraphNode(node, values, ctx);

    // Legacy per-node delay (milliseconds), superseded by the 'delay' node. It's no longer
    // authorable - the inspector field and the palette's default are gone - but saved events
    // still carry it, so it keeps being honored. Note the semantics differ from a delay node:
    // this postpones only this node's own thunk while the walk continues immediately, so the
    // values act as offsets from the start of the event rather than as sequential pauses.
    // Control-flow nodes don't count as the event having done anything - they're how a graph
    // declines. An 'if' whose branch goes nowhere is exactly the "asked and said no" case the
    // caller needs to distinguish, and it is itself an action node, so without this the walk
    // would report activity for every message it ever considered.
    if (!isControlFlowNode(node)) {
      executed++;
    }
    // A node that throws takes only itself down. It used to take the rest of the branch with it,
    // and now that the cooldown is applied after the walk it would take that too - one bad
    // plugin action shouldn't leave an event uncooled or stop the actions wired after it.
    const targets = activatedPorts(node, values, ctx).flatMap(
      (port) => outgoing.get(`${nodeId}::${port}`) ?? [],
    );
    const runThunk = (): Promise<void> | undefined => {
      try {
        const result: void | KeyedObject | Promise<void | KeyedObject> = (thunk as () =>
          | void
          | KeyedObject
          | Promise<void | KeyedObject>)();
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          return (result as Promise<KeyedObject | void>)
            .then((outputs) => {
              if (outputs && typeof outputs === 'object') {
                actionOutputs.set(node.id, outputs);
              }
              completedActions.add(node.id);
              if (targets.length > 0) {
                walkEventGraph(graph, ctx, targets, actionOutputs, completedActions);
              }
            })
            .catch((e) => {
              spooderLog(`Node '${node.moduleName}/${node.nodeTypeId}' failed in event ${ctx.eventName}`, e);
              completedActions.add(node.id);
              if (targets.length > 0) {
                walkEventGraph(graph, ctx, targets, actionOutputs, completedActions);
              }
            });
        }
        if (result && typeof result === 'object') {
          actionOutputs.set(node.id, result);
        }
        completedActions.add(node.id);
      } catch (e) {
        spooderLog(`Node '${node.moduleName}/${node.nodeTypeId}' failed in event ${ctx.eventName}`, e);
      }
    };
    if ((node.delay ?? 0) === 0) {
      const pending = runThunk();
      if (!pending) {
        cursor.push(...targets);
      }
    } else {
      setTimeout(runThunk, node.delay);
    }
  }

  return executed;
}
