import type { SessionEnvironment, ExecutionTarget } from '../../types';
import type { AgentBudgetTier, AgentToolName } from '../../types/agent';
import {
  materializeSandbox,
  runSandboxTests,
  buildSandbox,
  executeSandboxCommand,
  serveSandboxApp,
  runSandboxBrowserTest,
  sandboxPreviewAbsoluteUrl,
} from '../sandboxService';
import { runVisionHealRound, formatHealBrief } from './visionHeal';

export const TOOL_RESULT_CAP = 4000;
export const FILE_READ_CAP = 8000;
/**
 * Budgets disabled — no early stop on steps/exec/wall.
 * Infinity kept so older callers of resolveBudget still work; loop does not enforce.
 */
export const MAX_STEPS = Number.POSITIVE_INFINITY;
export const MAX_EXEC = Number.POSITIVE_INFINITY;
export const WALL_MS = Number.POSITIVE_INFINITY;

export type BudgetLimits = { maxSteps: number; maxExec: number; wallMs: number };

/** Tiers are no-ops (all unlimited). Retained for store/UI compat only. */
export const BUDGET_TIERS: Record<AgentBudgetTier, BudgetLimits> = {
  quick: { maxSteps: MAX_STEPS, maxExec: MAX_EXEC, wallMs: WALL_MS },
  standard: { maxSteps: MAX_STEPS, maxExec: MAX_EXEC, wallMs: WALL_MS },
  large: { maxSteps: MAX_STEPS, maxExec: MAX_EXEC, wallMs: WALL_MS },
};

export function resolveBudget(tier: AgentBudgetTier = 'large'): BudgetLimits {
  return BUDGET_TIERS[tier] || BUDGET_TIERS.large;
}

/** First-token allowlist. Matching is /^cmd\b/ — subcommands are not further gated here. */
const EXEC_ALLOW =
  /^(pytest|python3?|node|npm|npx|ls|cat|mkdir|pwd|head|wc|pip|ruff|which|echo|git|gh)\b/;

const SECRET_PATH_RE = /(^|\/)\.env($|\.)|(^|\/)\.git\/(config|credentials)$/i;

export function isSecretPath(rel: string): boolean {
  const n = String(rel || '').replace(/\\/g, '/');
  return SECRET_PATH_RE.test(n);
}

/** Soft refuse force-push targeting main/master (or --force to those refs). */
export function isForbiddenForcePush(cmd: string): boolean {
  const c = String(cmd || '').trim();
  if (!/\bgit\b/i.test(c) || !/\bpush\b/i.test(c)) return false;
  const force = /(\s|^)(--force|--force-with-lease|-f)(\s|$)/.test(c);
  if (!force) return false;
  return /\b(main|master)\b/.test(c);
}

export function redactCliSecrets(s: string): string {
  return String(s || '')
    .replace(/\bgho_[A-Za-z0-9]+/g, 'gho_[REDACTED]')
    .replace(/\bghp_[A-Za-z0-9]+/g, 'ghp_[REDACTED]')
    .replace(/\bghu_[A-Za-z0-9]+/g, 'ghu_[REDACTED]')
    .replace(/(Token\s*[:=]\s*)\S+/gi, '$1[REDACTED]');
}

export function looksLikeGhNotLoggedIn(text: string): boolean {
  const t = String(text || '').toLowerCase();
  return (
    /not logged in|you are not logged|to authenticate|gh auth login|no oauth|http 401|bad credentials/.test(
      t
    )
  );
}

export const AGENT_TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in the active sandbox environment (path + size bytes).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read a sandbox file by relative path. Optional offset (0-based line) and limit/maxLines for paging beyond the default cap.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          offset: { type: 'number', description: '0-based start line' },
          limit: { type: 'number', description: 'max lines to return' },
          maxLines: { type: 'number', description: 'alias for limit' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write a complete file into the sandbox (relative path, full contents). Prefer edit_file for small changes.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        'Apply a precise text replacement in an existing file (path + old_string + new_string). Fails clearly if old_string is missing or ambiguous.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_string: { type: 'string' },
          new_string: { type: 'string' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Search sandbox file contents for a substring or regex pattern. Optional path prefix filter.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          path: { type: 'string', description: 'optional path prefix / file filter' },
          regex: { type: 'boolean', description: 'treat pattern as regex (default false)' },
          max_hits: { type: 'number' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'exec',
      description:
        'Run a shell command in the sandbox. Allowlisted: pytest, python, node, npm, npx, ls, cat, mkdir, pwd, head, wc, pip, ruff, which, echo, git, gh. Prefer github tool for PRs/issues. No force-push to main/master; no reading .env.',
      parameters: {
        type: 'object',
        properties: { cmd: { type: 'string' } },
        required: ['cmd'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'test',
      description:
        'Run the sandbox test suite (pytest/vitest). Optional paths[] to focus on specific files (pytest path args / node test path via exec fallback).',
      parameters: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'optional subset of test files',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'build',
      description: 'Build or compile the sandbox project.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github',
      description:
        'GitHub helper via gh CLI (sandbox cwd). Actions: auth_status, pr_list, pr_view, pr_create, repo_view, issue_list. Surfaces "GitHub CLI not logged in" if gh auth is missing — user must run gh auth login. Prefer branch+PR over force-push to main.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'auth_status | pr_list | pr_view | pr_create | repo_view | issue_list',
          },
          number: { type: 'number', description: 'PR number for pr_view' },
          title: { type: 'string', description: 'PR title for pr_create' },
          body: { type: 'string', description: 'PR body for pr_create' },
          base: { type: 'string', description: 'base branch for pr_create' },
          head: { type: 'string', description: 'head branch for pr_create' },
          limit: { type: 'number', description: 'list limit (default 20)' },
          repo: { type: 'string', description: 'optional owner/repo override' },
        },
        required: ['action'],
      },
    },
  },
    {
    type: 'function',
    function: {
      name: 'vision_heal',
      description:
        'Capture headed browser screenshot, critique with vision/LayoutLMv3, return visual issues + fix hints. Iterate: edit files then call again until PASS.',
      parameters: {
        type: 'object',
        properties: {
          goal: { type: 'string' },
          url: { type: 'string' },
          round: { type: 'number' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pty_session',
      description:
        'Open or query interactive PTY on sandbox runner (ws /api/sandbox/pty) for interactive CLIs.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'status | hint' },
        },
        additionalProperties: false,
      },
    },
  },
{
    type: 'function',
    function: {
      name: 'serve_app',
      description:
        'Start (or reuse) a persistent sandbox dev server and return a preview URL on the sandbox runner reverse-proxy. Optional command/port.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'optional serve command; __PORT__ placeholder supported' },
          port: { type: 'number' },
          action: { type: 'string', description: 'start | stop | status (default start)' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_test',
      description:
        'Run a headed Playwright browser test against a URL or the live preview (screenshot + video/trace artifacts). Prefer after serve_app.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'absolute URL or runner preview path; defaults to live serve preview' },
          headed: { type: 'boolean', description: 'default true on Mac; Linux uses Xvfb when available' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_plan',
      description: 'Replace the run checklist with tasks. Pass tasks as an array of {id,title,status} objects (status: open|done|blocked).',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                status: { type: 'string' },
              },
            },
          },
        },
        required: ['tasks'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Update a checklist task by id (status: open|done|blocked; optional title).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['id'],
      },
    },
  },
];

export type AgentToolContext = {
  envId: string;
  getEnv: () => SessionEnvironment | null;
  writeFile: (path: string, content: string, language?: string) => void;
  target: ExecutionTarget;
};

export type AgentToolResult = {
  ok: boolean;
  tool: AgentToolName;
  text: string;
  testPassed?: boolean;
  buildOk?: boolean;
  browserTestOk?: boolean;
  previewUrl?: string;
  /** Hint for loop manifest / gates */
  meta?: {
    path?: string;
    op?: 'read' | 'write' | 'edit';
    bytes?: number;
    wroteCode?: boolean;
    wroteJsTs?: boolean;
  };
};

function cap(s: string, n = TOOL_RESULT_CAP): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '\n... [truncated]' : s;
}

export function safeRelPath(p: string): string | null {
  const n = String(p || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim();
  if (!n || n.includes('..') || n.startsWith('/') || n.includes('\0')) return null;
  return n;
}

export function langFromPath(p: string): string {
  if (p.endsWith('.py')) return 'python';
  if (p.endsWith('.ts') || p.endsWith('.tsx')) return 'typescript';
  if (p.endsWith('.js') || p.endsWith('.jsx')) return 'javascript';
  if (p.endsWith('.json')) return 'json';
  if (p.endsWith('.md')) return 'markdown';
  if (p.endsWith('.rs')) return 'rust';
  if (p.endsWith('.go')) return 'go';
  return 'text';
}

function sliceLines(content: string, offset?: number, limit?: number): { text: string; meta: string } {
  const lines = content.split('\n');
  const start = Math.max(0, Math.floor(offset || 0));
  const lim =
    limit != null && Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : undefined;
  if (start === 0 && lim == null) {
    return { text: cap(content, FILE_READ_CAP), meta: `lines 1-${lines.length} of ${lines.length}` };
  }
  const end = lim != null ? Math.min(lines.length, start + lim) : lines.length;
  const slice = lines.slice(start, end).join('\n');
  const budgeted = cap(slice, FILE_READ_CAP);
  return {
    text: budgeted,
    meta: `lines ${start + 1}-${Math.min(end, lines.length)} of ${lines.length}`,
  };
}

export function grepSandboxFiles(
  env: SessionEnvironment,
  pattern: string,
  opts: { pathPrefix?: string; regex?: boolean; maxHits?: number } = {}
): { ok: boolean; text: string } {
  if (!pattern) return { ok: false, text: 'grep requires pattern.' };
  let re: RegExp | null = null;
  if (opts.regex) {
    try {
      re = new RegExp(pattern, 'i');
    } catch (e: any) {
      return { ok: false, text: `Invalid regex: ${e?.message || e}` };
    }
  }
  const maxHits = Math.min(80, Math.max(1, opts.maxHits || 40));
  const prefix = opts.pathPrefix ? safeRelPath(opts.pathPrefix) : null;
  const hits: string[] = [];
  const paths = Object.keys(env.files).sort();
  for (const p of paths) {
    if (prefix) {
      const match =
        p === prefix ||
        p.startsWith(prefix.endsWith('/') ? prefix : prefix + '/');
      if (!match) continue;
    }
    const content = env.files[p]?.content || '';
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = re ? re.test(line) : line.toLowerCase().includes(pattern.toLowerCase());
      if (match) {
        hits.push(`${p}:${i + 1}: ${line.slice(0, 200)}`);
        if (hits.length >= maxHits) {
          return { ok: true, text: hits.join('\n') + `\n... [capped at ${maxHits} hits]` };
        }
      }
    }
  }
  return { ok: true, text: hits.length ? hits.join('\n') : '(no matches)' };
}

export async function executeAgentTool(
  name: string,
  rawArgs: Record<string, unknown>,
  ctx: AgentToolContext
): Promise<AgentToolResult> {
  const tool = name as AgentToolName;
  const env = ctx.getEnv();
  if (!env) {
    return { ok: false, tool: tool || 'list_files', text: 'No active sandbox environment.' };
  }

  if (tool === 'list_files') {
    const files = Object.keys(env.files).sort();
    return {
      ok: true,
      tool,
      text: files.length
        ? files
            .map((f) => {
              const size = env.files[f]?.sizeBytes ?? env.files[f]?.content?.length ?? 0;
              return `- ${f} (${size} B)`;
            })
            .join('\n')
        : '(empty sandbox)',
    };
  }

  if (tool === 'read_file') {
    const path = safeRelPath(String(rawArgs.path || ''));
    if (!path) return { ok: false, tool, text: 'Invalid path.' };
    if (isSecretPath(path)) {
      return { ok: false, tool, text: `Refusing to read secret path: ${path}` };
    }
    const file = env.files[path];
    if (!file) return { ok: false, tool, text: `Not found: ${path}` };
    const offset = rawArgs.offset != null ? Number(rawArgs.offset) : undefined;
    const limit =
      rawArgs.limit != null
        ? Number(rawArgs.limit)
        : rawArgs.maxLines != null
        ? Number(rawArgs.maxLines)
        : undefined;
    const sliced = sliceLines(file.content, offset, limit);
    return {
      ok: true,
      tool,
      text: `# ${path} (${sliced.meta})\n${sliced.text}`,
      meta: { path, op: 'read', bytes: file.content.length },
    };
  }

  if (tool === 'write_file') {
    const path = safeRelPath(String(rawArgs.path || ''));
    const content = String(rawArgs.content ?? '');
    if (!path) return { ok: false, tool, text: 'Invalid path.' };
    if (isSecretPath(path)) {
      return { ok: false, tool, text: `Refusing to write secret path: ${path}` };
    }
    if (!content.trim()) return { ok: false, tool, text: 'Empty content.' };
    ctx.writeFile(path, content, langFromPath(path));
    const next = ctx.getEnv();
    if (next) {
      try {
        await materializeSandbox(next, ctx.target);
      } catch (e: any) {
        return { ok: false, tool, text: e?.message || 'materialize failed' };
      }
    }
    const wroteJsTs = /\.(js|jsx|ts|tsx)$/i.test(path);
    const wroteCode = /\.(py|js|jsx|ts|tsx|go|rs|java)$/i.test(path);
    return {
      ok: true,
      tool,
      text: `Wrote ${path} (${content.length} bytes)`,
      meta: { path, op: 'write', bytes: content.length, wroteCode, wroteJsTs },
    };
  }

  if (tool === 'edit_file') {
    const path = safeRelPath(String(rawArgs.path || ''));
    const oldStr = String(rawArgs.old_string ?? rawArgs.oldString ?? '');
    const newStr = String(rawArgs.new_string ?? rawArgs.newString ?? '');
    if (!path) return { ok: false, tool, text: 'Invalid path.' };
    if (isSecretPath(path)) {
      return { ok: false, tool, text: `Refusing to edit secret path: ${path}` };
    }
    if (!oldStr) return { ok: false, tool, text: 'edit_file requires old_string.' };
    const file = env.files[path];
    if (!file) return { ok: false, tool, text: `Not found: ${path}` };
    const content = file.content;
    const first = content.indexOf(oldStr);
    if (first < 0) {
      return {
        ok: false,
        tool,
        text: `old_string not found in ${path}. Re-read the file and retry with an exact contiguous snippet.`,
      };
    }
    const second = content.indexOf(oldStr, first + oldStr.length);
    if (second >= 0) {
      return {
        ok: false,
        tool,
        text: `old_string matched multiple times in ${path}. Provide a larger unique snippet.`,
      };
    }
    const nextContent = content.slice(0, first) + newStr + content.slice(first + oldStr.length);
    ctx.writeFile(path, nextContent, langFromPath(path));
    const next = ctx.getEnv();
    if (next) {
      try {
        await materializeSandbox(next, ctx.target);
      } catch (e: any) {
        return { ok: false, tool, text: e?.message || 'materialize failed' };
      }
    }
    const wroteJsTs = /\.(js|jsx|ts|tsx)$/i.test(path);
    const wroteCode = /\.(py|js|jsx|ts|tsx|go|rs|java)$/i.test(path);
    return {
      ok: true,
      tool,
      text: `Edited ${path} (Δ ${newStr.length - oldStr.length} chars, now ${nextContent.length} bytes)`,
      meta: { path, op: 'edit', bytes: nextContent.length, wroteCode, wroteJsTs },
    };
  }

  if (tool === 'grep') {
    const pattern = String(rawArgs.pattern || rawArgs.query || '');
    const r = grepSandboxFiles(env, pattern, {
      pathPrefix: rawArgs.path ? String(rawArgs.path) : undefined,
      regex: Boolean(rawArgs.regex),
      maxHits: rawArgs.max_hits != null ? Number(rawArgs.max_hits) : undefined,
    });
    return { ok: r.ok, tool, text: r.text };
  }

  if (tool === 'exec') {
    const cmd = String(rawArgs.cmd || '').trim();
    if (!cmd || !EXEC_ALLOW.test(cmd)) {
      return { ok: false, tool, text: `Command not allowlisted: ${cmd.slice(0, 80)}` };
    }
    if (isForbiddenForcePush(cmd)) {
      return {
        ok: false,
        tool,
        text: 'Refused: git push --force to main/master. Prefer a branch + pull request.',
      };
    }
    // Soft block reading secret files via cat/head
    if (/\b(cat|head|less|more)\b/.test(cmd) && isSecretPath(cmd.replace(/^.*?\s+/, '').trim().split(/\s+/)[0] || '')) {
      return { ok: false, tool, text: 'Refusing to read secret path via exec.' };
    }
    const live = ctx.getEnv();
    if (live) {
      try {
        await materializeSandbox(live, ctx.target);
      } catch (e: any) {
        return { ok: false, tool, text: e?.message || 'materialize failed' };
      }
    }
    const res = await executeSandboxCommand(env.id, cmd, ctx.target);
    let body = cap((res.stdout || '') + (res.stderr ? '\n' + res.stderr : ''));
    if (/^gh\b/.test(cmd)) body = redactCliSecrets(body);
    if (/^gh\b/.test(cmd) && looksLikeGhNotLoggedIn(body)) {
      return {
        ok: false,
        tool,
        text: `GitHub CLI not logged in. Run: gh auth login\n${body || '(no output)'}`,
      };
    }
    return {
      ok: res.exitCode === 0,
      tool,
      text: `exit ${res.exitCode}\n${body || '(no output)'}`,
    };
  }

  if (tool === 'test') {
    const live = ctx.getEnv();
    if (!live) return { ok: false, tool, text: 'No env.' };
    const pathsArg = rawArgs.paths;
    const pathList = Array.isArray(pathsArg)
      ? pathsArg.map((p) => safeRelPath(String(p))).filter(Boolean) as string[]
      : [];

    // Incremental / path-focused: allowlisted pytest/node via exec when paths given
    if (pathList.length) {
      try {
        await materializeSandbox(live, ctx.target);
      } catch (e: any) {
        return { ok: false, tool, text: e?.message || 'materialize failed' };
      }
      const hasPy = pathList.some((p) => p.endsWith('.py')) || Object.keys(live.files).some((f) => f.endsWith('.py'));
      const cmd = hasPy
        ? `pytest ${pathList.join(' ')} -q`
        : `npx --yes vitest run ${pathList.join(' ')}`;
      if (!EXEC_ALLOW.test(cmd)) {
        return { ok: false, tool, text: 'Focused test command not allowlisted.' };
      }
      const res = await executeSandboxCommand(env.id, cmd, ctx.target);
      const body = cap((res.stdout || '') + (res.stderr ? '\n' + res.stderr : ''));
      const passed = res.exitCode === 0;
      return {
        ok: passed,
        tool,
        text: `focused test exit ${res.exitCode}\n${body || '(no output)'}`,
        testPassed: passed,
      };
    }

    const report = await runSandboxTests(live, ctx.target);
    const failed = report.tests.filter((t) => t.status === 'failed').slice(0, 8);
    const lines = [
      `${report.framework}: ${report.passed}/${report.total} passed  ${report.failed} failed  exit ${report.exitCode}`,
      ...failed.map((t) => `- ${t.name}: ${t.failureMessage || 'failed'}`),
      cap(report.rawOutput || '', 2000),
    ];
    return {
      ok: report.exitCode === 0 && report.failed === 0,
      tool,
      text: lines.filter(Boolean).join('\n'),
      testPassed: report.exitCode === 0 && report.failed === 0,
    };
  }

  if (tool === 'build') {
    const live = ctx.getEnv();
    if (!live) return { ok: false, tool, text: 'No env.' };
    const report = await buildSandbox(live, ctx.target);
    return {
      ok: report.success,
      tool,
      text: `build exit ${report.exitCode}\n${cap(report.output || '')}`,
      buildOk: report.success,
    };
  }



  if (tool === 'vision_heal') {
    const live = ctx.getEnv();
    if (!live) return { ok: false, tool, text: 'No env.' };
    const goal = String(rawArgs.goal || 'Match the requested UI polish and accessibility.');
    const round = Number(rawArgs.round) || 1;
    const url = rawArgs.url ? String(rawArgs.url) : undefined;
    try {
      const result = await runVisionHealRound({
        envId: env.id,
        target: ctx.target,
        goal,
        url,
        round,
      });
      return {
        ok: result.ok,
        tool,
        text: formatHealBrief(result),
        browserTestOk: result.ok,
        testPassed: result.ok ? true : undefined,
      };
    } catch (e: any) {
      return { ok: false, tool, text: e?.message || 'vision_heal failed' };
    }
  }

  if (tool === 'pty_session') {
    try {
      const res = await fetch('http://127.0.0.1:17330/api/sandbox/pty/status', {
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      const action = String(rawArgs.action || 'status');
      if (action === 'hint') {
        return {
          ok: Boolean(data.available),
          tool,
          text: data.available
            ? `PTY ready. Connect WebSocket to ws://127.0.0.1:17330/api/sandbox/pty?envId=${env.id} (xterm in chat). Write interactive prompts via the PTY bubble.`
            : 'PTY unavailable. On Mac: npm i node-pty ws && restart sandbox runner.',
        };
      }
      return {
        ok: true,
        tool,
        text: JSON.stringify(data, null, 2),
      };
    } catch (e: any) {
      return { ok: false, tool, text: e?.message || 'pty status failed' };
    }
  }

  if (tool === 'serve_app') {
    const live = ctx.getEnv();
    if (!live) return { ok: false, tool, text: 'No env.' };
    try {
      await materializeSandbox(live, ctx.target);
    } catch (e: any) {
      return { ok: false, tool, text: e?.message || 'materialize failed' };
    }
    const action = String(rawArgs.action || 'start').toLowerCase() as 'start' | 'stop' | 'status';
    const result = await serveSandboxApp(env.id, ctx.target, {
      command: rawArgs.command ? String(rawArgs.command) : undefined,
      port: rawArgs.port != null ? Number(rawArgs.port) : undefined,
      action,
    });
    if (!result.ok) {
      return { ok: false, tool, text: result.error || 'serve_app failed' };
    }
    const abs = sandboxPreviewAbsoluteUrl(result.previewUrl) || result.previewUrl || '';
    try {
      const { useSandboxStore } = require('../../stores/useSandboxStore');
      const s = useSandboxStore.getState();
      if (abs) {
        s.setDrawerOpen(true);
        s.setDrawerTab('preview');
        // @ts-ignore
        useSandboxStore.setState({ webPreviewUrl: abs });
      }
    } catch {}
    return {
      ok: true,
      tool,
      text: `serve ${result.status || 'running'} port=${result.port} pid=${result.pid}\npreview=${abs}\ncommand=${result.command || ''}`,
      previewUrl: abs || undefined,
    };
  }

  if (tool === 'browser_test') {
    const live = ctx.getEnv();
    if (!live) return { ok: false, tool, text: 'No env.' };
    try {
      await materializeSandbox(live, ctx.target);
    } catch (e: any) {
      return { ok: false, tool, text: e?.message || 'materialize failed' };
    }
    const url = rawArgs.url ? String(rawArgs.url) : undefined;
    const headed = rawArgs.headed == null ? true : Boolean(rawArgs.headed);
    const result = await runSandboxBrowserTest(env.id, ctx.target, { url, headed });
    if (!result.ok) {
      return {
        ok: false,
        tool,
        text: `${result.error || 'browser_test failed'}${result.hint ? '\n' + result.hint : ''}`,
        browserTestOk: false,
      };
    }
    return {
      ok: true,
      tool,
      text: [
        `browser_test OK headed=${result.headed} status=${result.status} title=${result.title}`,
        `url=${result.url}`,
        `screenshot=${result.artifacts?.screenshot || 'n/a'}`,
        `video=${result.artifacts?.video || 'n/a'}`,
        `trace=${result.artifacts?.trace || 'n/a'}`,
      ].join('\n'),
      browserTestOk: true,
      testPassed: true,
    };
  }

  if (tool === 'github') {
    const action = String(rawArgs.action || '').trim().toLowerCase();
    const limit = Math.min(50, Math.max(1, Number(rawArgs.limit) || 20));
    const repo = rawArgs.repo ? String(rawArgs.repo).trim() : '';
    const repoFlag = repo && /^[\w.-]+\/[\w.-]+$/.test(repo) ? ` -R ${repo}` : '';

    const live = ctx.getEnv();
    if (live) {
      try {
        await materializeSandbox(live, ctx.target);
      } catch (e: any) {
        return { ok: false, tool, text: e?.message || 'materialize failed' };
      }
    }

    const runGh = async (cmd: string) => {
      const res = await executeSandboxCommand(env.id, cmd, ctx.target);
      const body = redactCliSecrets(
        cap((res.stdout || '') + (res.stderr ? '\n' + res.stderr : ''))
      );
      return { res, body };
    };

    // Always probe auth for non-auth_status when possible
    if (action !== 'auth_status') {
      const probe = await runGh('gh auth status');
      if (probe.res.exitCode !== 0 || looksLikeGhNotLoggedIn(probe.body)) {
        return {
          ok: false,
          tool,
          text: `GitHub CLI not logged in. Run: gh auth login\n${probe.body || '(no output)'}`,
        };
      }
    }

    let cmd = '';
    if (action === 'auth_status') {
      cmd = 'gh auth status';
    } else if (action === 'pr_list') {
      cmd = `gh pr list${repoFlag} --limit ${limit}`;
    } else if (action === 'pr_view') {
      const num = Number(rawArgs.number);
      if (!Number.isFinite(num) || num <= 0) {
        return { ok: false, tool, text: 'pr_view requires number (PR #).' };
      }
      cmd = `gh pr view ${Math.floor(num)}${repoFlag}`;
    } else if (action === 'pr_create') {
      const title = String(rawArgs.title || '').trim();
      const body = String(rawArgs.body || '').trim();
      if (!title) return { ok: false, tool, text: 'pr_create requires title.' };
      const base = rawArgs.base ? String(rawArgs.base).trim() : '';
      const head = rawArgs.head ? String(rawArgs.head).trim() : '';
      const q = (s: string) => `'${s.replace(/'/g, `'"'"'`)}'`;
      cmd = `gh pr create${repoFlag} --title ${q(title)} --body ${q(body || title)}`;
      if (base) cmd += ` --base ${q(base)}`;
      if (head) cmd += ` --head ${q(head)}`;
    } else if (action === 'repo_view') {
      cmd = repo ? `gh repo view ${repo}` : 'gh repo view';
    } else if (action === 'issue_list') {
      cmd = `gh issue list${repoFlag} --limit ${limit}`;
    } else {
      return {
        ok: false,
        tool,
        text: `Unknown github action: ${action}. Use auth_status|pr_list|pr_view|pr_create|repo_view|issue_list.`,
      };
    }

    const { res, body } = await runGh(cmd);
    if (action === 'auth_status' && (res.exitCode !== 0 || looksLikeGhNotLoggedIn(body))) {
      return {
        ok: false,
        tool,
        text: `GitHub CLI not logged in. Run: gh auth login\n${body || '(no output)'}`,
      };
    }
    return {
      ok: res.exitCode === 0,
      tool,
      text: `exit ${res.exitCode}\n${body || '(no output)'}`,
    };
  }

  // set_plan / update_task handled in loop (need run mutation) — stub for direct calls
  if (tool === 'set_plan' || tool === 'update_task') {
    return {
      ok: false,
      tool,
      text: `${tool} must be handled by the agent loop (plan state).`,
    };
  }

  return { ok: false, tool: 'list_files', text: `Unknown tool: ${name}` };
}
