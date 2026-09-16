/**
 * Background jobs: cron schedules + chokidar file/git watchers.
 * Optional dep: chokidar. Cron parsed minimally (5-field).
 */
import { spawn } from 'node:child_process';
import { broadcastSandboxEvent } from './sandbox-events.mjs';
import path from 'node:path';

let chokidar = null;
try {
  chokidar = await import('chokidar');
} catch {
  console.warn('[jobs] chokidar not installed — file watchers disabled until npm i chokidar');
}

/** @type {Map<string, any>} */
const jobs = new Map();

function matchCron(expr, date = new Date()) {
  // Minimal: "m h dom mon dow" with * and */n support for minute/hour
  const parts = String(expr || '').trim().split(/\s+/);
  if (parts.length < 5) return false;
  const [min, hour] = parts;
  const ok = (field, value) => {
    if (field === '*') return true;
    if (field.startsWith('*/')) {
      const n = Number(field.slice(2));
      return n > 0 && value % n === 0;
    }
    return Number(field) === value;
  };
  return ok(min, date.getMinutes()) && ok(hour, date.getHours());
}

export function listJobs() {
  return [...jobs.values()].map((j) => ({
    id: j.id,
    kind: j.kind,
    expr: j.expr,
    prompt: j.prompt,
    path: j.path,
    enabled: j.enabled,
    lastRunAt: j.lastRunAt,
    lastStatus: j.lastStatus,
  }));
}

export function createCronJob({ id, expr, prompt, cwd }) {
  const jobId = id || `cron_${Date.now()}`;
  const job = {
    id: jobId,
    kind: 'cron',
    expr,
    prompt,
    cwd,
    enabled: true,
    lastRunAt: null,
    lastStatus: null,
    timer: null,
  };
  job.timer = setInterval(() => {
    if (!job.enabled) return;
    if (matchCron(job.expr)) fireJob(job);
  }, 30000);
  jobs.set(jobId, job);
  broadcastSandboxEvent({ type: 'job-created', job: listJobs().find((x) => x.id === jobId) });
  return jobId;
}

export function createWatchJob({ id, watchPath, prompt, events = ['change', 'add'] }) {
  if (!chokidar) throw new Error('chokidar required: npm i chokidar');
  const jobId = id || `watch_${Date.now()}`;
  const watcher = chokidar.watch(watchPath, {
    ignoreInitial: true,
    ignored: /(^|[\/\\])\.(git|hg)|node_modules|dist|\.expo/,
  });
  const job = {
    id: jobId,
    kind: 'watch',
    path: watchPath,
    prompt,
    enabled: true,
    lastRunAt: null,
    lastStatus: null,
    watcher,
  };
  let debounce = null;
  const onEv = (ev, file) => {
    if (!job.enabled) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => fireJob(job, { event: ev, file }), 800);
  };
  for (const ev of events) watcher.on(ev, (file) => onEv(ev, file));
  // git commit heuristic: .git/logs/HEAD
  jobs.set(jobId, job);
  broadcastSandboxEvent({ type: 'job-created', job: listJobs().find((x) => x.id === jobId) });
  return jobId;
}

function fireJob(job, meta = {}) {
  job.lastRunAt = Date.now();
  job.lastStatus = 'running';
  broadcastSandboxEvent({
    type: 'job-fire',
    jobId: job.id,
    kind: job.kind,
    prompt: job.prompt,
    meta,
  });
  // Local smoke: run a lightweight check script if present
  const cmd =
    process.platform === 'win32'
      ? 'echo job'
      : `echo "[job ${job.id}] ${job.prompt.slice(0, 80)}" && (npm test --silent 2>/dev/null || npx --yes tsc --noEmit 2>/dev/null || true)`;
  const child = spawn('/bin/bash', ['-lc', cmd], {
    cwd: job.cwd || process.cwd(),
    env: process.env,
  });
  let out = '';
  child.stdout?.on('data', (d) => (out += d));
  child.stderr?.on('data', (d) => (out += d));
  child.on('exit', (code) => {
    job.lastStatus = code === 0 ? 'ok' : 'attention';
    broadcastSandboxEvent({
      type: 'job-result',
      jobId: job.id,
      status: job.lastStatus,
      exitCode: code,
      excerpt: out.slice(0, 1200),
      prompt: job.prompt,
      needsAttention: code !== 0,
    });
  });
}

export function stopJob(id) {
  const job = jobs.get(id);
  if (!job) return false;
  job.enabled = false;
  if (job.timer) clearInterval(job.timer);
  if (job.watcher) job.watcher.close();
  jobs.delete(id);
  broadcastSandboxEvent({ type: 'job-stopped', jobId: id });
  return true;
}

export function parseScheduleSlash(text) {
  // /schedule "*/30 * * * *" "prompt..."
  const m = String(text || '').match(/^\/schedule\s+"([^"]+)"\s+"([\s\S]+)"\s*$/i);
  if (!m) return null;
  return { expr: m[1], prompt: m[2] };
}

export function parseWatchSlash(text) {
  // /watch /path "prompt"
  const m = String(text || '').match(/^\/watch\s+(\S+)\s+"([\s\S]+)"\s*$/i);
  if (!m) return null;
  return { path: m[1], prompt: m[2] };
}

void path;
