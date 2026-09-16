import { create } from 'zustand';
import {
  SandboxStatus,
  ExecutionTarget,
  TestRunReport,
  BuildReport,
} from '../types';
import { useChatStore } from './useChatStore';
import {
  materializeSandbox,
  runSandboxTests,
  buildSandbox,
  executeSandboxCommand,
  detectRuntimeAndFramework,
  serveSandboxApp,
  runSandboxBrowserTest,
  sandboxPreviewAbsoluteUrl,
  type BrowserTestResult,
} from '../services/sandboxService';

interface SandboxState {
  status: SandboxStatus;
  target: ExecutionTarget;
  activeEnvId: string | null;
  logs: string[];
  activeTestReport: TestRunReport | null;
  activeBuildReport: BuildReport | null;
  isDrawerOpen: boolean;
  autoTestOnResponse: boolean;
  webPreviewUrl: string | null;
  runningCodeBlockIndex: number | null;
  drawerTab: 'terminal' | 'preview' | 'browser';
  lastBrowserTest: BrowserTestResult | null;

  // Actions
  setDrawerOpen: (open: boolean) => void;
  setDrawerTab: (tab: 'terminal' | 'preview' | 'browser') => void;
  setTarget: (target: ExecutionTarget) => void;
  setAutoTestOnResponse: (val: boolean) => void;
  appendLog: (line: string) => void;
  clearLogs: () => void;
  materializeActiveEnv: () => Promise<boolean>;
  runTestsForEnv: (envId?: string) => Promise<TestRunReport | null>;
  runCodeBlock: (filename?: string, code?: string, index?: number) => Promise<void>;
  buildActiveEnv: () => Promise<BuildReport | null>;
  runCommandInSandbox: (cmd: string) => Promise<void>;
  serveActiveApp: (command?: string) => Promise<string | null>;
  runBrowserTestForEnv: (url?: string) => Promise<BrowserTestResult | null>;
  autoFixWithSpark: (errorMessage: string) => void;
}

export const useSandboxStore = create<SandboxState>((set, get) => ({
  status: 'idle',
  target: 'local_mac',
  activeEnvId: null,
  logs: [
    '⚡ Ephemeral Sandbox Ready',
    'Target: Mac Local Host (/tmp/spark-sandboxes)',
    'Type commands or tap [Run Tests] / [Build] to execute code in sandbox.',
  ],
  activeTestReport: null,
  activeBuildReport: null,
  isDrawerOpen: false,
  autoTestOnResponse: false,
  webPreviewUrl: null,
  runningCodeBlockIndex: null,
  drawerTab: 'terminal',
  lastBrowserTest: null,

  setDrawerOpen: (open: boolean) => set({ isDrawerOpen: open }),
  setDrawerTab: (tab) => set({ drawerTab: tab }),
  setTarget: (target: ExecutionTarget) => set({ target }),
  setAutoTestOnResponse: (val: boolean) => set({ autoTestOnResponse: val }),

  appendLog: (line: string) => {
    set((state) => ({
      logs: [...state.logs.slice(-500), line],
    }));
  },

  clearLogs: () => {
    set({
      logs: ['⚡ Terminal logs cleared.'],
    });
  },

  materializeActiveEnv: async () => {
    const activeEnv = useChatStore.getState().getActiveEnvironment();
    if (!activeEnv) return false;

    set({ status: 'materializing', activeEnvId: activeEnv.id });
    get().appendLog(`\n[Sandbox] Syncing ${Object.keys(activeEnv.files).length} files to /tmp/spark-sandboxes/${activeEnv.id}...`);

    try {
      const info = await materializeSandbox(activeEnv, get().target);
      get().appendLog(`[Sandbox] Materialized sandbox at ${info.path} (Runtime: ${info.runtime}, Target: ${info.target})`);
      set({ status: 'idle' });
      return true;
    } catch (err: any) {
      get().appendLog(`[Sandbox Error] Materialization failed: ${err.message}`);
      set({ status: 'failed' });
      return false;
    }
  },

  runTestsForEnv: async (envId?: string) => {
    const activeEnv = useChatStore.getState().getActiveEnvironment();
    if (!activeEnv) return null;

    set({
      status: 'testing',
      activeEnvId: activeEnv.id,
      isDrawerOpen: true,
    });

    const meta = detectRuntimeAndFramework(activeEnv.files);
    get().appendLog(`\n────────────────────────────────────────────────────────────`);
    get().appendLog(`⚡ [RUN TESTS] Environment: ${activeEnv.name || activeEnv.id}`);
    get().appendLog(`Framework: ${meta.framework} | Runtime: ${meta.runtime} | Target: ${get().target}`);
    get().appendLog(`────────────────────────────────────────────────────────────`);

    try {
      const report = await runSandboxTests(activeEnv, get().target);
      const passedBadge = report.failed === 0 ? '✓ PASSED' : '✗ FAILED';

      get().appendLog(report.rawOutput);
      get().appendLog(`\n[Results] ${passedBadge}: ${report.passed}/${report.total} passed, ${report.failed} failed (${(report.durationMs / 1000).toFixed(2)}s)`);

      set({
        status: report.failed === 0 ? 'success' : 'failed',
        activeTestReport: report,
      });

      return report;
    } catch (err: any) {
      get().appendLog(`[Test Error] Execution failed: ${err.message}`);
      set({ status: 'failed' });
      return null;
    }
  },

  runCodeBlock: async (filename?: string, code?: string, index?: number) => {
    const activeEnv = useChatStore.getState().getActiveEnvironment();
    if (!activeEnv) return;

    set({
      status: 'running',
      activeEnvId: activeEnv.id,
      isDrawerOpen: true,
      runningCodeBlockIndex: index ?? null,
    });

    const targetFile = filename || 'script_exec.py';
    get().appendLog(`\n────────────────────────────────────────────────────────────`);
    get().appendLog(`⚡ [EXECUTE] Running file: ${targetFile}`);
    get().appendLog(`────────────────────────────────────────────────────────────`);

    // Ensure environment is materialized with this file
    if (filename && code) {
      useChatStore.getState().addOrUpdateFile(activeEnv.id, filename, code);
    }
    await get().materializeActiveEnv();

    const isPy = targetFile.endsWith('.py');
    const isNode = targetFile.endsWith('.ts') || targetFile.endsWith('.js');
    const isSh = targetFile.endsWith('.sh') || targetFile.endsWith('.bash');

    const quoted = `'${String(targetFile).replace(/'/g, `'\\''`)}'`;
    let execCmd = `python3 ${quoted}`;
    if (isNode) execCmd = `node ${quoted}`;
    if (isSh) execCmd = `bash ${quoted}`;

    try {
      get().appendLog(`$ ${execCmd}`);
      const res = await executeSandboxCommand(activeEnv.id, execCmd, get().target);
      if (res.stdout) get().appendLog(res.stdout);
      if (res.stderr) get().appendLog(`[STDERR]\n${res.stderr}`);
      get().appendLog(`\n[Process exited with code ${res.exitCode}]`);

      set({
        status: res.exitCode === 0 ? 'success' : 'failed',
        runningCodeBlockIndex: null,
      });
    } catch (err: any) {
      get().appendLog(`[Exec Error] Failed: ${err.message}`);
      set({ status: 'failed', runningCodeBlockIndex: null });
    }
  },

  buildActiveEnv: async () => {
    const activeEnv = useChatStore.getState().getActiveEnvironment();
    if (!activeEnv) return null;

    set({
      status: 'building',
      activeEnvId: activeEnv.id,
      isDrawerOpen: true,
    });

    get().appendLog(`\n────────────────────────────────────────────────────────────`);
    get().appendLog(`🔨 [BUILD] Checking syntax and compiling: ${activeEnv.name}`);
    get().appendLog(`────────────────────────────────────────────────────────────`);

    try {
      const report = await buildSandbox(activeEnv, get().target);
      get().appendLog(report.output);
      get().appendLog(`\n[Build] ${report.success ? '✓ Build Succeeded' : '✗ Build Failed'} (${(report.durationMs / 1000).toFixed(2)}s)`);

      set({
        status: report.success ? 'success' : 'failed',
        activeBuildReport: report,
      });

      return report;
    } catch (err: any) {
      get().appendLog(`[Build Error] ${err.message}`);
      set({ status: 'failed' });
      return null;
    }
  },

  runCommandInSandbox: async (cmd: string) => {
    const activeEnv = useChatStore.getState().getActiveEnvironment();
    if (!activeEnv) return;

    set({ status: 'running' });
    get().appendLog(`\n$ ${cmd}`);

    try {
      await get().materializeActiveEnv();
      const res = await executeSandboxCommand(activeEnv.id, cmd, get().target);
      if (res.stdout) get().appendLog(res.stdout);
      if (res.stderr) get().appendLog(res.stderr);
      get().appendLog(`[Exit code: ${res.exitCode}]`);
      set({ status: res.exitCode === 0 ? 'idle' : 'failed' });
    } catch (err: any) {
      get().appendLog(`[Error] ${err.message}`);
      set({ status: 'failed' });
    }
  },

  serveActiveApp: async (command?: string) => {
    const activeEnv = useChatStore.getState().getActiveEnvironment();
    if (!activeEnv) return null;
    set({ status: 'running', isDrawerOpen: true, drawerTab: 'preview' });
    get().appendLog(`\n[Serve] Starting persistent app for ${activeEnv.id}...`);
    try {
      await get().materializeActiveEnv();
      const result = await serveSandboxApp(activeEnv.id, get().target, { command, action: 'start' });
      if (!result.ok) {
        get().appendLog(`[Serve Error] ${result.error || 'failed'}`);
        set({ status: 'failed' });
        return null;
      }
      const abs = sandboxPreviewAbsoluteUrl(result.previewUrl);
      get().appendLog(`[Serve] ${result.reused ? 'Reused' : 'Started'} :${result.port} pid=${result.pid}`);
      get().appendLog(`[Serve] Preview ${abs}`);
      set({ status: 'success', webPreviewUrl: abs });
      return abs;
    } catch (err: any) {
      get().appendLog(`[Serve Error] ${err.message}`);
      set({ status: 'failed' });
      return null;
    }
  },

  runBrowserTestForEnv: async (url?: string) => {
    const activeEnv = useChatStore.getState().getActiveEnvironment();
    if (!activeEnv) return null;
    set({ status: 'testing', isDrawerOpen: true, drawerTab: 'browser' });
    get().appendLog(`\n[BrowserTest] Headed Playwright against ${url || 'live preview'}...`);
    try {
      await get().materializeActiveEnv();
      const preview = get().webPreviewUrl;
      if (!preview && !url) {
        await get().serveActiveApp();
      }
      const result = await runSandboxBrowserTest(activeEnv.id, get().target, {
        url: url || get().webPreviewUrl || undefined,
        headed: true,
      });
      if (result.ok) {
        get().appendLog(`[BrowserTest] OK title=${result.title} status=${result.status}`);
        get().appendLog(`[BrowserTest] screenshot=${result.artifacts?.screenshot || 'n/a'}`);
        set({ status: 'success', lastBrowserTest: result });
      } else {
        get().appendLog(`[BrowserTest Error] ${result.error}`);
        if (result.hint) get().appendLog(`[BrowserTest Hint] ${result.hint}`);
        set({ status: 'failed', lastBrowserTest: result });
      }
      return result;
    } catch (err: any) {
      get().appendLog(`[BrowserTest Error] ${err.message}`);
      set({ status: 'failed' });
      return null;
    }
  },

  autoFixWithSpark: (errorMessage: string) => {
    const activeEnv = useChatStore.getState().getActiveEnvironment();
    const envName = activeEnv?.name || 'sandbox';

    const prompt = `The tests/build failed in temporary environment "${envName}" with the following error output:

\`\`\`
${errorMessage.slice(0, 2000)}
\`\`\`

Please analyze the root cause of this failure, update the affected files, and provide the corrected code blocks so the sandbox tests can pass.`;

    // Close terminal drawer, send message to chat
    set({ isDrawerOpen: false });
    useChatStore.getState().sendMessage(prompt);
  },
}));
