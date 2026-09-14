#!/usr/bin/env node
/**
 * Spark Port 8000 Forwarder & Resilient Mesh Tunnel
 * Forwards local http://127.0.0.1:8000 to active NVIDIA DGX Spark vLLM server.
 * Automatically tests candidate IPs (192.168.4.103, 100.94.45.77, 192.168.4.101)
 * and failovers seamlessly.
 */
import net from 'node:net';
import http from 'node:http';

const LOCAL_PORT = 8000;
const CANDIDATES = [
  process.env.SPARK_HOST,
  '192.168.4.103',
  '100.94.45.77',
  '192.168.4.101',
].filter(Boolean);

let activeHost = CANDIDATES[0] || '192.168.4.103';

async function probeHost(host) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    try {
      const req = http.get({
        hostname: host,
        port: 8000,
        path: '/v1/models',
        timeout: 2500,
      }, (res) => {
        resolve({ ok: res.statusCode === 200, ms: Date.now() - t0 });
      });
      req.on('error', () => resolve({ ok: false, ms: Date.now() - t0 }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, ms: 2500 }); });
    } catch {
      resolve({ ok: false, ms: 0 });
    }
  });
}

async function refreshActiveHost() {
  for (const host of CANDIDATES) {
    const res = await probeHost(host);
    if (res.ok) {
      if (activeHost !== host) {
        console.log(`[tunnel] Active Spark target locked to: ${host}:8000 (${res.ms}ms)`);
        activeHost = host;
      }
      return host;
    }
  }
  return activeHost;
}

await refreshActiveHost();
setInterval(refreshActiveHost, 15000).unref();

const server = net.createServer({ noDelay: true }, (clientSocket) => {
  const targetHost = activeHost;
  const remoteSocket = net.connect({ host: targetHost, port: 8000, noDelay: true });

  clientSocket.pipe(remoteSocket);
  remoteSocket.pipe(clientSocket);

  clientSocket.on('error', (err) => {
    remoteSocket.destroy();
  });

  remoteSocket.on('error', async (err) => {
    clientSocket.destroy();
    void refreshActiveHost();
  });

  clientSocket.on('close', () => remoteSocket.destroy());
  remoteSocket.on('close', () => clientSocket.destroy());
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[tunnel] Port ${LOCAL_PORT} already in use. Forwarder or native service active.`);
    process.exit(0);
  }
  console.error('[tunnel] Server error:', err);
});

server.listen(LOCAL_PORT, '127.0.0.1', () => {
  console.log(`\n======================================================`);
  console.log(`⚡ Spark Port 8000 Forwarder Active`);
  console.log(`📡 Local Tunnel: http://127.0.0.1:${LOCAL_PORT}/v1`);
  console.log(`🎯 Active Spark Target: http://${activeHost}:8000/v1`);
  console.log(`======================================================\n`);
});
