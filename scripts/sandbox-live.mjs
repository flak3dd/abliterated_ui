#!/usr/bin/env node
/**
 * Live serve / reverse-proxy / headed Playwright helpers for sandbox-runner.
 * Mac: headed Chromium on real desktop. Linux/Spark: Xvfb when available.
 */
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { broadcastSandboxEvent } from './sandbox-events.mjs';

const execFileP = promisify(execFile);
const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @type {Map<string, { envId: string, port: number, pid: number|null, command: string, child: import('node:child_process').ChildProcess|null, target: string, previewPath: string, startedAt: number, logs: string[] }>} */
export const liveServers = new Map();

const HEADED =
  process.env.SANDBOX_HEADED === '1' ||
  process.env.PLAYWRIGHT_HEADED === '1' ||
  process.env.SANDBOX_HEADED !== '0';

export function findFreePort(start = 4100) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const srv = net.createServer();
      srv.unref();
      srv.on('error', () => tryPort(port + 1));
      srv.listen(port, '127.0.0.1', () => {
        const p = srv.address().port;
        srv.close(() => resolve(p));
      });
    };
    tryPort(start);
  });
}

export async function detectServeCommand(cwd, overrideCmd) {
  if (overrideCmd && String(overrideCmd).trim()) return String(overrideCmd).trim();
  try {
    const raw = await readFile(path.join(cwd, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw);
    const scripts = pkg.scripts || {};
    if (scripts.web) return 'npm run web -- --port __PORT__';
    if (scripts.dev) return 'npm run dev -- --port __PORT__';
    if (scripts.start) return 'npm run start -- --port __PORT__';
    if (scripts['expo:web']) return 'npm run expo:web -- --port __PORT__';
  } catch {
    /* no package.json */
  }
  try {
    await access(path.join(cwd, 'index.html'));
    return 'npx --yes serve -l __PORT__ .';
  } catch {
    /* */
  }
  return 'npx --yes serve -l __PORT__ .';
}

function killServer(entry) {
  if (!entry?.child) return;
  try {
    entry.child.kill('SIGTERM');
  } catch {
    /* */
  }
  entry.child = null;
  entry.pid = null;
}

export async function stopLiveServer(envId) {
  const entry = liveServers.get(envId);
  if (!entry) return { ok: true, stopped: false };
  killServer(entry);
  liveServers.delete(envId);
  return { ok: true, stopped: true, envId };
}

export async function startLiveServer({
  envId,
  cwd,
  target = 'local_mac',
  command,
  port,
  sshRemote,
}) {
  const existing = liveServers.get(envId);
  if (existing?.child && !existing.child.killed) {
    return {
      ok: true,
      reused: true,
      envId,
      port: existing.port,
      pid: existing.pid,
      command: existing.command,
      previewUrl: existing.previewPath,
      status: 'running',
      target: existing.target,
    };
  }

  const boundPort = port || (await findFreePort(4100 + (Math.abs(hashCode(envId)) % 500)));
  let cmdTemplate = await detectServeCommand(cwd, command);
  let cmd = cmdTemplate.replace(/__PORT__/g, String(boundPort));
  // Also support PORT= env style
  if (!cmd.includes(String(boundPort))) {
    cmd = `PORT=${boundPort} ${cmd}`;
  }

  if (target === 'dgx_spark') {
    // Start remotely; Mac runner proxies via SSH local forward when possible.
    // Limitation: preview proxy reaches remote via ssh -L on the allocated port.
    const remoteDir = cwd; // caller passes remote path
    const remoteCmd = `cd ${JSON.stringify(remoteDir)} && (${cmd})`;
    try {
      // Background remote serve + local tunnel
      const tunnel = spawn(
        'ssh',
        [
          '-o',
          'BatchMode=yes',
          '-o',
          'ExitOnForwardFailure=yes',
          '-N',
          '-L',
          `${boundPort}:127.0.0.1:${boundPort}`,
          'flak3dd',
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
      await sshRemote(
        `mkdir -p ${JSON.stringify(remoteDir)} && nohup bash -lc ${JSON.stringify(remoteCmd)} >/tmp/spark-serve-${envId}.log 2>&1 & echo $!`,
        20000
      );
      const previewPath = `/api/sandbox/preview/${encodeURIComponent(envId)}/`;
      const entry = {
        envId,
        port: boundPort,
        pid: tunnel.pid || null,
        command: cmd,
        child: tunnel,
        target,
        previewPath,
        startedAt: Date.now(),
        logs: ['dgx_spark: remote serve + ssh -L tunnel'],
      };
      liveServers.set(envId, entry);
      await waitForHttp(boundPort, 25000);
      return {
        ok: true,
        reused: false,
        envId,
        port: boundPort,
        pid: entry.pid,
        command: cmd,
        previewUrl: previewPath,
        status: 'running',
        target,
        note: 'Spark serve uses SSH -L tunnel; kill tunnel via DELETE env or stop serve.',
      };
    } catch (err) {
      return {
        ok: false,
        error: `Failed to start Spark serve/tunnel: ${err.message || err}`,
      };
    }
  }

  const child = spawn(cmd, {
    cwd,
    shell: true,
    env: { ...process.env, PORT: String(boundPort), BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  const pushLog = (buf) => {
    const s = buf.toString('utf8');
    logs.push(s);
    if (logs.length > 40) logs.shift();
  };
  child.stdout?.on('data', pushLog);
  child.stderr?.on('data', pushLog);
  child.on('exit', () => {
    const cur = liveServers.get(envId);
    if (cur && cur.child === child) {
      cur.child = null;
      cur.pid = null;
    }
  });

  const previewPath = `/api/sandbox/preview/${encodeURIComponent(envId)}/`;
  const entry = {
    envId,
    port: boundPort,
    pid: child.pid || null,
    command: cmd,
    child,
    target,
    previewPath,
    startedAt: Date.now(),
    logs,
  };
  liveServers.set(envId, entry);
  broadcastSandboxEvent({ type: 'serve', envId, port: boundPort, command: cmd, target, previewUrl: `/api/sandbox/preview/${encodeURIComponent(envId)}/` });

  try {
    await waitForHttp(boundPort, 45000);
  } catch (err) {
    // Still return running — some servers are slow; proxy may work shortly.
    entry.logs.push(`waitForHttp: ${err.message}`);
  }

  return {
    ok: true,
    reused: false,
    envId,
    port: boundPort,
    pid: entry.pid,
    command: cmd,
    previewUrl: previewPath,
    status: 'running',
    target,
  };
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function waitForHttp(port, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1500 }, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`Server on :${port} did not become ready`));
        else setTimeout(tick, 400);
      });
      req.on('timeout', () => {
        req.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`Server on :${port} timed out`));
        else setTimeout(tick, 400);
      });
    };
    tick();
  });
}

export function proxyToLiveServer(req, res, envId, restPath) {
  const entry = liveServers.get(envId);
  if (!entry) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'No live server for env' }));
    return;
  }
  let search = '';
  try {
    search = new URL(req.url || '/', 'http://127.0.0.1').search || '';
  } catch {
    /* */
  }
  const clean = String(restPath || '').replace(/^\/+/, '');
  const targetPath = (clean ? '/' + clean : '/') + search;
  const headers = { ...req.headers, host: `127.0.0.1:${entry.port}` };
  delete headers['accept-encoding'];
  const preq = http.request(
    {
      hostname: '127.0.0.1',
      port: entry.port,
      path: targetPath,
      method: req.method,
      headers,
    },
    (pres) => {
      res.writeHead(pres.statusCode || 502, {
        ...pres.headers,
        'Access-Control-Allow-Origin': res._aco || '*',
      });
      pres.pipe(res);
    }
  );
  preq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: `Proxy failed: ${err.message}` }));
    } else {
      res.end();
    }
  });
  req.pipe(preq);
}

async function resolvePlaywright() {
  try {
    return require('playwright');
  } catch {
    try {
      return require(path.join(REPO_ROOT, 'node_modules', 'playwright'));
    } catch {
      return null;
    }
  }
}

export async function runBrowserTest({
  envId,
  url,
  target = 'local_mac',
  headed,
  sandboxBase,
}) {
  const wantHeaded = headed != null ? Boolean(headed) : HEADED;
  const isLinux = process.platform === 'linux' || target === 'dgx_spark';
  const artDir = path.join(sandboxBase, envId, '_artifacts', `browser_${Date.now()}`);
  await mkdir(artDir, { recursive: true });

  const pw = await resolvePlaywright();
  if (!pw) {
    return {
      ok: false,
      error:
        'Playwright is not installed. From the repo root run: npm i -D playwright && npx playwright install chromium',
      artifactsDir: artDir,
    };
  }

  let displayProc = null;
  let env = { ...process.env };
  if (isLinux && wantHeaded) {
    // Prefer xvfb-run style by allocating a display if Xvfb exists
    try {
      await execFileP('which', ['Xvfb']);
      const display = `:${90 + (Math.abs(hashCode(envId)) % 20)}`;
      displayProc = spawn('Xvfb', [display, '-screen', '0', '1280x800x24'], {
        stdio: 'ignore',
      });
      env.DISPLAY = display;
      await new Promise((r) => setTimeout(r, 400));
    } catch {
      /* fall through — headed may fail without display */
    }
  }

  const screenshotPath = path.join(artDir, 'screenshot.png');
  const videoDir = path.join(artDir, 'video');
  await mkdir(videoDir, { recursive: true });
  const tracePath = path.join(artDir, 'trace.zip');

  let browser;
  try {
    browser = await pw.chromium.launch({
      headless: !wantHeaded,
      args: wantHeaded && isLinux ? [`--display=${env.DISPLAY || ':99'}`] : undefined,
      env,
    });
    const context = await browser.newContext({
      recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
      viewport: { width: 1280, height: 720 },
    });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    const targetUrl = url;
    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await context.tracing.stop({ path: tracePath });
    const title = await page.title();
    await context.close();
    await browser.close();
    browser = null;

    let videoPath = null;
    try {
      const { readdir } = await import('node:fs/promises');
      const vids = (await readdir(videoDir)).filter((f) => f.endsWith('.webm'));
      if (vids[0]) videoPath = path.join(videoDir, vids[0]);
    } catch {
      /* */
    }

    let screenshotBase64 = null;
    try {
      const buf = await readFile(screenshotPath);
      screenshotBase64 = buf.toString('base64');
    } catch {
      /* */
    }

    broadcastSandboxEvent({ type: 'browser-test', envId, url: targetUrl, ok: true });
    return {
      ok: true,
      status: response?.status() ?? null,
      title,
      url: targetUrl,
      headed: wantHeaded,
      display: env.DISPLAY || null,
      artifacts: {
        dir: artDir,
        screenshot: screenshotPath,
        video: videoPath,
        trace: tracePath,
      },
      screenshotBase64: screenshotBase64
        ? `data:image/png;base64,${screenshotBase64.slice(0, 200000)}`
        : null,
    };
  } catch (err) {
    try {
      if (browser) await browser.close();
    } catch {
      /* */
    }
    return {
      ok: false,
      error: err.message || String(err),
      hint:
        wantHeaded && process.platform === 'darwin'
          ? 'macOS may need Accessibility permission for headed Chromium.'
          : isLinux
            ? 'Install Xvfb (apt install xvfb) for headed-on-virtual-display, or set SANDBOX_HEADED=0.'
            : undefined,
      artifactsDir: artDir,
    };
  } finally {
    if (displayProc) {
      try {
        displayProc.kill('SIGTERM');
      } catch {
        /* */
      }
    }
  }
}
