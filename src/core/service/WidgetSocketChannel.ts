import { IncomingMessage } from 'http';
import { Duplex } from 'stream';
import { WebSocket, WebSocketServer } from 'ws';
import OscSocketRouter, { OscUpgradeHandler } from './osc/OscSocketRouter';
import { WebService } from './WebService';

// A plain JSON push channel for a widget's own page - e.g. a module broadcasting live
// updates instead of making the widget poll a REST endpoint. Reuses OscSocketRouter's
// shared 'upgrade' dispatch (the same http.Server can only have one 'upgrade' listener
// attaching `ws` directly, which is why OSC's sockets already go through it) rather than
// osc-js's framing, since a widget page is plain JS with no OSC client of its own.
export default class WidgetSocketChannel implements OscUpgradeHandler {
  private server: WebSocketServer | undefined;

  constructor(private readonly path: string) {}

  // Safe to call as soon as the module registering the widget's routers runs: module
  // registration only happens after WebService.waitForInitialization() has resolved, so
  // WebService.getServer() is always valid by this point.
  open() {
    if (this.server) {
      return;
    }
    OscSocketRouter.attach(WebService.getServer());
    this.server = new WebSocketServer({ noServer: true });
    OscSocketRouter.register(this.path, this);
  }

  close() {
    OscSocketRouter.unregister(this.path);
    this.server?.close();
    this.server = undefined;
  }

  broadcast(data: unknown) {
    if (!this.server) {
      return;
    }
    const payload = JSON.stringify(data);
    for (const client of this.server.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  get clientCount() {
    return this.server?.clients.size ?? 0;
  }

  // Called by OscSocketRouter once a handshake for this path has passed auth.
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const server = this.server;
    if (!server) {
      socket.destroy();
      return;
    }
    server.handleUpgrade(req, socket, head, (client) => {
      server.emit('connection', client, req);
    });
  }
}
