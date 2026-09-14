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
import { mkdir, writeFile, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execP = promisify(exec);

const PORT = Number(process.env.SANDBOX_PORT || 17330);
const HOST = process.env.SANDBOX_HOST || '0.0.0.0';
const SANDBOX_BASE_LOCAL = '/tmp/spark-sandboxes';
const SANDBOX_BASE_REMOTE = '/tmp/spark-sandboxes';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
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
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
      const target = body.target || 'local_mac';

      if (target === 'dgx_spark') {
        const remoteDir = `${SANDBOX_BASE_REMOTE}/${envId}`;
        const commands = [`mkdir -p "${remoteDir}"`];

        for (const [filePath, fileData] of Object.entries(files)) {
          const cleanPath = filePath.replace(/\\/g, '/');
          const dir = path.dirname(cleanPath);
          if (dir && dir !== '.') {
            commands.push(`mkdir -p "${remoteDir}/${dir}"`);
          }
          const b64 = Buffer.from(fileData.content || '').toString('base64');
          commands.push(`echo "${b64}" | base64 -d > "${remoteDir}/${cleanPath}"`);
        }

        const script = commands.join(' && ');
        try {
          await execP(`ssh flak3dd '${script.replace(/'/g, "'\\''")}'`, { timeout: 30000 });
          return sendJson(res, 200, {
            ok: true,
            envId,
            target: 'dgx_spark',
            path: remoteDir,
            filesCount: Object.keys(files).length,
          });
        } catch (err) {
          return sendJson(res, 500, {
            ok: false,
            error: `Failed to materialize on DGX Spark: ${err.message}`,
          });
        }
      } else {
        const localDir = path.join(SANDBOX_BASE_LOCAL, envId);
        await mkdir(localDir, { recursive: true });

        for (const [filePath, fileData] of Object.entries(files)) {
          const cleanPath = filePath.replace(/\\/g, '/');
          const absPath = path.join(localDir, cleanPath);
          await mkdir(path.dirname(absPath), { recursive: true });
          await writeFile(absPath, fileData.content || '', 'utf8');
        }

        return sendJson(res, 200, {
          ok: true,
          envId,
          target: 'local_mac',
          path: localDir,
          filesCount: Object.keys(files).length,
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
          const { stdout, stderr } = await execP(`ssh flak3dd 'cd "${remoteDir}" && ${testCmd}'`, {
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
      } else {
        const localDir = path.join(SANDBOX_BASE_LOCAL, envId);
        try {
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
          const { stdout, stderr } = await execP(`ssh flak3dd 'cd "${remoteDir}" && ${buildCmd}'`, { timeout: 30000 });
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
          const { stdout, stderr } = await execP(`ssh flak3dd 'cd "${remoteDir}" && ${cmd}'`, {
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
