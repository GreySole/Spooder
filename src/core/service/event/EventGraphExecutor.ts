import { spooderLog } from '../../Logging';
import { EventGraph, EventGraphNode, KeyedObject, StreamMessage } from '../../../Types';
import { buildExecAdjacency, findEntryNodeIds } from '../../util/EventGraphMigration';
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
// since they're pure and have no fixed position in the exec order.
function resolveNodeValues(graph: EventGraph, node: EventGraphNode, depth = 0): KeyedObject {
  const resolved: KeyedObject = { ...node.values };
  if (depth > 20) {
    return resolved;
  }
  for (const edge of graph.edges) {
    if (edge.toNode !== node.id || edge.toPort === 'exec') {
      continue;
    }
    const sourceNode = graph.nodes.find((n) => n.id === edge.fromNode);
    if (!sourceNode || sourceNode.kind !== 'operation') {
      continue;
    }
    const sourceValues = resolveNodeValues(graph, sourceNode, depth + 1);
    const outputs = OperationNodeService.evaluate(sourceNode.nodeTypeId, sourceValues);
    resolved[edge.toPort] = outputs[edge.fromPort];
  }
  return resolved;
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

    const values = resolveNodeValues(graph, node);
    const thunk = executeGraphNode(node, values, ctx);

    if ((node.delay ?? 0) === 0) {
      thunk();
    } else {
      setTimeout(thunk, node.delay);
    }

    cursor.push(...(outgoing.get(nodeId) ?? []));
  }
}
