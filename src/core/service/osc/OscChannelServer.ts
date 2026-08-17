import OSC from '@spooder/osc-js';
import { oscLog } from '../../Logging';
import MonitorService, { MonitorDataType, MonitorDirection } from '../MonitorService';
import OscWebsocketPlugin from './OscWebsocketPlugin';

// A module's private OSC websocket, served at /osc/<tag> alongside the shared /osc socket.
//
// Modules whose traffic is too heavy for the shared bus (OBS streams volume meters at frame
// rate) declare a channel, and only the webui pages that opt into that tag - the OBS deck
// mounting an OscProvider with tag='obs' - ever receive it. Nothing crosses between sockets:
// a client on /osc never sees this channel's messages and vice versa.
export default class OscChannelServer {
  private osc: OSC;
  private plugin: OscWebsocketPlugin;

  constructor(
    public readonly tag: string,
    onMessage: (message: OSC.Message) => void,
  ) {
    this.plugin = new OscWebsocketPlugin(`/osc/${tag}`);
    this.osc = new OSC({ plugin: this.plugin as any });

    this.osc.on('open', () => {
      oscLog(`OSC channel open: /osc/${tag}`);
    });
    this.osc.on('error', (e: any) => {
      oscLog(`OSC channel error (/osc/${tag}): `, e);
    });
    this.osc.on('*', (message: OSC.Message) => {
      MonitorService.addLog(
        MonitorDataType.TCP,
        MonitorDirection.Receive,
        message.address,
        message.args,
      );
      onMessage(message);
    });

    this.osc.open();
  }

  // `log` defaults to true; high-rate traffic (volume meters) passes false to stay out of the
  // monitor, exactly as it did when these messages went out over the shared socket.
  send = (address: string, oscValue: any, log?: boolean) => {
    if (log == null) {
      log = true;
    }
    if (typeof oscValue == 'object' && !Array.isArray(oscValue)) {
      oscValue = JSON.stringify(oscValue);
    }
    const message =
      oscValue instanceof Array
        ? new OSC.Message(address, ...oscValue)
        : new OSC.Message(address, oscValue);

    this.osc.send(message);

    if (log == true) {
      MonitorService.addLog(MonitorDataType.TCP, MonitorDirection.Send, address, oscValue);
    }
  };

  // Whether any webui page is currently listening on this channel. Lets a module skip work
  // nobody is watching - the meter subscription is only worth holding open for a live deck.
  get hasClients() {
    return this.plugin.clientCount > 0;
  }
}
