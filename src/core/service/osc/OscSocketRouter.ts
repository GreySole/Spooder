import { Request } from 'express';
import { IncomingMessage, Server } from 'http';
import { Duplex } from 'stream';
import { validateUser } from '../../routes/ModerationRoutes';
import { isLocal } from '../WebService';

export interface OscUpgradeHandler {
  handleUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
}

// Single owner of the http server's 'upgrade' event, dispatching by path so several OSC
// websocket servers can share one port.
//
// This has to be centralised: `ws` attached with { server, path } aborts any upgrade whose
// path it doesn't recognise, so two such servers on one http server kill each other's
// handshakes. Every OSC socket therefore runs in noServer mode and gets its upgrades here.
export default class OscSocketRouter {
  private static routes = new Map<string, OscUpgradeHandler>();
  private static attachedServer: Server | undefined;

  static attach(server: Server) {
    if (OscSocketRouter.attachedServer === server) {
      return;
    }
    OscSocketRouter.attachedServer = server;
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const pathname = (req.url ?? '').split('?')[0];
      const handler = OscSocketRouter.routes.get(pathname);
      if (!handler) {
        // Not an OSC path - leave it for anything else listening for upgrades.
        return;
      }
      if (!OscSocketRouter.isAuthorized(req)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      handler.handleUpgrade(req, socket, head);
    });
  }

  static register(path: string, handler: OscUpgradeHandler) {
    OscSocketRouter.routes.set(path, handler);
  }

  static unregister(path: string) {
    OscSocketRouter.routes.delete(path);
  }

  // Same rule the websocket plugin's verifyClient used before: anything on the LAN is fine,
  // anyone from outside has to carry a valid session.
  private static isAuthorized(req: IncomingMessage) {
    const request = req as unknown as Request;
    if (isLocal(request)) {
      return true;
    }
    return validateUser(request) === 'ok';
  }
}
