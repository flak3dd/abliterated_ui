/**
 * Interactive PTY sessions over WebSocket for sandbox-runner.
 * Requires optional deps: ws, node-pty (native). Degrades gracefully if missing.
 */
import { WebSocketServer } from 'ws';
import { broadcastSandboxEvent } from './sandbox-events.mjs';

let pty = null;
try {
  const mod = await import('node-pty');
  pty = mod.default || mod;
} catch {
  console.warn('[pty] node-pty not installed — PTY endpoints disabled');
}

/** @type {Map<string, { term: any, clients: Set<any>, envId: string, cmd: string }>} */
const sessions = new Map();

export function ptyAvailable() {
  return Boolean(pty);
}

export function listPtySessions() {
  return [...sessions.entries()].map(([id, s]) => ({
    id,
    envId: s.envId,
    cmd: s.cmd,
    clients: s.clients.size,
  }));
}

export function attachPtyServer(httpServer) {
  if (!pty) return null;
  const wss = new WebSocketServer({ server: httpServer, path: '/api/sandbox/pty' });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const sessionId = url.searchParams.get('id') || `pty_${Date.now()}`;
    const envId = (url.searchParams.get('envId') || 'default').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const cols = Number(url.searchParams.get('cols') || 100);
    const rows = Number(url.searchParams.get('rows') || 30);
    const cwd = url.searchParams.get('cwd') || `/tmp/spark-sandboxes/${envId}`;
    const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash';

    let entry = sessions.get(sessionId);
    if (!entry) {
      const term = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols,
        rows,
        cwd,
        env: process.env,
      });
      entry = { term, clients: new Set(), envId, cmd: shell };
      sessions.set(sessionId, entry);
      broadcastSandboxEvent({ type: 'pty-start', sessionId, envId });
      term.onData((data) => {
        const payload = JSON.stringify({ type: 'out', data });
        for (const c of entry.clients) {
          try {
            c.send(payload);
          } catch {
            entry.clients.delete(c);
          }
        }
      });
      term.onExit(({ exitCode }) => {
        const payload = JSON.stringify({ type: 'exit', exitCode });
        for (const c of entry.clients) {
          try {
            c.send(payload);
          } catch {}
        }
        sessions.delete(sessionId);
        broadcastSandboxEvent({ type: 'pty-exit', sessionId, exitCode });
      });
    }

    entry.clients.add(ws);
    ws.send(JSON.stringify({ type: 'ready', sessionId, envId }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'in' && typeof msg.data === 'string') {
          entry.term.write(msg.data);
        } else if (msg.type === 'resize') {
          entry.term.resize(Number(msg.cols) || 80, Number(msg.rows) || 24);
        }
      } catch {
        entry.term.write(String(raw));
      }
    });
    ws.on('close', () => {
      entry.clients.delete(ws);
      if (entry.clients.size === 0) {
        try {
          entry.term.kill();
        } catch {}
        sessions.delete(sessionId);
      }
    });
  });
  console.log('[pty] WebSocket PTY at /api/sandbox/pty');
  return wss;
}

export async function runPtyCommandOnce({ cwd, cmd, timeoutMs = 120000 }) {
  if (!pty) return { ok: false, error: 'node-pty not installed. npm i node-pty ws' };
  return new Promise((resolve) => {
    let out = '';
    const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';
    const term = pty.spawn(shell, ['-lc', cmd], {
      name: 'xterm-color',
      cols: 120,
      rows: 40,
      cwd,
      env: process.env,
    });
    const timer = setTimeout(() => {
      try {
        term.kill();
      } catch {}
      resolve({ ok: false, stdout: out, error: 'pty timeout', exitCode: -1 });
    }, timeoutMs);
    term.onData((d) => {
      out += d;
      if (out.length > 200000) out = out.slice(-150000);
    });
    term.onExit(({ exitCode }) => {
      clearTimeout(timer);
      resolve({ ok: exitCode === 0, stdout: out, exitCode });
    });
  });
}
