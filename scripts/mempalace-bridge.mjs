#!/usr/bin/env node
/**
 * MemPalace MCP Bridge — exposes the mempalace-mcp stdio JSON-RPC server over HTTP.
 *
 * Browser apps can't spawn stdio subprocesses, so this bridge keeps a long-lived
 * mempalace-mcp child process alive and proxies HTTP requests to MCP tool calls.
 *
 * Local:  http://127.0.0.1:17333/health
 *         http://127.0.0.1:17333/mcp/search     (POST)
 *         http://127.0.0.1:17333/mcp/checkpoint  (POST)
 *         http://127.0.0.1:17333/mcp/status      (GET)
 *
 * Follows the cloud-key-proxy.mjs / sandbox-runner.mjs pattern.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.MEMPALACE_BRIDGE_PORT || 17333);
const HOST = process.env.MEMPALACE_BRIDGE_HOST || '0.0.0.0';

// --- MCP subprocess management ---

/** @type {import('child_process').ChildProcess | null} */
let mcpProc = null;
let mcpReady = false;
let mcpRestarting = false;

// JSON-RPC request queue (stdio is serial — one request at a time)
/** @type {Array<{method: string, params: any, resolve: (v:any)=>void, reject: (e:any)=>void}>} */
const rpcQueue = [];
let rpcProcessing = false;
let rpcBuffer = '';
let rpcNextId = 1;
/** @type {Map<number, {resolve: (v:any)=>void, reject: (e:any)=>void}>} */
const rpcPending = new Map();

function loadDotEnv() {
  for (const name of ['.env', '.env.local']) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] == null) process.env[key] = val;
    }
  }
}

loadDotEnv();

function findMcpBinary() {
  // Prefer explicit override
  if (process.env.MEMPALACE_MCP_BIN) return process.env.MEMPALACE_MCP_BIN;
  // Look in ~/.local/bin (uv tool install location)
  const home = process.env.HOME || '/Users';
  const candidates = [
    path.join(home, '.local/bin/mempalace-mcp'),
    '/usr/local/bin/mempalace-mcp',
    '/opt/homebrew/bin/mempalace-mcp',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function startMcpSubprocess() {
  if (mcpRestarting) return;
  mcpRestarting = true;

  const bin = findMcpBinary();
  if (!bin) {
    console.error('[mempalace-bridge] mempalace-mcp binary not found. Install with: uv tool install mempalace');
    mcpRestarting = false;
    return;
  }

  console.log(`[mempalace-bridge] Spawning ${bin}`);
  const env = { ...process.env };
  // Ensure PATH includes ~/.local/bin for the subprocess
  const localBin = path.join(process.env.HOME || '', '.local/bin');
  if (localBin && !env.PATH?.includes(localBin)) {
    env.PATH = `${localBin}:${env.PATH || ''}`;
  }

  mcpProc = spawn(bin, [], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  mcpProc.stdout?.on('data', (chunk) => {
    rpcBuffer += chunk.toString();
    let nl;
    while ((nl = rpcBuffer.indexOf('\n')) >= 0) {
      const line = rpcBuffer.slice(0, nl).trim();
      rpcBuffer = rpcBuffer.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        handleRpcMessage(msg);
      } catch {
        // Non-JSON line (e.g. progress output) — ignore
      }
    }
  });

  mcpProc.stderr?.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) console.error('[mempalace-mcp]', text);
  });

  mcpProc.on('exit', (code, signal) => {
    console.log(`[mempalace-bridge] mempalace-mcp exited (code=${code} signal=${signal})`);
    mcpReady = false;
    mcpProc = null;
    // Reject all pending RPC requests
    for (const [id, { reject }] of rpcPending) {
      reject(new Error('mempalace-mcp subprocess exited'));
    }
    rpcPending.clear();
    // Auto-restart after 2s
    setTimeout(() => {
      mcpRestarting = false;
      startMcpSubprocess();
    }, 2000);
  });

  // Send MCP initialize handshake
  sendRpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'mempalace-bridge', version: '1.0' },
  }).then((result) => {
    // Send initialized notification
    sendNotification('notifications/initialized', {});
    mcpReady = true;
    console.log('[mempalace-bridge] MCP handshake complete — palace ready');
    // Process any queued requests
    processRpcQueue();
  }).catch((err) => {
    console.error('[mempalace-bridge] MCP initialize failed:', err.message);
    mcpRestarting = false;
  });
}

function handleRpcMessage(msg) {
  if (msg.id === undefined || msg.id === null) {
    // Notification from server — ignore
    return;
  }
  const pending = rpcPending.get(msg.id);
  if (!pending) return;
  rpcPending.delete(msg.id);
  if (msg.error) {
    pending.reject(Object.assign(new Error(msg.error.message || 'RPC error'), { rpcError: msg.error }));
  } else {
    pending.resolve(msg.result);
  }
  // Process next queued request
  rpcProcessing = false;
  processRpcQueue();
}

function sendRpc(method, params) {
  return new Promise((resolve, reject) => {
    if (!mcpProc || !mcpProc.stdin) {
      reject(new Error('mempalace-mcp subprocess not running'));
      return;
    }
    const id = rpcNextId++;
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params, id }) + '\n';
    rpcPending.set(id, { resolve, reject });
    mcpProc.stdin.write(msg);
    // Timeout after 30s
    setTimeout(() => {
      if (rpcPending.has(id)) {
        rpcPending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }
    }, 30000);
  });
}

function sendNotification(method, params) {
  if (!mcpProc || !mcpProc.stdin) return;
  const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
  mcpProc.stdin.write(msg);
}

function callMcpTool(name, args) {
  return sendRpc('tools/call', { name, arguments: args || {} });
}

function processRpcQueue() {
  if (rpcProcessing || rpcQueue.length === 0 || !mcpReady) return;
  rpcProcessing = true;
  const { method, params, resolve, reject } = rpcQueue.shift();
  sendRpc(method, params).then(resolve).catch(reject).finally(() => {
    rpcProcessing = false;
    processRpcQueue();
  });
}

function enqueueRpc(method, params) {
  return new Promise((resolve, reject) => {
    rpcQueue.push({ method, params, resolve, reject });
    processRpcQueue();
  });
}

// --- HTTP server ---

function cors(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function callToolViaHttp(toolName, args, res) {
  if (!mcpReady) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'MemPalace MCP server not ready' }));
    return;
  }
  try {
    const result = await enqueueRpc('tools/call', { name: toolName, arguments: args });
    // MCP tool results have { content: [{type:'text', text:'...'}], isError? }
    let text = '';
    if (result?.content && Array.isArray(result.content)) {
      text = result.content.map((c) => c.text || '').join('\n');
    }
    let parsed = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Keep as text
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: !result?.isError, result: parsed }));
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err.message || 'tool call failed' }));
  }
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '*';
  cors(res, origin);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // Health check — no MCP dependency
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      service: 'mempalace-bridge',
      port: PORT,
      mcpReady,
      mcpPid: mcpProc?.pid || null,
    }));
    return;
  }

  // MCP tool routes
  if (pathname === '/mcp/status' && req.method === 'GET') {
    await callToolViaHttp('mempalace_status', {}, res);
    return;
  }

  if (pathname === '/mcp/wings' && req.method === 'GET') {
    await callToolViaHttp('mempalace_list_wings', {}, res);
    return;
  }

  if (pathname === '/mcp/search' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const args = JSON.parse(body.toString());
      if (!args.query) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Missing query' }));
        return;
      }
      await callToolViaHttp('mempalace_search', {
        query: args.query,
        limit: args.limit || 5,
        ...(args.wing ? { wing: args.wing } : {}),
        ...(args.room ? { room: args.room } : {}),
      }, res);
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }));
    }
    return;
  }

  if (pathname === '/mcp/checkpoint' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const args = JSON.parse(body.toString());
      if (!Array.isArray(args.items) || args.items.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Missing items array' }));
        return;
      }
      await callToolViaHttp('mempalace_checkpoint', {
        items: args.items,
        ...(args.diary ? { diary: args.diary } : {}),
        ...(args.dedup_threshold ? { dedup_threshold: args.dedup_threshold } : {}),
        ...(args.added_by ? { added_by: args.added_by } : {}),
      }, res);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }));
    }
    return;
  }

  if (pathname === '/mcp/add-drawer' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const args = JSON.parse(body.toString());
      if (!args.wing || !args.room || !args.content) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Missing wing, room, or content' }));
        return;
      }
      await callToolViaHttp('mempalace_add_drawer', {
        wing: args.wing,
        room: args.room,
        content: args.content,
        ...(args.source_file ? { source_file: args.source_file } : {}),
        ...(args.added_by ? { added_by: args.added_by } : {}),
      }, res);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }));
    }
    return;
  }

  if (pathname === '/mcp/diary-write' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const args = JSON.parse(body.toString());
      if (!args.agent_name || !args.entry) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Missing agent_name or entry' }));
        return;
      }
      await callToolViaHttp('mempalace_diary_write', {
        agent_name: args.agent_name,
        entry: args.entry,
        ...(args.topic ? { topic: args.topic } : {}),
      }, res);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }));
    }
    return;
  }

  if (pathname === '/mcp/diary-read' && req.method === 'GET') {
    const agentName = url.searchParams.get('agent_name');
    if (!agentName) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Missing agent_name query param' }));
      return;
    }
    const lastN = Number(url.searchParams.get('last_n')) || 10;
    await callToolViaHttp('mempalace_diary_read', {
      agent_name: agentName,
      last_n: lastN,
    }, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: `Unknown route: ${pathname}` }));
});

server.listen(PORT, HOST, () => {
  console.log(`MemPalace bridge http://${HOST}:${PORT}/{health,mcp/search,mcp/checkpoint,...}`);
  startMcpSubprocess();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[mempalace-bridge] Shutting down...');
  if (mcpProc) {
    mcpProc.kill('SIGTERM');
  }
  process.exit(0);
});
process.on('SIGTERM', () => {
  if (mcpProc) mcpProc.kill('SIGTERM');
  process.exit(0);
});
