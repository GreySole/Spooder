import { spooderLog } from '../../Logging';
import { EventGraph, EventGraphNode, KeyedObject, StreamMessage } from '../../../Types';
import { buildExecAdjacency, findEntryNodeIds } from '../../util/EventGraphMigration';
import { EventService, sayInChat } from '../EventService';
import EventStorageService from '../EventStorageService';
import NodeRegistryService from '../NodeRegistryService';
import OperationNodeService from '../OperationNodeService';
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
      // Callback output ports (username, message, etc.) come from the live trigger payload,
      // not from the graph - direct StreamMessage field first, platformEventData as fallback
      // (covers trigger payload data that isn't a top-level StreamMessage field).
      const streamMessage = ctx.streamMessage as unknown as KeyedObject;
      resolved[edge.toPort] =
        streamMessage[edge.fromPort] ?? streamMessage.platformEventData?.[edge.fromPort];
      continue;
    }
    if (sourceNode.kind !== 'operation') {
      continue;
    }
    const outputs = evaluateOperationNode(graph, sourceNode, ctx, depth + 1);
    resolved[edge.toPort] = outputs[edge.fromPort];
  }
  return resolved;
}

function evaluateOperationNode(
  graph: EventGraph,
  node: EventGraphNode,
  ctx: GraphExecutionContext,
  depth: number,
): KeyedObject {
  const inputValues = resolveNodeValues(graph, node, ctx, depth);

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
function activatedPorts(node: EventGraphNode, values: KeyedObject): string[] {
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
  if (node.moduleName === 'core') {
    switch (node.nodeTypeId) {
      case 'response':
        return EventResponseCommand(values, ctx.eventName, ctx.streamMessage, ctx.extra);
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
        // Branching itself happens in activatedPorts() based on the resolved condition;
        // the node has no side effect of its own to run.
        return () => {};
      case 'set_string_value':
        return () => EventStorageService.setValue(values.eventName || ctx.eventName, values.key, 'string', values.value);
      case 'set_number_value':
        return () => EventStorageService.setValue(values.eventName || ctx.eventName, values.key, 'number', values.value);
      case 'set_boolean_value':
        return () => EventStorageService.setValue(values.eventName || ctx.eventName, values.key, 'boolean', values.value);
      case 'say_in_chat':
        return () => sayInChat(values.message, ctx.streamMessage.platform, ctx.streamMessage.channel);
      case 'trigger_event':
        return () =>
          EventService.runCommands(ctx.streamMessage, values.eventName, ctx.streamMessage.messageType, ctx.extra);
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

export function walkEventGraph(graph: EventGraph, ctx: GraphExecutionContext) {
  const outgoing = buildExecAdjacency(graph);
  let cursor: string[] = findEntryNodeIds(graph);

  const visited = new Set<string>();
  while (cursor.length > 0) {
    const nodeId = cursor.shift()!;
    if (visited.has(nodeId)) {
      continue;
    }
    visited.add(nodeId);

    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node || node.kind !== 'action') {
      continue;
    }

    const values = resolveNodeValues(graph, node, ctx);
    const thunk = executeGraphNode(node, values, ctx);

    if ((node.delay ?? 0) === 0) {
      thunk();
    } else {
      setTimeout(thunk, node.delay);
    }

    for (const port of activatedPorts(node, values)) {
      cursor.push(...(outgoing.get(`${nodeId}::${port}`) ?? []));
    }
  }
}
