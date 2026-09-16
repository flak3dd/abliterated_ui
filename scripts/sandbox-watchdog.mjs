#!/usr/bin/env node
/**
 * Keep sandbox-runner (:17330) alive. Polls /health and restarts on failure.
 * Usage: node scripts/sandbox-watchdog.mjs
 * launchd: scripts/launchd/com.abliterated.sandbox-runner.plist
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.SANDBOX_PORT || 17330);
const HOST = process.env.SANDBOX_HOST || '127.0.0.1';
const INTERVAL = Number(process.env.SANDBOX_WATCHDOG_MS || 5000);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER = path.join(REPO, 'scripts', 'sandbox-runner.mjs');

let child = null;
let restarting = false;

function health() {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port: PORT, path: '/health', timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function start() {
  if (child && !child.killed) return;
  console.log(`[watchdog] starting sandbox-runner on ${HOST}:${PORT}`);
  child = spawn(process.execPath, [RUNNER], {
    cwd: REPO,
    env: { ...process.env, SANDBOX_PORT: String(PORT), SANDBOX_HOST: HOST },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  child.on('exit', (code, signal) => {
    console.warn(`[watchdog] runner exited code=${code} signal=${signal}`);
    child = null;
  });
}

async function tick() {
  if (restarting) return;
  const ok = await health();
  if (ok) return;
  restarting = true;
  try {
    if (child) {
      try { child.kill('SIGTERM'); } catch {}
      child = null;
    }
    start();
    // wait briefly for boot
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 400));
      if (await health()) break;
    }
  } finally {
    restarting = false;
  }
}

start();
setInterval(() => {
  tick().catch((e) => console.error('[watchdog]', e));
}, INTERVAL);
console.log(`[watchdog] polling http://${HOST}:${PORT}/health every ${INTERVAL}ms`);
