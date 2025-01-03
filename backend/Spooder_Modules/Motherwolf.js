const http = require('http');
const ws = require('ws');

class MotherwolfTunnel {
    constructor() {}

    isRunning = false;

    stopTunnels() {
        clearInterval(this.interval);
        this.socket.close();
        this.oscReceiver.close();
        this.oscSender.close();
        this.isRunning = false;
    }

    startTunnels(subdomain, token, host, host_port, osc_tcp_port) {
        this.socket = new ws(`wss://${subdomain}.spooder.me?token=${token}`);
        this.oscReceiver = new ws(`wss://${subdomain}.spooder.me/osc?token=${token}`);
        this.oscSender = new ws(`ws://localhost:${osc_tcp_port}`);
        this.interval = setInterval(() => {
            if (this.socket.readyState === ws.OPEN) {
                this.socket.ping();
            }
            if (this.oscReceiver.readyState === ws.OPEN) {
                this.oscReceiver.ping();
            }

            if (this.oscSender.readyState === ws.OPEN) {
                this.oscSender.ping();
            }
        }, 30000); // Send a ping every 30 seconds

        this.socket.on('open', () => {
            console.log('HTTP Socket Connected');
        });

        this.oscReceiver.on('open', () => {
            console.log('OSC Cloud Socket Connected');
        });

        this.oscSender.on('open', () => {
            console.log('OSC Local Socket Connected');
        });

        this.socket.on('pong', () => {
            //console.log('Received pong from client');
        });

        this.socket.on('message', async(data) => {
            if (!data.toString().startsWith("{")) {
                console.log('Received:', data.toString());
                return;
            }
            const message = JSON.parse(data.toString());
            const path = message.url.substring(message.url.indexOf("/"));

            const proxyReq = http.request({
                hostname: host,
                port: host_port,
                path: path,
                method: message.method,
                headers: message.headers,
            }, (proxyRes) => {
                let body = []
                proxyRes.on('data', (chunk) => {
                    body.push(chunk);
                });
                proxyRes.on('end', () => {
                    const isMedia = proxyRes.headers['content-type']?.startsWith('image') || proxyRes.headers['content-type']?.startsWith('video');
                    const responseBody = isMedia ? Buffer.concat(body) : Buffer.concat(body).toString();

                    this.socket.send(JSON.stringify({
                        id: message.id,
                        subdomain: message.subdomain,
                        status: proxyRes.statusCode,
                        headers: proxyRes.headers,
                        body: responseBody
                    }));
                });
            });

            proxyReq.on('error', (error) => {
                console.error('Error:', error);
            });

            if (message.body) {
                const requestBody = typeof message.body === 'object' ? JSON.stringify(message.body) : message.body;
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
            if(this.oscSender.readyState === ws.OPEN){
                this.oscSender.send(data);
            }
        });

        this.oscSender.on('message', (data) => {
            //console.log('Received:', data.toString());
            if(this.oscReceiver.readyState === ws.OPEN){
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
        });

        this.oscReceiver.on('error', (error) => {
            console.error('Error:', error);
        });

        this.oscSender.on('error', (error) => {
            console.error('Error:', error);
        });

        this.isRunning = true;
    }
}

module.exports = new MotherwolfTunnel();