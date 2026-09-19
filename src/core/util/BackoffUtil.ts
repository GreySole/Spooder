// Exponential delay for the reconnect loops: 2s, 4s, 8s ... capped at a minute, so a long
// outage is polled about once a minute rather than hammering the service or giving up.
export function backoffDelay(attempt: number, baseMs = 2000, maxMs = 60000): number {
  return Math.min(maxMs, baseMs * 2 ** attempt);
}
