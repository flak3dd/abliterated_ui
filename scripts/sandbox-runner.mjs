#!/usr/bin/env node
/**
 * ==============================================================================
 * SOVEREIGN SPARK EPHEMERAL SANDBOX RUNNER (:17330 / :17325 Bridge)
 * ==============================================================================
 * Manages isolated directory sandboxes on local Mac host (/tmp/spark-sandboxes)
 * and remote DGX Spark (192.168.4.103) for building, running tests, and executing
 * code snippets generated in the Sovereign Spark chat interface.
 * ==============================================================================
 */

import http from 'node:http';
import { mkdir, writeFile, rm, appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execP = promisify(exec);
const execFileP = promisify(execFile);

async function mapLimit(items, limit, fn) {
  const ret = new Array(items.length);
  let i = 0;
  const n = Math.max(1, Math.min(limit, items.length || 1));
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      ret[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, Math.max(items.length, 1)) }, worker));
  return ret;
}

const PORT = Number(process.env.SANDBOX_PORT || 17330);
const HOST = process.env.SANDBOX_HOST || '127.0.0.1';
const SANDBOX_BASE_LOCAL = '/tmp/spark-sandboxes';
const SANDBOX_BASE_REMOTE = '/tmp/spark-sandboxes';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE_DEBUG_LOG = path.join(REPO_ROOT, 'logs', 'image-gen-debug.jsonl');
const imageDebugRing = [];
const IMAGE_DEBUG_RING_MAX = 400;

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

function isPrivateHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true; // Tailscale CGNAT
  return false;
}

function allowedOrigin(req) {
  const origin = String(req?.headers?.origin || '');
  try {
    const u = new URL(origin);
    if (isPrivateHost(u.hostname)) return origin;
  } catch {
    /* ignore */
  }
  return 'http://127.0.0.1';
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': res._aco || 'http://127.0.0.1',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  });
  res.end(JSON.stringify(data));
}

function safeJoin(root, rel) {
  const clean = String(rel || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (!clean || clean.includes('\0') || clean.split('/').includes('..')) {
    throw new Error('Invalid sandbox path');
  }
  const rootAbs = path.resolve(root);
  const abs = path.resolve(rootAbs, clean);
  const prefix = rootAbs.endsWith(path.sep) ? rootAbs : rootAbs + path.sep;
  if (abs !== rootAbs && !abs.startsWith(prefix)) {
    throw new Error('Path escapes sandbox');
  }
  return abs;
}

async function sshRemote(script, timeout = 30000) {
  const b64 = Buffer.from(String(script), 'utf8').toString('base64');
  return execFileP('ssh', ['flak3dd', `echo ${b64} | base64 -d | bash`], {
    timeout,
    maxBuffer: 10 * 1024 * 1024,
  });
}

async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString('utf8');
      if (raw.length > 20 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(new Error(`Malformed JSON: ${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res._aco = allowedOrigin(req);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': res._aco,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    });
    return res.end();
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = url.pathname;

  try {
    // Health Check
    if (pathname === '/health' || pathname === '/api/sandbox/health') {
      return sendJson(res, 200, {
        ok: true,
        service: 'spark-sandbox-runner',
        port: PORT,
        uptime: process.uptime(),
      });
    }

    // 1. POST /api/sandbox/materialize
    if (pathname === '/api/sandbox/materialize' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const envId = String(body.envId || `env_${Date.now()}`).replace(/[^a-zA-Z0-9_\-]/g, '_');
      const files = body.files || {};
      const deleted = Array.isArray(body.deleted) ? body.deleted : [];
      const replaceAll = Boolean(body.replaceAll);
      const target = body.target || 'local_mac';
      const fileEntries = Object.entries(files);

      if (target === 'dgx_spark') {
        const remoteDir = `${SANDBOX_BASE_REMOTE}/${envId}`;
        const commands = [];
        if (replaceAll) commands.push(`rm -rf ${JSON.stringify(remoteDir)}`);
        commands.push(`mkdir -p ${JSON.stringify(remoteDir)}`);
        for (const rel of deleted) {
          try {
            const abs = safeJoin(remoteDir, rel);
            commands.push(`rm -f ${JSON.stringify(abs)}`);
          } catch {
            /* skip bad path */
          }
        }

        for (const [filePath, fileData] of fileEntries) {
          let abs;
          try {
            abs = safeJoin(remoteDir, filePath);
          } catch {
            continue;
          }
          const dir = path.dirname(abs);
          commands.push(`mkdir -p ${JSON.stringify(dir)}`);
          const b64 = Buffer.from(fileData.content || '').toString('base64');
          commands.push(`echo ${b64} | base64 -d > ${JSON.stringify(abs)}`);
        }

        const script = commands.join(' && ');
        try {
          await sshRemote(script, 30000);
          return sendJson(res, 200, {
            ok: true,
            envId,
            target: 'dgx_spark',
            path: remoteDir,
            filesCount: fileEntries.length,
          });
        } catch (err) {
          return sendJson(res, 500, {
            ok: false,
            error: `Failed to materialize on DGX Spark: ${err.message}`,
          });
        }
      } else {
        const localDir = path.join(SANDBOX_BASE_LOCAL, envId);
        if (replaceAll) {
          await rm(localDir, { recursive: true, force: true });
        }
        await mkdir(localDir, { recursive: true });

        for (const rel of deleted) {
          try {
            await rm(safeJoin(localDir, rel), { force: true });
          } catch {
            /* skip */
          }
        }

        await mapLimit(fileEntries, 8, async ([filePath, fileData]) => {
          const absPath = safeJoin(localDir, filePath);
          await mkdir(path.dirname(absPath), { recursive: true });
          await writeFile(absPath, fileData.content || '', 'utf8');
        });

        return sendJson(res, 200, {
          ok: true,
          envId,
          target: 'local_mac',
          path: localDir,
          filesCount: fileEntries.length,
        });
      }
    }

    // 2. POST /api/sandbox/test
    if (pathname === '/api/sandbox/test' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const envId = String(body.envId || '').replace(/[^a-zA-Z0-9_\-]/g, '_');
      const target = body.target || 'local_mac';
      const runtime = body.runtime || 'python';

      if (!envId) return sendJson(res, 400, { ok: false, error: 'envId is required' });

      let testCmd = 'python3 -m pytest -v --tb=short';
      if (runtime === 'node' || runtime === 'web') {
        testCmd = 'npm test || npx vitest run --reporter=verbose || npx jest';
      } else if (runtime === 'shell') {
        testCmd = 'bash test*.sh || bash *test.sh';
      }

      if (target === 'dgx_spark') {
        const remoteDir = `${SANDBOX_BASE_REMOTE}/${envId}`;
        try {
          const { stdout, stderr } = await sshRemote(
            `mkdir -p ${JSON.stringify(remoteDir)} && cd ${JSON.stringify(remoteDir)} && ${testCmd}`,
            60000
          );
          return sendJson(res, 200, { ok: true, stdout, stderr, exitCode: 0 });
        } catch (err) {
          return sendJson(res, 200, {
            ok: true,
            stdout: err.stdout || '',
            stderr: err.stderr || err.message,
            exitCode: err.code || 1,
          });
        }
      } else {
        const localDir = path.join(SANDBOX_BASE_LOCAL, envId);
        try {
          await mkdir(localDir, { recursive: true });
          const { stdout, stderr } = await execP(testCmd, {
            cwd: localDir,
            timeout: 60000,
            maxBuffer: 10 * 1024 * 1024,
          });
          return sendJson(res, 200, { ok: true, stdout, stderr, exitCode: 0 });
        } catch (err) {
          return sendJson(res, 200, {
            ok: true,
            stdout: err.stdout || '',
            stderr: err.stderr || err.message,
            exitCode: err.code || 1,
          });
        }
      }
    }

    // 3. POST /api/sandbox/build
    if (pathname === '/api/sandbox/build' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const envId = String(body.envId || '').replace(/[^a-zA-Z0-9_\-]/g, '_');
      const target = body.target || 'local_mac';
      const runtime = body.runtime || 'python';

      let buildCmd = 'python3 -m py_compile $(find . -name "*.py")';
      if (runtime === 'node' || runtime === 'web') {
        buildCmd = 'npm run build || npx tsc --noEmit || true';
      } else if (runtime === 'shell') {
        buildCmd = 'for f in *.sh; do [ -f "$f" ] && bash -n "$f"; done';
      }

      if (target === 'dgx_spark') {
        const remoteDir = `${SANDBOX_BASE_REMOTE}/${envId}`;
        try {
          const { stdout, stderr } = await sshRemote(
            `mkdir -p ${JSON.stringify(remoteDir)} && cd ${JSON.stringify(remoteDir)} && ${buildCmd}`,
            30000
          );
          return sendJson(res, 200, { ok: true, output: stdout || stderr || 'Build OK', exitCode: 0 });
        } catch (err) {
          return sendJson(res, 200, {
            ok: false,
            output: err.stdout || err.stderr || err.message,
            exitCode: err.code || 1,
          });
        }
      } else {
        const localDir = path.join(SANDBOX_BASE_LOCAL, envId);
        try {
          await mkdir(localDir, { recursive: true });
          const { stdout, stderr } = await execP(buildCmd, { cwd: localDir, timeout: 30000 });
          return sendJson(res, 200, { ok: true, output: stdout || stderr || 'Build OK', exitCode: 0 });
        } catch (err) {
          return sendJson(res, 200, {
            ok: false,
            output: err.stdout || err.stderr || err.message,
            exitCode: err.code || 1,
          });
        }
      }
    }

    // 4. POST /api/sandbox/exec
    if (pathname === '/api/sandbox/exec' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const envId = String(body.envId || '').replace(/[^a-zA-Z0-9_\-]/g, '_');
      const cmd = String(body.cmd || '').trim();
      const target = body.target || 'local_mac';

      if (!cmd) return sendJson(res, 400, { ok: false, error: 'Command required' });

      // Guard deadly commands
      const low = cmd.toLowerCase();
      if (low.includes('rm -rf /') || low.includes('mkfs') || low.includes(':(){ :|:& };:')) {
        return sendJson(res, 403, { ok: false, error: 'Command blocked by security policy' });
      }

      if (target === 'dgx_spark') {
        const remoteDir = `${SANDBOX_BASE_REMOTE}/${envId}`;
        try {
          const { stdout, stderr } = await sshRemote(
            `mkdir -p ${JSON.stringify(remoteDir)} && cd ${JSON.stringify(remoteDir)} && ${cmd}`,
            45000
          );
          return sendJson(res, 200, { ok: true, stdout, stderr, exitCode: 0 });
        } catch (err) {
          return sendJson(res, 200, {
            ok: false,
            stdout: err.stdout || '',
            stderr: err.stderr || err.message,
            exitCode: err.code || 1,
          });
        }
      } else {
        const localDir = path.join(SANDBOX_BASE_LOCAL, envId);
        try {
          await mkdir(localDir, { recursive: true });
          const { stdout, stderr } = await execP(cmd, {
            cwd: localDir,
            timeout: 45000,
            maxBuffer: 5 * 1024 * 1024,
          });
          return sendJson(res, 200, { ok: true, stdout, stderr, exitCode: 0 });
        } catch (err) {
          return sendJson(res, 200, {
            ok: false,
            stdout: err.stdout || '',
            stderr: err.stderr || err.message,
            exitCode: err.code || 1,
          });
        }
      }
    }

    // Image-gen live debug feed (agent: GET /api/debug/image-gen  or  tail logs/image-gen-debug.jsonl)
    if (pathname === '/api/debug/image-gen' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const evt = {
        ts: body.ts || new Date().toISOString(),
        t: body.t || Date.now(),
        source: body.source || 'ui',
        level: body.level || 'info',
        event: body.event || 'log',
        message: String(body.message || '').slice(0, 800),
        model: body.model,
        host: body.host,
        elapsedMs: body.elapsedMs,
        httpStatus: body.httpStatus,
        detail: body.detail && typeof body.detail === 'object' ? body.detail : undefined,
      };
      imageDebugRing.push(evt);
      if (imageDebugRing.length > IMAGE_DEBUG_RING_MAX) {
        imageDebugRing.splice(0, imageDebugRing.length - IMAGE_DEBUG_RING_MAX);
      }
      try {
        await mkdir(path.dirname(IMAGE_DEBUG_LOG), { recursive: true });
        await appendFile(IMAGE_DEBUG_LOG, JSON.stringify(evt) + '\n');
      } catch (err) {
        console.warn('[image-debug] write failed', err.message);
      }
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/debug/image-gen' && req.method === 'GET') {
      const limit = Math.min(400, Math.max(1, Number(url.searchParams.get('limit') || 120)));
      return sendJson(res, 200, {
        ok: true,
        path: IMAGE_DEBUG_LOG,
        count: imageDebugRing.length,
        events: imageDebugRing.slice(-limit),
      });
    }

    if (pathname === '/api/debug/image-gen' && req.method === 'DELETE') {
      imageDebugRing.length = 0;
      try {
        await writeFile(IMAGE_DEBUG_LOG, '');
      } catch {}
      return sendJson(res, 200, { ok: true });
    }

    // 5. DELETE /api/sandbox/:envId
    if (pathname.startsWith('/api/sandbox/') && req.method === 'DELETE') {
      const envId = pathname.replace('/api/sandbox/', '').replace(/[^a-zA-Z0-9_\-]/g, '_');
      if (envId) {
        const localDir = path.join(SANDBOX_BASE_LOCAL, envId);
        try {
          await rm(localDir, { recursive: true, force: true });
        } catch {}
      }
      return sendJson(res, 200, { ok: true, envId });
    }

    return sendJson(res, 404, { ok: false, error: 'Not Found' });
  } catch (err) {
    console.error('[SandboxRunner] Error:', err);
    return sendJson(res, 500, { ok: false, error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n${C.bold}======================================================================${C.reset}`);
  console.log(`   ${C.green}⚡ SPARK EPHEMERAL SANDBOX RUNNER ONLINE ⚡${C.reset}`);
  console.log(`   Address: http://${HOST}:${PORT}`);
  console.log(`   Local Sandboxes:  ${SANDBOX_BASE_LOCAL}`);
  console.log(`   Remote Sandboxes: ${SANDBOX_BASE_REMOTE} (on DGX Spark)`);
  console.log(`${C.bold}======================================================================${C.reset}\n`);
});
