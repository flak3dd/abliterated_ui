import { resolveApiUrl } from '../apiConfig';
import type { AgentBudgetTier, AgentRun, AgentStep, AgentToolName } from '../../types/agent';
import {
  AGENT_TOOL_SCHEMAS,
  executeAgentTool,
  type AgentToolContext,
} from './tools';
import {
  CHECKPOINT_PATH,
  READONLY_TOOLS,
  EXEC_TOOLS,
  advancePhase,
  applyPlanTool,
  buildArtifacts,
  buildCheckpoint,
  compactToolMessages,
  evaluateVerifyPolicy,
  phaseNudge,
  resumeContextBlob,
  upsertManifest,
} from './context';

const SYSTEM = `You are the Spark BUILD agent on NVIDIA GB10 (unified LPDDR5x, vLLM :8000, sandbox runner).
Complete the user's software task by calling tools.

Workflow:
- Explore with list_files / read_file / grep before writing or overwriting.
- For multi-file work: call set_plan with a short checklist, then implement file-by-file; update_task as you go.
- Prefer edit_file (old_string/new_string) for small changes; use write_file only for new files or full rewrites.
- Batch related reads; keep writes focused.
- After writes: call test (optional paths[] for focused runs). For Node/TypeScript also build when package.json exists.
- Do not stop on the first green if the goal lists more deliverables — finish remaining checklist items, then summarize.

GitHub / git (sandbox):
- Prefer the github tool for auth_status, pr_list, pr_view, pr_create, repo_view, issue_list.
- Or exec with allowlisted git/gh (status, diff, add, commit, push, clone, pr create/view).
- Only the user's repos; prefer branch + PR over pushing straight to main.
- Never force-push to main/master; never read .env or scrape secrets from logs; never invent tokens.
- If gh is not logged in, tell the user to run: gh auth login
- No deploy or image generation via this agent.`;

type ChatMsg = {
  role: string;
  content?: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
};

export type AgentLoopHooks = {
  host: string;
  port: number;
  model: string;
  goal: string;
  run: AgentRun;
  ctx: AgentToolContext;
  signal: AbortSignal;
  onUpdate: (run: AgentRun, content: string) => void;
  /** Budget tier; defaults to run.budgetTier || 'large' */
  budgetTier?: AgentBudgetTier;
  /** When continuing, seed messages with prior compact context */
  resumeFrom?: AgentRun;
};

function previewArgs(args: Record<string, unknown>): string {
  if (args.path) return String(args.path);
  if (args.cmd) return String(args.cmd).slice(0, 80);
  if (args.pattern) return String(args.pattern).slice(0, 60);
  if (args.id) return String(args.id);
  if (Array.isArray(args.tasks)) return `${args.tasks.length} tasks`;
  return '';
}

export function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { content: raw };
  }
}

export function extractToolCalls(msg: any): { id: string; name: string; args: Record<string, unknown> }[] {
  const calls = msg?.tool_calls;
  if (Array.isArray(calls) && calls.length) {
    return calls.map((c: any, i: number) => ({
      id: String(c.id || 'call_' + i),
      name: String(c.function?.name || c.name || ''),
      args: parseArgs(c.function?.arguments ?? c.arguments),
    }));
  }
  const content = String(msg?.content || '');
  const xml = content.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i);
  if (xml) {
    try {
      const parsed = JSON.parse(xml[1]);
      return [
        {
          id: 'call_xml',
          name: String(parsed.name || parsed.function || ''),
          args: parseArgs(parsed.arguments || parsed.parameters || parsed),
        },
      ];
    } catch {
      /* fall through */
    }
  }
  const named = content.match(/"name"\s*:\s*"([a-z_]+)"[\s\S]*"arguments"\s*:\s*(\{[\s\S]*\})/);
  if (named) {
    return [{ id: 'call_json', name: named[1], args: parseArgs(named[2]) }];
  }
  return [];
}

async function completeOnce(
  host: string,
  port: number,
  model: string,
  messages: ChatMsg[],
  signal: AbortSignal
): Promise<any> {
  const url = resolveApiUrl(host, port, '/v1/chat/completions');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      tools: AGENT_TOOL_SCHEMAS,
      tool_choice: 'auto',
      temperature: 0.1,
      max_tokens: 4096,
      stream: false,
    }),
    signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('vLLM HTTP ' + res.status + (t ? ': ' + t.slice(0, 180) : ''));
  }
  return res.json();
}

function persistCheckpoint(run: AgentRun, ctx: AgentToolContext) {
  try {
    const json = buildCheckpoint(run);
    ctx.writeFile(CHECKPOINT_PATH, json, 'json');
  } catch {
    /* best-effort */
  }
}

function envHasPackageJson(ctx: AgentToolContext): boolean {
  const env = ctx.getEnv();
  return Boolean(env?.files?.['package.json']);
}

export async function runBuildAgent(hooks: AgentLoopHooks): Promise<AgentRun> {
  const { host, port, model, goal, ctx, signal, onUpdate, resumeFrom } = hooks;
  const tier: AgentBudgetTier = hooks.budgetTier || hooks.run.budgetTier || 'large';
  // Budgets disabled — tier label kept for UI/compat only; no step/exec/wall enforcement.
  let run: AgentRun = {
    ...hooks.run,
    steps: [...hooks.run.steps],
    budgetTier: tier,
    phase: hooks.run.phase || (resumeFrom ? resumeFrom.phase || 'implement' : 'explore'),
    plan: hooks.run.plan || resumeFrom?.plan,
    fileManifest: hooks.run.fileManifest || (resumeFrom ? [...(resumeFrom.fileManifest || [])] : []),
    artifacts: hooks.run.artifacts || resumeFrom?.artifacts,
    resumedFromId: hooks.run.resumedFromId || resumeFrom?.id,
  };
  let verifyNudgeUsed = false;

  const messages: ChatMsg[] = [
    { role: 'system', content: SYSTEM },
  ];
  if (resumeFrom) {
    messages.push({ role: 'user', content: resumeContextBlob(resumeFrom) });
    messages.push({
      role: 'user',
      content: `Continue goal: ${goal}`,
    });
  } else {
    messages.push({ role: 'user', content: goal });
  }

  const patch = (partial: Partial<AgentRun>, content?: string) => {
    run = {
      ...run,
      ...partial,
      updatedAt: Date.now(),
      artifacts: buildArtifacts({ ...run, ...partial }),
    };
    const summary =
      content ??
      run.summary ??
      run.steps
        .map((s) => `${s.status === 'ok' ? '✓' : s.status === 'error' ? '✗' : '…'} ${s.tool}${s.argsPreview ? ' ' + s.argsPreview : ''}`)
        .join('\n');
    onUpdate(run, summary);
    persistCheckpoint(run, ctx);
  };

  const injectRoundNudge = () => {
    const phase = run.phase || 'explore';
    const nudge = phaseNudge(phase, run.plan || []);
    // Replace or append a trailing system nudge (avoid unbounded growth: keep one)
    const marker = '[agent-round-nudge]';
    const last = messages[messages.length - 1];
    if (last?.role === 'system' && String(last.content || '').includes(marker)) {
      messages[messages.length - 1] = { role: 'system', content: `${marker}\n${nudge}` };
    } else {
      messages.push({ role: 'system', content: `${marker}\n${nudge}` });
    }
  };

  try {
    // No MAX_STEPS / WALL_MS / MAX_EXEC enforcement — only abort/cancel stops the loop.
    for (let i = 0; ; i++) {
      if (signal.aborted) {
        patch({ status: 'cancelled', error: 'Stopped', phase: run.phase });
        return run;
      }

      injectRoundNudge();
      const data = await completeOnce(host, port, model, messages, signal);
      const msg = data?.choices?.[0]?.message || {};
      const calls = extractToolCalls(msg).filter((c) => c.name);

      if (!calls.length) {
        const text = String(msg.content || '').trim() || 'Agent finished.';
        const verify = evaluateVerifyPolicy(run, envHasPackageJson(ctx));
        if (!verify.ok && !verifyNudgeUsed && verify.nudge) {
          verifyNudgeUsed = true;
          messages.push({ role: 'assistant', content: text });
          messages.push({ role: 'user', content: verify.nudge });
          patch({ verifyNotes: verify.notes, phase: 'verify' });
          continue;
        }
        if (!verify.ok) {
          patch(
            {
              status: 'failed',
              error: verify.notes.join(' ') || 'Verify policy not satisfied',
              summary: text,
              verifyNotes: verify.notes,
              phase: 'verify',
            },
            text
          );
          return run;
        }
        patch({ status: 'completed', summary: text, phase: 'done' }, text);
        return run;
      }

      messages.push({
        role: 'assistant',
        content: msg.content || '',
        tool_calls:
          msg.tool_calls ||
          calls.map((c) => ({
            id: c.id,
            type: 'function',
            function: { name: c.name, arguments: JSON.stringify(c.args) },
          })),
      });

      const allReadonly = calls.every((c) => READONLY_TOOLS.has(c.name));

      const runOne = async (call: { id: string; name: string; args: Record<string, unknown> }) => {
        if (signal.aborted) {
          return { aborted: true as const };
        }
        const isExec = EXEC_TOOLS.has(call.name);

        // Plan tools mutate run directly
        if (call.name === 'set_plan' || call.name === 'update_task') {
          const step: AgentStep = {
            id: 'step_' + Date.now() + '_' + call.id,
            index: run.steps.length,
            tool: call.name as AgentToolName,
            status: 'running',
            argsPreview: previewArgs(call.args),
            startedAt: Date.now(),
          };
          run = { ...run, steps: [...run.steps, step], stepCount: run.stepCount + 1 };
          patch({});
          const applied = applyPlanTool(run, call.name, call.args);
          run = {
            ...applied.run,
            phase: advancePhase(applied.run, call.name),
            steps: applied.run.steps.map((s) =>
              s.id === step.id
                ? {
                    ...s,
                    status: applied.ok ? 'ok' : 'error',
                    excerpt: applied.text.slice(0, 240),
                    finishedAt: Date.now(),
                  }
                : s
            ),
          };
          patch({});
          return {
            aborted: false as const,
            call,
            text: applied.text,
            ok: applied.ok,
          };
        }

        const step: AgentStep = {
          id: 'step_' + Date.now() + '_' + call.id,
          index: run.steps.length,
          tool: (call.name as AgentToolName) || 'think',
          status: 'running',
          argsPreview: previewArgs(call.args),
          startedAt: Date.now(),
        };
        run = { ...run, steps: [...run.steps, step], stepCount: run.stepCount + 1 };
        patch({});

        const result = await executeAgentTool(call.name, call.args, ctx);
        const done: AgentStep = {
          ...step,
          status: result.ok ? 'ok' : 'error',
          excerpt: (result.text || '').slice(0, 240),
          finishedAt: Date.now(),
        };

        let fileManifest = run.fileManifest;
        if (result.meta?.path && result.meta.op) {
          fileManifest = upsertManifest(fileManifest, result.meta.path, result.meta.op, result.meta.bytes);
        }

        let wroteSinceTest = run.wroteSinceTest;
        let needsBuild = run.needsBuild;
        if (result.meta?.wroteCode) wroteSinceTest = true;
        if (result.meta?.wroteJsTs && envHasPackageJson(ctx)) needsBuild = true;
        if (call.name === 'test' && result.testPassed) wroteSinceTest = false;
        if (call.name === 'build' && result.buildOk) needsBuild = false;

        run = {
          ...run,
          steps: run.steps.map((s) => (s.id === step.id ? done : s)),
          execCount: isExec ? run.execCount + 1 : run.execCount,
          lastTestPassed: result.testPassed ?? run.lastTestPassed,
          lastBuildOk: result.buildOk ?? run.lastBuildOk,
          fileManifest,
          phase: advancePhase(run, call.name),
          wroteSinceTest,
          needsBuild,
        };
        patch({});

        return {
          aborted: false as const,
          budget: false as const,
          call,
          text: result.text,
          ok: result.ok,
        };
      };

      if (allReadonly && calls.length > 1) {
        // Parallelize safe read-only tool I/O; apply run mutations serially in call order
        const settled = await Promise.all(
          calls.map(async (call) => {
            const result = await executeAgentTool(call.name, call.args, ctx);
            return { call, result };
          })
        );
        for (const { call, result } of settled) {
          if (signal.aborted) {
            patch({ status: 'cancelled', error: 'Stopped' });
            return run;
          }
          const step: AgentStep = {
            id: 'step_' + Date.now() + '_' + call.id,
            index: run.steps.length,
            tool: (call.name as AgentToolName) || 'think',
            status: 'running',
            argsPreview: previewArgs(call.args),
            startedAt: Date.now(),
          };
          run = { ...run, steps: [...run.steps, step], stepCount: run.stepCount + 1 };
          const done: AgentStep = {
            ...step,
            status: result.ok ? 'ok' : 'error',
            excerpt: (result.text || '').slice(0, 240),
            finishedAt: Date.now(),
          };
          let fileManifest = run.fileManifest;
          if (result.meta?.path && result.meta.op) {
            fileManifest = upsertManifest(fileManifest, result.meta.path, result.meta.op, result.meta.bytes);
          }
          run = {
            ...run,
            steps: run.steps.map((s) => (s.id === step.id ? done : s)),
            fileManifest,
            phase: advancePhase(run, call.name),
          };
          patch({});
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.name,
            content: result.text || '',
          });
        }
      } else {
        for (const call of calls) {
          const r = await runOne(call);
          if (r.aborted) {
            patch({ status: 'cancelled', error: 'Stopped' });
            return run;
          }
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.name,
            content: r.text || '',
          });
        }
      }

      // P0.4 — compact older tool results after each round
      const { meta } = compactToolMessages(messages);
      run = {
        ...run,
        compactMeta: {
          keptFull: meta.keptFull,
          compacted: (run.compactMeta?.compacted || 0) + meta.compacted,
          lastCompactAt: meta.lastCompactAt,
        },
      };
      patch({});
    }

  } catch (e: any) {
    if (e?.name === 'AbortError' || signal.aborted) {
      patch({ status: 'cancelled', error: 'Stopped' });
      return run;
    }
    patch({ status: 'failed', error: e?.message || 'Agent loop failed' });
    return run;
  }
}
