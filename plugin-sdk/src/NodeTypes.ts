import { KeyedObject, StreamMessage } from './Types';

export type NodePortDataType = 'string' | 'number' | 'boolean' | 'any';

export interface NodePortDef {
  id: string;
  label: string;
  dataType: NodePortDataType;
}

export interface NodeFieldDef {
  label: string;
  description?: string;
  type: 'asset' | 'boolean' | 'color' | 'code' | 'select' | 'text' | 'number';
  options?: KeyedObject;
  showif?: { variable: string; condition: string; value: any };
  // When set, this field is also a connectable input port of the given data type:
  // the frontend renders it as an inline editable value when unwired, or as a socket
  // fed by another node's output when an edge targets it.
  portType?: NodePortDataType;
}

export interface NodeForm {
  [fieldName: string]: NodeFieldDef;
}

export interface TriggerNodeDef {
  id: string;
  label: string;
  description?: string;
  form: NodeForm;
  defaults: KeyedObject;
  // Ports exposing payload data to downstream nodes once the trigger fires.
  outputs: NodePortDef[];
}

export interface ActionNodeDef {
  id: string;
  label: string;
  description?: string;
  form: NodeForm;
  defaults: KeyedObject;
  // Rarely used: reserved for actions that hand a result back into the graph.
  outputs?: NodePortDef[];
  // Named execution-flow output ports for branching actions (e.g. an 'if' node's
  // 'then'/'else'). Omitted/empty => the node has the usual single unlabeled 'exec' output.
  // Which port(s) actually fire for a given run is decided by the node's own executor logic.
  execOutputs?: { id: string; label: string }[];
  supportsTimed?: boolean;
}

// Pure, side-effect-free nodes (math/string/etc.) available to every graph regardless
// of which integration modules are installed. Not tied to ModuleService.
export interface OperationNodeDef {
  id: string;
  label: string;
  description?: string;
  category: 'math' | 'string' | 'logic' | 'random' | 'storage';
  form: NodeForm;
  defaults: KeyedObject;
  outputs: NodePortDef[];
}

export interface NodeManifest {
  moduleName: string;
  triggers: TriggerNodeDef[];
  actions: ActionNodeDef[];
}

export interface ActionExecutionContext {
  eventName: string;
  streamMessage: StreamMessage;
  extra: KeyedObject;
}

export interface EventGraphNode {
  id: string;
  kind: 'callback' | 'action' | 'operation';
  moduleName: string;
  nodeTypeId: string;
  // Manual/literal values for fields not fed by an incoming data edge.
  values: KeyedObject;
  delay?: number;
  position: { x: number; y: number };
}

export interface EventGraphEdge {
  id: string;
  fromNode: string;
  // 'exec' for execution-flow edges (this node runs next); an output port id for data edges.
  fromPort: string;
  toNode: string;
  // 'exec' for execution-flow edges; an input field/port id for data edges.
  toPort: string;
}

export interface EventGraph {
  name: string;
  description: string;
  group: string;
  cooldown: number;
  chatnotification: boolean;
  cooldownnotification: boolean;
  nodes: EventGraphNode[];
  edges: EventGraphEdge[];
}

export interface EventGraphFile {
  graphs: { [eventId: string]: EventGraph };
  groups: string[];
  disabledGroups: string[];
}
