import OSC from 'osc-js';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';
import WebSocket, { WebSocketServer } from 'ws';
import ConfigService from '../ConfigService';
import ModuleService from '../ModuleService';
import MonitorService, { MonitorDataType, MonitorDirection } from '../MonitorService';
import PluginService from '../PluginService';
import { SpooderOSCMessageOptions } from 'src/Types';
import OSCService from '../OSCServiceNew';

interface WebSocketCollection {
  [key: string]: WebSocket;
}

export class CustomWebSocketPlugin extends OSC.Plugin {
  private httpServer: http.Server;
  private websocketServer: WebSocketServer;
  private mainClients = new Map<string, WebSocketCollection>();
  private pluginClients = new Map<string, WebSocketCollection>();

  constructor() {
    super();
    this.httpServer = http.createServer((req, res) => {
      res.writeHead(404);
      res.end();
    });

    // Initialize the WebSocket server with the HTTP server
    this.websocketServer = new WebSocketServer({
      server: this.httpServer, // Attach the WebSocket server to the HTTP server
    });
  }

  notify = (message: OSC.Message) => {};

  registerNotify(fn: (message: OSC.Message) => void) {
    this.notify = fn;
  }

  // Called when the plugin is started
  open() {
    const sconfig = ConfigService.getConfig();
    this.websocketServer.on('connection', (socket: WebSocket, request: http.IncomingMessage) => {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const type = url.searchParams.get('type');

      if (!type) {
        console.log('Type missing, closing connection');
        socket.close(1008, 'Type required');
        return;
      }

      const connectionId = uuidv4();

      if (type === 'plugin') {
        const pluginName = url.searchParams.get('plugin_name');
        if (!pluginName) {
          console.log('Plugin name missing, closing connection');
          socket.close(1008, 'Plugin name required');
          return;
        }
        const pluginClients = this.pluginClients.get(pluginName) || {};
        pluginClients[connectionId] = socket;
        this.pluginClients.set(pluginName, pluginClients);

        socket.on('message', (message: OSC.Message) => {
          this.notify(message);
          const address = message.address.split('/');
          if (address[1] == 'spooder') {
            if (address[2] == 'plugin') {
              if (address[3] == 'error') {
                const errorObj = JSON.parse(message.args[0] as string);
                MonitorService.addLog(
                  MonitorDataType.Plugin,
                  MonitorDirection.Receive,
                  errorObj.name,
                  errorObj.message,
                );
                return;
              }
            }
          }
          const activePlugins = PluginService.getActivePlugins();
          for (let p in activePlugins) {
            if (activePlugins[p].onOSC != null) {
              activePlugins[p].onOSC(message);
            }
          }

          if (message.address.endsWith('/connect')) {
            this.send(
              new OSC.Message(message.address.split('/')[1] + '/connect/success', 1.0).pack(),
              {
                type: 'plugin',
                pluginName: message.address.split('/')[1],
              },
            );
            return;
          }
        });

        socket.on('close', () => {
          const pluginClients = this.pluginClients.get(pluginName) || {};
          delete pluginClients[connectionId];
          this.pluginClients.set(pluginName, pluginClients);
        });
      } else if (type === 'main') {
        const interfaceName = url.searchParams.get('interface_name');
        if (!interfaceName) {
          console.log('Interface name missing, closing connection');
          socket.close(1008, 'Interface name required');
          return;
        }
        socket.on('message', (message: OSC.Message) => {
          this.notify(message);
          if (message.address === '/spooder/monitor/live_logging') {
            if (message.args[0] == 1) {
              MonitorService.enableLiveLogging();
            } else {
              MonitorService.disableLiveLogging();
            }
            return;
          }

          if (!message.address.startsWith('/spooder/monitor')) {
            MonitorService.addLog(
              MonitorDataType.TCP,
              MonitorDirection.Receive,
              message.address,
              message.args,
            );
          }
          const controlModules = ModuleService.getControlModules();
          for (const c in controlModules) {
            if (controlModules[c].onOSC != null) {
              controlModules[c].onOSC(message);
            }
          }
        });

        socket.on('close', () => {
          const mainClients = this.mainClients.get(interfaceName) || {};
          delete mainClients[connectionId];
          this.mainClients.set(interfaceName, mainClients);
        });
      } else {
        console.log('Unknown client type, closing connection');
        socket.close(1008, 'Unknown client type');
        return;
      }
    });
    this.httpServer.listen(sconfig.network.osc.osc_tcp_port, () => {
      console.log(`WebSocket server listening on port ${sconfig.network.osc.osc_tcp_port}`);
    });
  }

  // Called when the plugin is stopped
  stop() {
    if (this.websocketServer) {
      this.websocketServer.close();
      console.log('Custom WebSocket plugin stopped');
    }
  }

  // Send OSC messages through the WebSocket
  send(binary: Uint8Array, options: SpooderOSCMessageOptions) {
    if (options.type === 'main') {
      if (!options.interfaceName) {
        console.error('Interface name is required for main type');
        return;
      }
      const mainClients = this.mainClients.get(options.interfaceName);
      if (!mainClients) {
        console.error(`No clients connected for interface: ${options.interfaceName}`);
        return;
      }
      for (const clientId in mainClients) {
        const client = mainClients[clientId];
        if (client.readyState === WebSocket.OPEN) {
          client.send(binary, { binary: true });
        } else {
          console.warn(`Client ${clientId} is not open, skipping send`);
        }
      }
    } else if (options.type === 'plugin') {
      if (!options.pluginName) {
        console.error('Plugin name is required for plugin type');
        return;
      }
      const pluginClients = this.pluginClients.get(options.pluginName);
      if (!pluginClients) {
        console.error(`No clients connected for plugin: ${options.pluginName}`);
        return;
      }
      for (const clientId in pluginClients) {
        const client = pluginClients[clientId];
        if (client.readyState === WebSocket.OPEN) {
          client.send(binary, { binary: true });
        } else {
          console.warn(`Client ${clientId} is not open, skipping send`);
        }
      }
    }
  }
}
