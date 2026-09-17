/**
 * ==============================================================================
 * SOVEREIGN SPARK CONTAINER ENGINE — Ephemeral Linux Sandbox Pod Manager
 * ==============================================================================
 * Spawns, executes commands inside, and destroys lightweight Linux containers
 * with pre-installed developer/data-science packages.
 *
 * Supports both:
 * - Remote DGX Spark (flak3dd@192.168.4.103 with Blackwell GB10 GPU & NVMe)
 * - Local Mac host (via local Docker / OrbStack / Podman)
 * ==============================================================================
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileP = promisify(execFile);

export const CONTAINER_PROFILES = {
  python_data: {
    id: 'python_data',
    name: 'Python & Data Science (Debian 12)',
    image: 'python:3.11-slim',
    description: 'Python 3.11 with DuckDB, Pandas, NumPy, Scipy, PyTest, FastAPI, Requests, Git, Curl, Jq',
    preInstallCmd: 'pip install --no-cache-dir duckdb pandas numpy pytest requests fastapi uvicorn pydantic >/dev/null 2>&1 &',
  },
  gpu_spark: {
    id: 'gpu_spark',
    name: 'DGX Spark GPU & PyTorch (CUDA 12 / GB10)',
    image: 'pytorch/pytorch:latest',
    description: 'PyTorch with CUDA acceleration, DuckDB, OpenCV, and GPU drivers',
    enableGpu: true,
  },
  minimal_alpine: {
    id: 'minimal_alpine',
    name: 'Minimal Alpine Linux (~8 MB)',
    image: 'alpine:3.20',
    description: 'Ultra-fast POSIX Alpine with bash, curl, git, jq, and coreutils',
    preInstallCmd: 'apk add --no-cache bash curl git jq >/dev/null 2>&1 &',
  },
};

/** @type {Map<string, {
 *   containerName: string,
 *   envId: string,
 *   target: 'dgx_spark' | 'local_mac',
 *   profile: string,
 *   image: string,
 *   status: 'running' | 'stopped',
 *   spawnedAt: number,
 *   expiresAt: number,
 *   workspacePath: string,
 *   enableGpu: boolean,
 * }>} */
const activeContainers = new Map();

/** Format container name from envId */
export function getContainerName(envId) {
  const clean = String(envId || 'default').replace(/[^a-zA-Z0-9_\-]/g, '_');
  return `spark-sandbox-${clean}`;
}

/**
 * Execute command on host (either local or via sshRemote)
 */
async function runOnHost(script, target, { sshRemote, execLocal }) {
  if (target === 'dgx_spark') {
    if (!sshRemote) throw new Error('sshRemote handler not provided for dgx_spark target');
    return sshRemote(script, 60000);
  } else {
    if (execLocal) {
      return execLocal(script);
    }
    return execFileP('bash', ['-c', script], { timeout: 60000, maxBuffer: 10 * 1024 * 1024 });
  }
}

/**
 * Spawn an isolated lightweight Linux container
 */
export async function spawnContainer({
  envId,
  profile = 'python_data',
  target = 'dgx_spark',
  extraPackages = [],
  timeoutMinutes = 30,
  enableGpu = false,
  sshRemote,
  execLocal,
}) {
  const containerName = getContainerName(envId);
  const cfg = CONTAINER_PROFILES[profile] || CONTAINER_PROFILES.python_data;
  const image = cfg.image;
  const workspaceRoot = target === 'dgx_spark' ? '/tmp/spark-sandboxes' : '/tmp/spark-sandboxes';
  const hostDir = path.posix.join(workspaceRoot, envId);

  // 1. In-memory check: If container already registered, return immediately
  if (activeContainers.has(containerName)) {
    const existing = activeContainers.get(containerName);
    return {
      ok: true,
      alreadyRunning: true,
      containerName,
      envId,
      profile: existing.profile,
      target: existing.target,
      status: 'running',
      expiresAt: existing.expiresAt,
    };
  }

  const gpuFlag = (enableGpu || cfg.enableGpu) && target === 'dgx_spark' ? '--gpus all' : '';
  const now = Date.now();
  const ttlMs = Math.max(5, Math.min(180, Number(timeoutMinutes) || 30)) * 60 * 1000;
  const expiresAt = now + ttlMs;

  // 2. Fast-path host inspection: If container is already running on host, re-attach in ~10ms
  try {
    const inspectRes = await runOnHost(
      `docker inspect -f '{{.State.Running}}' "${containerName}" 2>/dev/null || true`,
      target,
      { sshRemote, execLocal }
    );
    if ((inspectRes?.stdout || '').trim() === 'true') {
      const info = {
        containerName,
        envId,
        target,
        profile,
        image,
        status: 'running',
        spawnedAt: now,
        expiresAt,
        workspacePath: hostDir,
        enableGpu: Boolean(gpuFlag),
      };
      activeContainers.set(containerName, info);
      return {
        ok: true,
        alreadyRunning: true,
        reAttached: true,
        containerName,
        envId,
        profile,
        target,
        status: 'running',
        expiresAt,
      };
    }
  } catch {
    /* proceed to clean spawn */
  }

  // Docker run command:
  // - daemon mode (-d)
  // - auto-restart policy none
  // - bind workspace to /workspace
  // - tail -f /dev/null keeps it alive indefinitely until destroyed
  const dockerCmd = [
    `mkdir -p "${hostDir}"`,
    `docker rm -f "${containerName}" 2>/dev/null || true`,
    `docker run -d --name "${containerName}"`,
    gpuFlag,
    `-v "${hostDir}:/workspace"`,
    `-w /workspace`,
    `"${image}" tail -f /dev/null`,
  ].filter(Boolean).join(' ');

  try {
    const { stdout, stderr } = await runOnHost(dockerCmd, target, { sshRemote, execLocal });
    const containerId = (stdout || '').trim().slice(0, 12);

    // If extra packages requested, trigger background install
    if (Array.isArray(extraPackages) && extraPackages.length > 0) {
      const pkgList = extraPackages.map((p) => String(p).replace(/[^a-zA-Z0-9_\-.=<>~]/g, '')).join(' ');
      if (pkgList) {
        const installCmd = profile.includes('alpine')
          ? `docker exec -d "${containerName}" apk add --no-cache ${pkgList}`
          : `docker exec -d "${containerName}" pip install --no-cache-dir ${pkgList}`;
        void runOnHost(installCmd, target, { sshRemote, execLocal }).catch(() => {});
      }
    } else if (cfg.preInstallCmd) {
      // Trigger pre-install background command if image is fresh
      const initCmd = `docker exec -d "${containerName}" sh -c "${cfg.preInstallCmd}"`;
      void runOnHost(initCmd, target, { sshRemote, execLocal }).catch(() => {});
    }

    const info = {
      containerName,
      containerId,
      envId,
      target,
      profile,
      image,
      status: 'running',
      spawnedAt: now,
      expiresAt,
      workspacePath: hostDir,
      enableGpu: Boolean(gpuFlag),
    };

    activeContainers.set(containerName, info);

    return {
      ok: true,
      containerName,
      containerId,
      envId,
      profile,
      target,
      image,
      status: 'running',
      workspacePath: hostDir,
      expiresAt,
      durationMs: Date.now() - now,
    };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || 'Failed to spawn container',
      stderr: err?.stderr || '',
      target,
    };
  }
}

/**
 * Execute command inside the isolated Linux container
 */
export async function execInContainer({
  envId,
  command,
  target = 'dgx_spark',
  timeoutMs = 45000,
  sshRemote,
  execLocal,
}) {
  const containerName = getContainerName(envId);
  const t0 = Date.now();

  if (!command || !command.trim()) {
    return { ok: false, error: 'Command required', exitCode: 1 };
  }

  // Base64 encode the command to avoid bash escaping issues
  const b64 = Buffer.from(command, 'utf8').toString('base64');
  const execScript = `docker exec -i "${containerName}" bash -c "echo ${b64} | base64 -d | bash" 2>&1 || docker exec -i "${containerName}" sh -c "echo ${b64} | base64 -d | sh"`;

  try {
    const { stdout, stderr } = await runOnHost(execScript, target, { sshRemote, execLocal });
    const durationMs = Date.now() - t0;
    return {
      ok: true,
      stdout: stdout || '',
      stderr: stderr || '',
      exitCode: 0,
      durationMs,
      containerName,
      target,
    };
  } catch (err) {
    const durationMs = Date.now() - t0;
    return {
      ok: false,
      stdout: err.stdout || '',
      stderr: err.stderr || err.message,
      exitCode: err.code || 1,
      durationMs,
      containerName,
      target,
    };
  }
}

/**
 * Destroy the isolated Linux container
 */
export async function destroyContainer({
  envId,
  target = 'dgx_spark',
  sshRemote,
  execLocal,
}) {
  const containerName = getContainerName(envId);
  const destroyScript = `docker rm -f "${containerName}" 2>/dev/null || true`;

  try {
    await runOnHost(destroyScript, target, { sshRemote, execLocal });
    activeContainers.delete(containerName);
    return { ok: true, containerName, destroyed: true };
  } catch (err) {
    activeContainers.delete(containerName);
    return { ok: false, error: err?.message, containerName };
  }
}

/**
 * List all active containers
 */
export function listActiveContainers() {
  const now = Date.now();
  return [...activeContainers.values()].map((c) => ({
    containerName: c.containerName,
    envId: c.envId,
    target: c.target,
    profile: c.profile,
    image: c.image,
    status: c.status,
    uptimeSeconds: Math.round((now - c.spawnedAt) / 1000),
    remainingSeconds: Math.max(0, Math.round((c.expiresAt - now) / 1000)),
    workspacePath: c.workspacePath,
    enableGpu: c.enableGpu,
  }));
}

/**
 * Check if an active container exists for this envId
 */
export function hasActiveContainer(envId) {
  const containerName = getContainerName(envId);
  return activeContainers.has(containerName);
}
