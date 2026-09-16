/** Shared in-process event bus for sandbox-runner + sandbox-live */
const sseClients = new Set();
const ring = [];
const MAX = 300;

export function subscribeSse(res) {
  sseClients.add(res);
  return () => sseClients.delete(res);
}

export function recentEvents(n = 40) {
  return ring.slice(-n);
}

export function broadcastSandboxEvent(evt) {
  const event = { ts: new Date().toISOString(), t: Date.now(), ...evt };
  ring.push(event);
  if (ring.length > MAX) ring.splice(0, ring.length - MAX);
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of [...sseClients]) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}
