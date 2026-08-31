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
  // 'custom' renders a module-provided component: options.component must name a
  // renderer registered by the owning module via ModuleDefinition.fieldRenderers.
  // 'port' is a wire-only input: it draws a labelled socket and nothing else, for values that
  // can only sensibly come from another node (an array, an object) and have no typeable form.
  // 'textarea' is a multi-line block of plain text. It is always edited in the inspector, since
  // no node card row is tall enough to write a paragraph in - the card shows a preview instead.
  type:
    | 'asset'
    | 'boolean'
    | 'color'
    | 'code'
    | 'select'
    | 'text'
    | 'textarea'
    | 'number'
    | 'custom'
    | 'port';
  options?: KeyedObject;
  showif?: { variable: string; condition: string; value: any };
  // When set, this field is also a connectable input port of the given data type:
  // the frontend renders it as an inline editable value when unwired, or as a socket
  // fed by another node's output when an edge targets it.
  portType?: NodePortDataType;
  // Marks the field as one slot of a self-extending list (e.g. Concat's C..H inputs). The
  // frontend hides it until every field declared before it holds a value or is wired, so the
  // node only ever offers one empty slot at a time and grows as it's filled in. A slot that
  // already holds something is always shown, so nothing can feed a node invisibly.
  growable?: boolean;
}

export interface NodeForm {
  [fieldName: string]: NodeFieldDef;
}

export interface TriggerNodeDef {
  id: string;
  label: string;
  description?: string;
  // How wide this node's card should be by default, in graph units. Omit to take the standard
  // width - only worth setting for a node whose controls need the room (an asset picker with a
  // preview, a code editor). The user can still resize any card, and a card they have resized
  // keeps their width instead.
  nodeWidth?: number;
  form: NodeForm;
  defaults: KeyedObject;
  // Ports exposing payload data to downstream nodes once the trigger fires.
  outputs: NodePortDef[];
  // The trigger type string this node stood for in the pre-graph flat event format, e.g. the
  // 'follow' node's 'channel.follow'. Declared here so the migration between the two formats
  // can be driven by the module that owns the node instead of core importing the module's own
  // tables - which is what lets a module live in its own repo and be absent at compile time.
  legacyTriggerType?: string;
  // Present when the owning module can fire this trigger on demand, so the editor offers a
  // test panel for it. The module supplies the panel (see the WebUI's nodeTestPanel) and the
  // route that runs it; this only declares that the node is testable and what the panel
  // should ask for. `params` are the knobs the test accepts - the module interprets the ids.
  test?: TriggerTestDef;
}

export interface TriggerTestDef {
  params: TriggerTestParam[];
  // Shown above the panel's controls: what firing this test actually does, when that isn't
  // obvious (a transport it has to switch, a payload the module fills in from the node).
  note?: string;
}

export interface TriggerTestParam {
  id: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  // For 'select': option value -> display label.
  selections?: { [value: string]: string };
  default?: string | number | boolean;
  description?: string;
}

export interface ActionNodeDef {
  id: string;
  label: string;
  description?: string;
  // See TriggerNodeDef.nodeWidth. A plugin sets this per event in its events-form.json.
  nodeWidth?: number;
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
  category: 'math' | 'string' | 'logic' | 'random' | 'storage' | 'array';
  // See TriggerNodeDef.nodeWidth.
  nodeWidth?: number;
  form: NodeForm;
  defaults: KeyedObject;
  outputs: NodePortDef[];
}

export interface NodeManifest {
  moduleName: string;
  triggers: TriggerNodeDef[];
  actions: ActionNodeDef[];
  // Set for manifests generated from a plugin's events-form.json, so the node palette can
  // group them under a single 'Plugins' submenu instead of one top-level entry per plugin.
  isPlugin?: boolean;
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
  // A width the user dragged this card to, overriding the node type's own `nodeWidth` and the
  // frontend's default. Absent on every node nobody has resized, which is most of them.
  width?: number;
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
