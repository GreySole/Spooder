import net from 'net';
import os from 'os';
import path from 'path';
import { spooderLog } from '../Logging';

let ipcSocket: net.Socket | null = null;

/**
 * Where the manager app listens. Windows names a pipe; everywhere else it is a Unix domain
 * socket, and a name containing a separator is taken as a path so the manager can put its
 * socket wherever it likes.
 *
 * This used to build the Windows path unconditionally, which meant Linux always failed with
 * ENOENT, fell back to writing IPC messages on stdout, and reported itself as not connected -
 * so anything asking "can the app restart me?" was told no on the platform most Spooders run on.
 */
function ipcEndpoint(pipeName: string): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\${pipeName}`;
  }
  return pipeName.includes('/') ? pipeName : path.join(os.tmpdir(), `${pipeName}.sock`);
}

export function connectToIPC(pipeName: string) {
  ipcSocket = net.createConnection(ipcEndpoint(pipeName), () => {
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

export type RestartCapability = 'app' | 'supervisor' | 'manual';

/**
 * How - or whether - Spooder can bring itself back. Anything that has to restart needs to say
 * which of these it is up front, because the difference to the person watching is between a
 * page that reconnects on its own and an app that just closed.
 */
export function getRestartCapability(): RestartCapability {
  if (isIPCConnected()) {
    return 'app';
  }
  // PM2 sets these for every process it runs, and restarts one that exits. Same for anything
  // else declaring itself a supervisor, which is the escape hatch for systemd and Docker.
  if (process.env.pm_id !== undefined || process.env.SPOODER_SUPERVISED === '1') {
    return 'supervisor';
  }
  return 'manual';
}

/**
 * Asks for a restart by whatever route exists, and reports which one was used. Returns false
 * when nothing can restart Spooder, so the caller can say so rather than leaving a spinner
 * waiting on something that is never coming back.
 */
export function requestRestart(reason: string): { restarting: boolean; via: RestartCapability } {
  const via = getRestartCapability();
  if (via === 'app') {
    sendToApp({ action: 'restart', reason });
    return { restarting: true, via };
  }
  if (via === 'supervisor') {
    spooderLog(`Restarting to ${reason}. The supervisor will bring Spooder back.`);
    // Deferred so the response reaches the browser before the process goes away.
    setTimeout(() => process.exit(0), 500);
    return { restarting: true, via };
  }
  spooderLog(`Spooder needs to be restarted to ${reason}.`);
  return { restarting: false, via };
}

export function sendToApp(data: any) {
  if (ipcSocket && ipcSocket.writable) {
    ipcSocket.write(JSON.stringify(data) + '\n');
  } else {
    // Fallback to stdout with IPC prefix
    console.log('IPC:' + JSON.stringify(data));
  }
}

// How many long-running operations are in flight, so the manager app's busy icon reflects
// whether *anything* is running rather than whichever one last finished. Without this, a
// module install finishing while a plugin install is still going would send loading_stop
// and hide the icon out from under the still-running plugin install.
let loadingCount = 0;

export function beginLoading() {
  loadingCount++;
  if (loadingCount === 1) {
    sendToApp('loading_start');
  }
}

export function endLoading() {
  loadingCount = Math.max(0, loadingCount - 1);
  if (loadingCount === 0) {
    sendToApp('loading_stop');
  }
}

/**
 * Runs `fn` with the manager app's busy icon showing for its duration. Safe to nest - an
 * operation that calls another wrapped operation internally (e.g. restoring plugins calls
 * installPluginDependencies) only triggers one loading_start/loading_stop pair overall.
 */
export async function withLoading<T>(fn: () => Promise<T>): Promise<T> {
  beginLoading();
  try {
    return await fn();
  } finally {
    endLoading();
  }
}
