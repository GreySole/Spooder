import { KeyedObject } from '../../Types';

// Widgets the master overlay can draw itself, as layers alongside plugin overlays. They read
// values off the overlay's own OSC connection, so anything a tunnel forwards to TCP can be
// shown. The editor builds each widget's settings form from `form`, and the overlay page
// (webui/overlay/widgets.js) draws it - both keyed by `id`.
export type OverlayWidgetFieldType = 'text' | 'number' | 'color' | 'boolean' | 'select';

export interface OverlayWidgetField {
  label: string;
  type: OverlayWidgetFieldType;
  // select only. `optionsFrom` fills the options when the config is served, for lists that
  // aren't fixed (the events that can hold storage values).
  options?: { label: string; value: string }[];
  optionsFrom?: 'events' | 'eventKeys';
  // For a dependent list: the field whose value picks which options apply (a key list depends on
  // the chosen event).
  dependsOn?: string;
  // Only shown (and only used) while another field of the widget has this value.
  showIf?: { field: string; equals: any };
  min?: number;
  max?: number;
  step?: number;
}

export interface OverlayWidgetDef {
  id: string;
  label: string;
  // Groups the widget in the editor's Add Layer menu.
  category: string;
  description: string;
  form: { [field: string]: OverlayWidgetField };
  defaults: KeyedObject;
  // Percent of the canvas, for a widget when it's first added.
  defaultSize: { width: number; height: number };
}

const OSC_VALUE_FORM_LABEL: OverlayWidgetField = { label: 'Label', type: 'text' };

const ALIGN_OPTIONS = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
];

export const OVERLAY_WIDGETS: OverlayWidgetDef[] = [
  {
    id: 'osc_value',
    label: 'OSC Value',
    category: 'OSC',
    description: 'Shows the latest value received on an OSC address as text.',
    form: {
      address: { label: 'OSC Address', type: 'text' },
      argIndex: { label: 'Argument Index', type: 'number', min: 0, step: 1 },
      label: { label: 'Label', type: 'text' },
      prefix: { label: 'Prefix', type: 'text' },
      suffix: { label: 'Suffix', type: 'text' },
      decimals: { label: 'Decimal Places', type: 'number', min: 0, max: 10, step: 1 },
      align: { label: 'Alignment', type: 'select', options: ALIGN_OPTIONS },
      fontSize: { label: 'Value Size (% of height)', type: 'number', min: 5, max: 100, step: 1 },
      color: { label: 'Value Color', type: 'color' },
      labelColor: { label: 'Label Color', type: 'color' },
      background: { label: 'Background', type: 'color' },
      backgroundOpacity: { label: 'Background Opacity (%)', type: 'number', min: 0, max: 100, step: 1 },
    },
    defaults: {
      address: '',
      argIndex: 0,
      label: '',
      prefix: '',
      suffix: '',
      decimals: 2,
      align: 'left',
      fontSize: 60,
      color: '#ffffff',
      labelColor: '#aaaaaa',
      background: '#000000',
      backgroundOpacity: 0,
    },
    defaultSize: { width: 20, height: 10 },
  },
  {
    id: 'osc_bar',
    label: 'OSC Bar',
    category: 'OSC',
    description: 'Fills a bar according to the latest number received on an OSC address.',
    form: {
      address: { label: 'OSC Address', type: 'text' },
      argIndex: { label: 'Argument Index', type: 'number', min: 0, step: 1 },
      label: { label: 'Label', type: 'text' },
      min: { label: 'Minimum', type: 'number', step: 0.01 },
      max: { label: 'Maximum', type: 'number', step: 0.01 },
      orientation: {
        label: 'Direction',
        type: 'select',
        options: [
          { label: 'Left to right', value: 'horizontal' },
          { label: 'Bottom to top', value: 'vertical' },
        ],
      },
      showValue: { label: 'Show Value', type: 'boolean' },
      decimals: { label: 'Decimal Places', type: 'number', min: 0, max: 10, step: 1 },
      color: { label: 'Bar Color', type: 'color' },
      background: { label: 'Track Color', type: 'color' },
      textColor: { label: 'Text Color', type: 'color' },
    },
    defaults: {
      address: '',
      argIndex: 0,
      label: '',
      min: 0,
      max: 1,
      orientation: 'horizontal',
      showValue: true,
      decimals: 2,
      color: '#4da6ff',
      background: '#222222',
      textColor: '#ffffff',
    },
    defaultSize: { width: 25, height: 6 },
  },
  {
    id: 'storage_value',
    label: 'Storage Value',
    category: 'Event Storage',
    description:
      "Shows an event's stored value as text, and updates when the value changes. Storage values are the ones Set Value nodes write.",
    form: {
      eventName: { label: 'Event', type: 'select', optionsFrom: 'events' },
      key: { label: 'Key', type: 'select', optionsFrom: 'eventKeys', dependsOn: 'eventName' },
      label: OSC_VALUE_FORM_LABEL,
      prefix: { label: 'Prefix', type: 'text' },
      suffix: { label: 'Suffix', type: 'text' },
      decimals: { label: 'Decimal Places', type: 'number', min: 0, max: 10, step: 1 },
      align: { label: 'Alignment', type: 'select', options: ALIGN_OPTIONS },
      fontSize: { label: 'Value Size (% of height)', type: 'number', min: 5, max: 100, step: 1 },
      color: { label: 'Value Color', type: 'color' },
      labelColor: { label: 'Label Color', type: 'color' },
      background: { label: 'Background', type: 'color' },
      backgroundOpacity: { label: 'Background Opacity (%)', type: 'number', min: 0, max: 100, step: 1 },
    },
    defaults: {
      eventName: '',
      key: '',
      label: '',
      prefix: '',
      suffix: '',
      decimals: 2,
      align: 'left',
      fontSize: 60,
      color: '#ffffff',
      labelColor: '#aaaaaa',
      background: '#000000',
      backgroundOpacity: 0,
    },
    defaultSize: { width: 20, height: 10 },
  },
  {
    id: 'storage_bar',
    label: 'Storage Bar',
    category: 'Event Storage',
    description: "Fills a bar according to an event's stored number, and updates when it changes.",
    form: {
      eventName: { label: 'Event', type: 'select', optionsFrom: 'events' },
      key: { label: 'Key', type: 'select', optionsFrom: 'eventKeys', dependsOn: 'eventName' },
      label: OSC_VALUE_FORM_LABEL,
      minFromKey: { label: 'Minimum From Key', type: 'boolean' },
      min: {
        label: 'Minimum',
        type: 'number',
        step: 0.01,
        showIf: { field: 'minFromKey', equals: false },
      },
      minKey: {
        label: 'Minimum Key',
        type: 'select',
        optionsFrom: 'eventKeys',
        dependsOn: 'eventName',
        showIf: { field: 'minFromKey', equals: true },
      },
      maxFromKey: { label: 'Maximum From Key', type: 'boolean' },
      max: {
        label: 'Maximum',
        type: 'number',
        step: 0.01,
        showIf: { field: 'maxFromKey', equals: false },
      },
      maxKey: {
        label: 'Maximum Key',
        type: 'select',
        optionsFrom: 'eventKeys',
        dependsOn: 'eventName',
        showIf: { field: 'maxFromKey', equals: true },
      },
      orientation: {
        label: 'Direction',
        type: 'select',
        options: [
          { label: 'Left to right', value: 'horizontal' },
          { label: 'Bottom to top', value: 'vertical' },
        ],
      },
      showValue: { label: 'Show Value', type: 'boolean' },
      decimals: { label: 'Decimal Places', type: 'number', min: 0, max: 10, step: 1 },
      color: { label: 'Bar Color', type: 'color' },
      background: { label: 'Track Color', type: 'color' },
      textColor: { label: 'Text Color', type: 'color' },
    },
    defaults: {
      eventName: '',
      key: '',
      label: '',
      minFromKey: false,
      minKey: '',
      min: 0,
      maxFromKey: false,
      maxKey: '',
      max: 100,
      orientation: 'horizontal',
      showValue: true,
      decimals: 0,
      color: '#4da6ff',
      background: '#222222',
      textColor: '#ffffff',
    },
    defaultSize: { width: 25, height: 6 },
  },
];

export function getOverlayWidget(id: string): OverlayWidgetDef | undefined {
  return OVERLAY_WIDGETS.find((widget) => widget.id === id);
}
