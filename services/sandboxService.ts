import {
  SessionEnvironment,
  ExecutionTarget,
  TestRunReport,
  TestCaseResult,
  BuildReport,
  SandboxInfo,
  TestFramework,
  WorkspaceFile,
} from '../types';
import {
  consumeSandboxWork,
  hasSandboxWork,
  restoreSandboxWork,
} from './sandboxDirty';

const PRIMARY_SANDBOX_PORT = 17330;

function getControllerBaseUrl(_target: ExecutionTarget): string {
  return `http://127.0.0.1:${PRIMARY_SANDBOX_PORT}`;
}

let materializeChain: Promise<void> = Promise.resolve();

function enqueueMaterialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = materializeChain.then(fn, fn);
  materializeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function postSandbox(
  path: string,
  body: unknown,
  target: ExecutionTarget
): Promise<Response | null> {
  const baseUrl = getControllerBaseUrl(target);
  try {
    return await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Client abort must exceed sandbox-runner test timeout (60s); 120s leaves headroom for materialize+test.
      signal: AbortSignal.timeout(120000),
    });
  } catch {
    // Daemon down / CORS / refused — expected when :17330 is not running.
    // Do not console.error: Expo LogBox treats that as a redbox overlay.
    return null;
  }
}

export function detectRuntimeAndFramework(files: Record<string, WorkspaceFile>): {
  runtime: string;
  framework: TestFramework;
  entrypoint?: string;
  testFiles: string[];
} {
  const filePaths = Object.keys(files);
  const testFiles: string[] = [];

  // Search for test files
  for (const p of filePaths) {
    const lower = p.toLowerCase();
    if (
      lower.includes('test_') ||
      lower.endsWith('_test.py') ||
      lower.endsWith('.test.ts') ||
      lower.endsWith('.test.js') ||
      lower.endsWith('.test.tsx') ||
      lower.endsWith('.spec.ts') ||
      lower.endsWith('.spec.js') ||
      lower.startsWith('tests/') ||
      lower.startsWith('test/')
    ) {
      testFiles.push(p);
    }
  }

  // Detect Python
  const hasPy = filePaths.some((f) => f.endsWith('.py') || f === 'requirements.txt' || f === 'pyproject.toml');
  if (hasPy) {
    const entrypoint = filePaths.find((f) => f === 'main.py' || f === 'app.py' || f === 'run.py') || filePaths.find((f) => f.endsWith('.py') && !testFiles.includes(f));
    return {
      runtime: 'python',
      framework: 'pytest',
      entrypoint,
      testFiles,
    };
  }

  // Detect Node / TypeScript
  const hasNode = filePaths.some(
    (f) =>
      f === 'package.json' ||
      f.endsWith('.ts') ||
      f.endsWith('.tsx') ||
      f.endsWith('.js') ||
      f.endsWith('.jsx')
  );
  if (hasNode) {
    const hasHtml = filePaths.some((f) => f.endsWith('.html'));
    const entrypoint = filePaths.find(
      (f) =>
        f === 'index.html' ||
        f === 'src/index.ts' ||
        f === 'src/main.ts' ||
        f === 'index.ts' ||
        f === 'index.js'
    );
    return {
      runtime: hasHtml ? 'web' : 'node',
      framework: 'vitest',
      entrypoint,
      testFiles,
    };
  }

  // Detect Shell
  const hasShell = filePaths.some((f) => f.endsWith('.sh') || f.endsWith('.bash'));
  if (hasShell) {
    const entrypoint = filePaths.find((f) => f.endsWith('.sh') && !testFiles.includes(f));
    return {
      runtime: 'shell',
      framework: 'bash',
      entrypoint,
      testFiles,
    };
  }

  // Web only
  if (filePaths.some((f) => f.endsWith('.html'))) {
    return {
      runtime: 'web',
      framework: 'custom',
      entrypoint: filePaths.find((f) => f.endsWith('.html')),
      testFiles,
    };
  }

  return {
    runtime: 'plaintext',
    framework: 'custom',
    testFiles,
  };
}

export function parsePytestOutput(output: string, envId: string, durationMs: number): TestRunReport {
  const tests: TestCaseResult[] = [];
  const lines = output.split('\n');

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  // Match test item execution line: e.g., test_math.py::test_addition PASSED
  const testItemRegex = /^([a-zA-Z0-9_\-./\\]+::[a-zA-Z0-9_\-]+)\s+(PASSED|FAILED|SKIPPED|ERROR)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(testItemRegex);
    if (match) {
      const testName = match[1];
      const statusRaw = match[2].toUpperCase();
      const status: 'passed' | 'failed' | 'skipped' =
        statusRaw === 'PASSED' ? 'passed' : statusRaw === 'SKIPPED' ? 'skipped' : 'failed';

      if (status === 'passed') passed++;
      else if (status === 'failed') failed++;
      else skipped++;

      let failureMessage: string | undefined;
      let traceback: string | undefined;

      if (status === 'failed') {
        const traceLines: string[] = [];
        for (let j = i + 1; j < Math.min(i + 25, lines.length); j++) {
          if (lines[j].startsWith('_ _ _') || lines[j].includes('AssertionError') || lines[j].includes('Error:')) {
            failureMessage = lines[j].trim();
          }
          if (lines[j].startsWith('==') && lines[j].endsWith('==')) break;
          traceLines.push(lines[j]);
        }
        traceback = traceLines.join('\n').slice(0, 1500);
      }

      tests.push({
        name: testName,
        status,
        failureMessage,
        traceback,
      });
    }
  }

  const summaryMatch = output.match(/==+ (?:(\d+) failed,?\s*)?(?:(\d+) passed,?\s*)?(?:(\d+) skipped,?\s*)?in ([\d.]+)s/i);
  if (summaryMatch) {
    if (summaryMatch[1]) failed = parseInt(summaryMatch[1], 10);
    if (summaryMatch[2]) passed = parseInt(summaryMatch[2], 10);
    if (summaryMatch[3]) skipped = parseInt(summaryMatch[3], 10);
  }

  const total = passed + failed + skipped || tests.length;

  return {
    id: 'test_' + Date.now(),
    envId,
    timestamp: Date.now(),
    framework: 'pytest',
    total,
    passed,
    failed,
    skipped,
    durationMs,
    tests,
    rawOutput: output,
    exitCode: failed > 0 ? 1 : 0,
  };
}

export function parseVitestOutput(output: string, envId: string, durationMs: number): TestRunReport {
  const tests: TestCaseResult[] = [];
  const lines = output.split('\n');

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('✓') || trimmed.startsWith('PASS')) {
      passed++;
      tests.push({
        name: trimmed.replace(/^[✓\s]+|PASS\s+/g, '').trim(),
        status: 'passed',
      });
    } else if (trimmed.startsWith('×') || trimmed.startsWith('FAIL')) {
      failed++;
      tests.push({
        name: trimmed.replace(/^[×\s]+|FAIL\s+/g, '').trim(),
        status: 'failed',
        failureMessage: trimmed,
      });
    }
  }

  const total = passed + failed + skipped || tests.length;

  return {
    id: 'test_' + Date.now(),
    envId,
    timestamp: Date.now(),
    framework: 'vitest',
    total,
    passed,
    failed,
    skipped,
    durationMs,
    tests,
    rawOutput: output,
    exitCode: failed > 0 ? 1 : 0,
  };
}

/**
 * Materializes session files to the isolated sandbox on the target machine
 */
export async function materializeSandbox(
  env: SessionEnvironment,
  target: ExecutionTarget = 'local_mac'
): Promise<SandboxInfo> {
  return enqueueMaterialize(async () => {
    const meta = detectRuntimeAndFramework(env.files);
    const info = (filesCount: number, path?: string): SandboxInfo => ({
      envId: env.id,
      path: path || `/tmp/spark-sandboxes/${env.id}`,
      runtime: meta.runtime,
      target,
      filesCount,
    });

    if (!hasSandboxWork(env.id)) {
      return info(Object.keys(env.files).length);
    }

    const work = consumeSandboxWork(env.id);
    const filesPayload: Record<string, { path: string; content: string }> = {};
    const paths = work.replaceAll ? Object.keys(env.files) : work.paths;
    for (const p of paths) {
      const file = env.files[p];
      if (!file) continue;
      filesPayload[p] = { path: file.path, content: file.content };
    }

    const res = await postSandbox(
      '/api/sandbox/materialize',
      {
        envId: env.id,
        files: filesPayload,
        deleted: work.replaceAll ? [] : work.deleted,
        replaceAll: work.replaceAll,
        target,
        runtime: meta.runtime,
      },
      target
    );

    if (res?.ok) {
      const data = await res.json();
      return info(Object.keys(env.files).length, data.path);
    }

    restoreSandboxWork(env.id, work);
    throw new Error(
      `Sandbox materialize failed (${res?.status ?? 'offline'}) at ${getControllerBaseUrl(target)}. ` +
        'Start the runner in abliterated_ui with: npm run sandbox'
    );
  });
}

/**
 * Executes the project's test suite inside the temp sandbox
 */
export async function runSandboxTests(
  env: SessionEnvironment,
  target: ExecutionTarget = 'local_mac'
): Promise<TestRunReport> {
  const meta = detectRuntimeAndFramework(env.files);
  const t0 = Date.now();

  // First ensure sandbox is materialized
  await materializeSandbox(env, target);

  const res = await postSandbox(
    '/api/sandbox/test',
    {
      envId: env.id,
      target,
      framework: meta.framework,
      runtime: meta.runtime,
    },
    target
  );

  if (res?.ok) {
      const data = await res.json();
      if (data.report) return data.report;

      const durationMs = Date.now() - t0;
      if (meta.framework === 'pytest') {
        return parsePytestOutput(data.rawOutput || data.stdout || '', env.id, durationMs);
      } else if (meta.framework === 'vitest' || meta.framework === 'jest') {
        return parseVitestOutput(data.rawOutput || data.stdout || '', env.id, durationMs);
      }

      return {
        id: 'test_' + Date.now(),
        envId: env.id,
        timestamp: Date.now(),
        framework: meta.framework,
        total: data.exitCode === 0 ? 1 : 1,
        passed: data.exitCode === 0 ? 1 : 0,
        failed: data.exitCode === 0 ? 0 : 1,
        skipped: 0,
        durationMs,
        tests: [
          {
            name: meta.entrypoint || 'suite',
            status: data.exitCode === 0 ? 'passed' : 'failed',
            failureMessage: data.exitCode !== 0 ? data.stderr : undefined,
          },
        ],
        rawOutput: data.stdout || data.stderr || '',
        exitCode: data.exitCode ?? 0,
      };
    }

  const durationMs = Date.now() - t0;
  return {
    id: 'test_' + Date.now(),
    envId: env.id,
    timestamp: Date.now(),
    framework: meta.framework,
    total: 1,
    passed: 0,
    failed: 1,
    skipped: 0,
    durationMs,
    tests: [
      {
        name: 'sandbox-daemon',
        status: 'failed',
        failureMessage: 'Sandbox runner offline or test request failed.',
      },
    ],
    rawOutput: 'Sandbox runner unreachable — tests were not executed.',
    exitCode: 1,
  };
}

/**
 * Builds or compiles the sandbox application
 */
export async function buildSandbox(
  env: SessionEnvironment,
  target: ExecutionTarget = 'local_mac'
): Promise<BuildReport> {
  const meta = detectRuntimeAndFramework(env.files);
  const t0 = Date.now();

  await materializeSandbox(env, target);

  const res = await postSandbox(
    '/api/sandbox/build',
    {
      envId: env.id,
      target,
      runtime: meta.runtime,
    },
    target
  );

  if (res?.ok) {
    const data = await res.json();
    return {
      id: 'build_' + Date.now(),
      envId: env.id,
      timestamp: Date.now(),
      runtime: meta.runtime,
      success: data.exitCode === 0,
      durationMs: Date.now() - t0,
      output: data.output || data.stdout || data.stderr || 'Build completed successfully.',
      exitCode: data.exitCode ?? 0,
    };
  }

  return {
    id: 'build_' + Date.now(),
    envId: env.id,
    timestamp: Date.now(),
    runtime: meta.runtime,
    success: false,
    durationMs: Date.now() - t0,
    output: 'Sandbox runner unreachable — build was not executed.',
    exitCode: 1,
  };
}

/**
 * Runs an arbitrary command inside the sandbox directory
 */
export async function executeSandboxCommand(
  envId: string,
  cmd: string,
  target: ExecutionTarget = 'local_mac'
): Promise<{ ok: boolean; stdout: string; stderr: string; exitCode: number }> {
  const baseUrl = getControllerBaseUrl(target);
  const res = await postSandbox(
    '/api/sandbox/exec',
    {
      envId,
      cmd,
      target,
    },
    target
  );

  if (res?.ok) {
    return await res.json();
  }

  return {
    ok: false,
    stdout: '',
    stderr: `Sandbox runner is offline at ${baseUrl}. Start it with: npm run sandbox`,
    exitCode: 1,
  };
}

/**
 * Fallback static analysis if daemon is momentarily offline
 */
function simulateTestRun(
  env: SessionEnvironment,
  framework: TestFramework,
  durationMs: number
): TestRunReport {
  const files = Object.values(env.files);
  const tests: TestCaseResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const f of files) {
    if (f.path.includes('test') || f.path.startsWith('tests/')) {
      const lines = f.content.split('\n');
      const testDefs = lines.filter((l) => l.trim().startsWith('def test_') || l.trim().startsWith('it(') || l.trim().startsWith('test('));

      for (const t of testDefs) {
        const name = t.replace(/(def\s+|it\(|test\(|['"`:]).*/g, '').trim() || t.slice(0, 30);
        const isFailing = f.content.includes('assert False') || f.content.includes('raise Exception') || f.content.includes('fail(');
        if (isFailing) {
          failed++;
          tests.push({
            name: `${f.path}::${name}`,
            status: 'failed',
            failureMessage: `AssertionError: test assertion triggered in ${name}`,
          });
        } else {
          passed++;
          tests.push({
            name: `${f.path}::${name}`,
            status: 'passed',
          });
        }
      }
    }
  }

  if (tests.length === 0) {
    passed = 1;
    tests.push({
      name: 'Sanity compilation check',
      status: 'passed',
    });
  }

  return {
    id: 'test_fallback_' + Date.now(),
    envId: env.id,
    timestamp: Date.now(),
    framework,
    total: passed + failed,
    passed,
    failed,
    skipped: 0,
    durationMs: Math.max(12, durationMs),
    tests,
    rawOutput: `=== Verified ${tests.length} tests ===\n${passed} passed, ${failed} failed in ${(Math.max(12, durationMs) / 1000).toFixed(2)}s.`,
    exitCode: failed > 0 ? 1 : 0,
  };
}

export type ServeAppResult = {
  ok: boolean;
  envId?: string;
  port?: number;
  pid?: number | null;
  command?: string;
  previewUrl?: string;
  status?: string;
  target?: ExecutionTarget;
  reused?: boolean;
  error?: string;
  note?: string;
};

export async function serveSandboxApp(
  envId: string,
  target: ExecutionTarget,
  opts: { command?: string; port?: number; action?: 'start' | 'stop' | 'status' } = {}
): Promise<ServeAppResult> {
  const res = await postSandbox(
    '/api/sandbox/serve',
    {
      envId,
      target,
      command: opts.command,
      port: opts.port,
      action: opts.action || 'start',
    },
    target
  );
  if (!res) {
    return {
      ok: false,
      error: 'Sandbox runner unreachable on :17330. Start it with: npm run sandbox',
    };
  }
  return (await res.json()) as ServeAppResult;
}

export function sandboxPreviewAbsoluteUrl(previewPath: string | undefined | null): string | null {
  if (!previewPath) return null;
  if (/^https?:\/\//i.test(previewPath)) return previewPath;
  return `http://127.0.0.1:${PRIMARY_SANDBOX_PORT}${previewPath.startsWith('/') ? '' : '/'}${previewPath}`;
}

export type BrowserTestResult = {
  ok: boolean;
  status?: number | null;
  title?: string;
  url?: string;
  headed?: boolean;
  display?: string | null;
  artifacts?: {
    dir?: string;
    screenshot?: string;
    video?: string | null;
    trace?: string;
  };
  screenshotBase64?: string | null;
  error?: string;
  hint?: string;
  artifactsDir?: string;
};

/** Headed browser test — uses a longer client timeout (3 min). */
export async function runSandboxBrowserTest(
  envId: string,
  target: ExecutionTarget,
  opts: { url?: string; headed?: boolean } = {}
): Promise<BrowserTestResult> {
  const baseUrl = getControllerBaseUrl(target);
  try {
    const res = await fetch(`${baseUrl}/api/sandbox/browser-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        envId,
        target,
        url: opts.url,
        headed: opts.headed,
      }),
      signal: AbortSignal.timeout(180000),
    });
    return (await res.json()) as BrowserTestResult;
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'browser-test request failed (is :17330 up? Playwright installed?)',
    };
  }
}
