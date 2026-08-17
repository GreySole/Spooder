import { IncomingMessage } from 'http';
import { Duplex } from 'stream';
import { WebSocket, WebSocketServer } from 'ws';
import OscSocketRouter from './OscSocketRouter';

const STATUS = {
  IS_NOT_INITIALIZED: -1,
  IS_CONNECTING: 0,
  IS_OPEN: 1,
  IS_CLOSING: 2,
  IS_CLOSED: 3,
};

// osc-js plugin serving one websocket path off the shared http server.
//
// Stands in for OSC.WebsocketServerPlugin, which can only attach itself to the http server
// directly ({ server, path }) - and two of those on one server abort each other's upgrades.
// This runs `ws` in noServer mode and takes handshakes from OscSocketRouter instead, so any
// number of OSC sockets can coexist on the same port, each with its own set of clients.
export default class OscWebsocketPlugin {
  private socket: WebSocketServer | undefined;
  private socketStatus: number = STATUS.IS_NOT_INITIALIZED;
  private notify: (...args: any[]) => void = () => {};

  constructor(private readonly path: string) {}

  registerNotify(fn: (...args: any[]) => void) {
    this.notify = fn;
  }

  status() {
    return this.socketStatus;
  }

  open() {
    if (this.socket) {
      this.close();
    }
    const socket = new WebSocketServer({ noServer: true });
    this.socket = socket;
    socket.on('connection', (client: WebSocket) => {
      client.on('message', (message: Buffer) => {
        this.notify(new Uint8Array(message), {
          address: this.path,
          family: 'wsserver',
          port: 0,
          size: message.length,
        });
      });
    });
    socket.on('error', (error: Error) => {
      this.notify('error', error);
    });
    OscSocketRouter.register(this.path, this);
    this.socketStatus = STATUS.IS_OPEN;
    this.notify('open');
  }

  close() {
    OscSocketRouter.unregister(this.path);
    this.socketStatus = STATUS.IS_CLOSING;
    this.socket?.close(() => {
      this.socketStatus = STATUS.IS_CLOSED;
      this.notify('close');
    });
    this.socket = undefined;
  }

  send(binary: Uint8Array) {
    this.socket?.clients.forEach((client) => {
      client.send(binary, { binary: true });
    });
  }

  // Called by OscSocketRouter once a handshake for this path has passed auth.
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const server = this.socket;
    if (!server) {
      socket.destroy();
      return;
    }
    server.handleUpgrade(req, socket, head, (client) => {
      server.emit('connection', client, req);
    });
  }

  // Number of webui clients currently listening on this path.
  get clientCount() {
    return this.socket?.clients.size ?? 0;
  }
}
