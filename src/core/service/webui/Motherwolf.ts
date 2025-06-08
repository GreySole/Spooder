import WebSocket from 'ws';
import http from 'http';
import ConfigService from '../ConfigService';
import { WebService } from '../WebService';
import ModuleService from '../ModuleService';
import { webLog } from 'src/core/Logging';

export default class MotherwolfTunnel {
  private socket!: WebSocket;
  private oscReceiver!: WebSocket;
  private oscSender!: WebSocket;
  private interval!: NodeJS.Timeout;
  private subdomain!: string;
  private token!: string;
  private host!: string;
  private host_port!: number;
  private osc_tcp_port!: number;
  public isRunning: boolean = false;
  public isReady: boolean = false;
  private isHTTPConnected: boolean = false;
  private isOSCReceiverConnected: boolean = false;
  private isOSCSenderConnected: boolean = false;

  constructor() {}

  stopTunnels() {
    clearInterval(this.interval);
    this.socket.close();
    this.oscReceiver.close();
    this.oscSender.close();
    this.isRunning = false;
    this.isReady = false;
    this.isHTTPConnected = false;
    this.isOSCReceiverConnected = false;
    this.isOSCSenderConnected = false;
    webLog('Motherwolf Tunnels Stopped');
  }

  startTunnels() {
    const config = ConfigService.getConfig();
    const mwSubdomain = config.network.motherwolf.subdomain;
    const mwToken = config.network.motherwolf.token;
    const hostPort = config.network.host_port;
    const tcpPort = config.network.osc.osc_tcp_port;
    this.subdomain = mwSubdomain;
    this.token = mwToken;
    this.host = 'localhost';
    this.host_port = hostPort;
    this.osc_tcp_port = tcpPort;

    this.connectSockets();

    this.interval = setInterval(() => {
      if (this.socket.readyState === WebSocket.OPEN) {
        this.socket.ping();
      } else {
        this.reconnect();
        return;
      }
      if (this.oscReceiver.readyState === WebSocket.OPEN) {
        this.oscReceiver.ping();
      } else {
        this.reconnect();
        return;
      }

      if (this.oscSender.readyState === WebSocket.OPEN) {
        this.oscSender.ping();
      } else {
        this.reconnect();
        return;
      }
    }, 30000); // Send a ping every 30 seconds

    this.isRunning = true;
  }

  connectSockets() {
    if (this.socket && this.oscSender.readyState === WebSocket.OPEN) {
      this.socket.close();
      this.isHTTPConnected = false;
    }
    if (this.oscReceiver && this.oscSender.readyState === WebSocket.OPEN) {
      this.oscReceiver.close();
      this.isOSCReceiverConnected = false;
    }
    if (this.oscSender && this.oscSender.readyState === WebSocket.OPEN) {
      this.oscSender.close();
      this.isOSCSenderConnected = false;
    }

    this.isReady = false;
    this.socket = new WebSocket(`wss://${this.subdomain}.spooder.me?token=${this.token}`);
    this.oscReceiver = new WebSocket(`wss://${this.subdomain}.spooder.me/osc?token=${this.token}`);
    this.oscSender = new WebSocket(`ws://localhost:${this.osc_tcp_port}/osc`);
    webLog('Connecting to Motherwolf Tunnels...', this.subdomain, this.token);

    const checkIfReady = () => {
      if (this.isHTTPConnected && this.isOSCReceiverConnected && this.isOSCSenderConnected) {
        this.isReady = true;
        WebService.setPublicHTTPUrl(`https://${this.subdomain}.spooder.me`);
        WebService.setPublicOSCUrl(`${this.subdomain}.spooder.me/osc`);
        ModuleService.onExternalNetworkChanged();
        webLog('Motherwolf Tunnels Ready');
      }
    };

    this.socket.on('open', () => {
      console.log('HTTP Socket Connected');
      this.isHTTPConnected = true;
      checkIfReady();
    });

    this.oscReceiver.on('open', () => {
      console.log('OSC Cloud Socket Connected');
      this.isOSCReceiverConnected = true;
      checkIfReady();
    });

    this.oscSender.on('open', () => {
      console.log('OSC Local Socket Connected');
      this.isOSCSenderConnected = true;
      checkIfReady();
    });

    this.socket.on('pong', () => {
      //console.log('Received pong from client');
    });

    this.socket.on('message', async (data) => {
      if (!data.toString().startsWith('{')) {
        console.log('Received:', data.toString());
        return;
      }
      const message = JSON.parse(data.toString());
      const path = message.url.substring(message.url.indexOf('/'));

      const proxyReq = http.request(
        {
          hostname: this.host,
          port: this.host_port,
          path: path,
          method: message.method,
          headers: message.headers,
        },
        (proxyRes) => {
          const body = [] as Buffer[];
          proxyRes.on('data', (chunk) => {
            body.push(chunk);
          });
          proxyRes.on('end', () => {
            const isMedia =
              proxyRes.headers['content-type']?.startsWith('image') ||
              proxyRes.headers['content-type']?.startsWith('video');
            const responseBody = isMedia ? Buffer.concat(body) : Buffer.concat(body).toString();

            this.socket.send(
              JSON.stringify({
                id: message.id,
                subdomain: message.subdomain,
                status: proxyRes.statusCode,
                headers: proxyRes.headers,
                body: responseBody,
              }),
            );
          });
        },
      );

      proxyReq.on('error', (error) => {
        console.error('Error:', error);
      });

      if (message.body) {
        const requestBody =
          typeof message.body === 'object' ? JSON.stringify(message.body) : message.body;
        if (typeof requestBody === 'string') {
          if (message.headers['content-type']) {
            proxyReq.setHeader('Content-Type', message.headers['content-type']);
          }
          proxyReq.setHeader('Content-Length', Buffer.byteLength(requestBody));
        }
        proxyReq.write(requestBody);
      }
      proxyReq.end();
    });

    this.oscReceiver.on('message', (data) => {
      //console.log('Sending:', data.toString());
      if (this.oscSender.readyState === WebSocket.OPEN) {
        this.oscSender.send(data);
      }
    });

    this.oscSender.on('message', (data) => {
      //console.log('Received:', data.toString());
      if (this.oscReceiver.readyState === WebSocket.OPEN) {
        this.oscReceiver.send(data);
      }
    });

    this.socket.on('close', () => {
      console.log('HTTP Socket Disconnected');
    });

    this.oscReceiver.on('close', () => {
      console.log('OSC Cloud Socket Disconnected');
    });

    this.oscSender.on('close', () => {
      console.log('OSC Local Socket Disconnected');
    });

    this.socket.on('error', (error) => {
      console.error('Error:', error);
      this.reconnect();
    });

    this.oscReceiver.on('error', (error) => {
      console.error('Error:', error);
      this.reconnect();
    });

    this.oscSender.on('error', (error) => {
      console.error('Error:', error);
      this.reconnect();
    });
  }

  reconnect() {
    if (this.isRunning) {
      console.log('Attempting to reconnect...');
      setTimeout(() => {
        this.connectSockets();
      }, 5000); // Attempt to reconnect after 5 seconds
    }
  }
}
