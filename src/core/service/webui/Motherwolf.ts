import http from 'http';
import WebSocket from 'ws';
import { webLog } from '../../Logging';
import ConfigService from '../ConfigService';
import ModuleService from '../ModuleService';
import { WebService } from '../WebService';

const BASE_RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 60000;
const MAX_RECONNECT_ATTEMPTS = 10;

export default class MotherwolfTunnel {
  private socket!: WebSocket;
  private oscReceiver!: WebSocket;
  private oscSender!: WebSocket;
  private interval!: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
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
  private reconnectAttempts: number = 0;
  private isReconnecting: boolean = false;

  constructor() {}

  private safeClose(ws: WebSocket | undefined) {
    if (!ws) return;
    ws.removeAllListeners();
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  }

  stopTunnels() {
    clearInterval(this.interval);
    clearTimeout(this.reconnectTimer);
    this.safeClose(this.socket);
    this.safeClose(this.oscReceiver);
    this.safeClose(this.oscSender);
    this.isRunning = false;
    this.isReady = false;
    this.isHTTPConnected = false;
    this.isOSCReceiverConnected = false;
    this.isOSCSenderConnected = false;
    this.isReconnecting = false;
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
    this.reconnectAttempts = 0;
    this.isReconnecting = false;

    this.connectSockets();
    this.interval = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.ping();
      }
      if (this.oscReceiver?.readyState === WebSocket.OPEN) {
        this.oscReceiver.ping();
      }
      if (this.oscSender?.readyState === WebSocket.OPEN) {
        this.oscSender.ping();
      }
    }, 30000); // Send a ping every 30 seconds

    this.isRunning = true;
  }

  connectSockets() {
    this.safeClose(this.socket);
    this.safeClose(this.oscReceiver);
    this.safeClose(this.oscSender);

    this.isReady = false;
    this.isHTTPConnected = false;
    this.isOSCReceiverConnected = false;
    this.isOSCSenderConnected = false;
    this.isReconnecting = false;

    this.socket = new WebSocket(`wss://${this.subdomain}.spooder.me?token=${this.token}`);
    this.oscReceiver = new WebSocket(`wss://${this.subdomain}.spooder.me/osc?token=${this.token}`);
    this.oscSender = new WebSocket(`ws://localhost:${this.host_port}/osc`);
    webLog('Connecting to Motherwolf Tunnels...', this.subdomain, this.token);

    const checkIfReady = () => {
      if (this.isHTTPConnected && this.isOSCReceiverConnected && this.isOSCSenderConnected) {
        this.isReady = true;
        this.reconnectAttempts = 0;
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
      //console.log('Received pong from HTTP socket');
    });

    this.oscReceiver.on('pong', () => {
      //console.log('Received pong from OSC Cloud socket');
    });

    this.oscSender.on('pong', () => {
      //console.log('Received pong from OSC Local socket');
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
      this.isHTTPConnected = false;
      this.isReady = false;
      this.reconnect();
    });

    this.oscReceiver.on('close', () => {
      console.log('OSC Cloud Socket Disconnected');
      this.isOSCReceiverConnected = false;
      this.isReady = false;
      this.reconnect();
    });

    this.oscSender.on('close', () => {
      console.log('OSC Local Socket Disconnected');
      this.isOSCSenderConnected = false;
      this.isReady = false;
      this.reconnect();
    });

    this.socket.on('error', (error) => {
      console.error('HTTP Socket Error:', error);
    });

    this.oscReceiver.on('error', (error) => {
      console.error('OSC Cloud Socket Error:', error);
    });

    this.oscSender.on('error', (error) => {
      console.error('OSC Local Socket Error:', error);
    });
  }

  reconnect() {
    if (!this.isRunning || this.isReconnecting) {
      return;
    }
    this.isReconnecting = true;
    this.reconnectAttempts++;
    if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      console.log('Maximum reconnect attempts reached. Stopping reconnection attempts.');
      this.stopTunnels();
      return;
    }
    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY,
    );
    console.log(
      `Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.connectSockets();
    }, delay);
  }
}
