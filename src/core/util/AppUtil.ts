import net from 'net';
import { spooderLog } from '../Logging';

let ipcSocket: net.Socket | null = null;

export function connectToIPC(pipeName: string) {
  ipcSocket = net.createConnection(`\\\\.\\pipe\\${pipeName}`, () => {
    spooderLog('Connected to Spooder App');

    // Send initial message
    sendToApp({ type: 'message', message: 'Application initialized' });
  });

  ipcSocket.on('data', (data) => {
    const message = data.toString();
    spooderLog('Received IPC message:', message);
    // Handle incoming IPC messages
  });

  ipcSocket.on('error', (err) => {
    spooderLog('IPC error:', err);
    ipcSocket = null;
  });
}

export function isIPCConnected(): boolean {
  return ipcSocket !== null && ipcSocket.writable;
}

export function sendToApp(data: any) {
  if (ipcSocket && ipcSocket.writable) {
    ipcSocket.write(JSON.stringify(data) + '\n');
  } else {
    // Fallback to stdout with IPC prefix
    console.log('IPC:' + JSON.stringify(data));
  }
}
