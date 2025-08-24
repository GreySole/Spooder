import net from 'net';

export function websocketTest(host: string, port: number, timeout = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isAlive = false;
    socket.setTimeout(timeout);
    socket.once('connect', () => {
      isAlive = true;
      socket.destroy();
    });
    socket.once('timeout', () => {
      socket.destroy();
    });
    socket.once('error', () => {
      socket.destroy();
    });
    socket.once('close', () => {
      resolve(isAlive);
    });
    socket.connect(port, host);
  });
}
