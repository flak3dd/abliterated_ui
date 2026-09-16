import type {
  AgentArtifacts,
  AgentCompactMeta,
  AgentFileManifestEntry,
  AgentPhase,
  AgentRun,
  AgentTask,
} from '../../types/agent';

export const KEEP_FULL_TOOL_RESULTS = 6;
export const COMPACT_SUMMARY_CAP = 280;
export const CHECKPOINT_PATH = '_agent_run.json';

type ToolMsg = {
  role: string;
  content?: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
};

/** Summarize an older tool result for context trimming. */
export function summarizeToolResult(name: string, content: string): string {
  const raw = String(content || '').replace(/\s+/g, ' ').trim();
  const head = raw.slice(0, COMPACT_SUMMARY_CAP);
  return `[compacted ${name}] ${head}${raw.length > COMPACT_SUMMARY_CAP ? '…' : ''}`;
}

/**
 * Compact older tool-role messages in-place: keep the last `keepFull` tool
 * results verbatim; earlier ones become short summaries.
 */
export function compactToolMessages(
  messages: ToolMsg[],
  keepFull = KEEP_FULL_TOOL_RESULTS
): { messages: ToolMsg[]; meta: AgentCompactMeta } {
  const toolIdx: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'tool') toolIdx.push(i);
  }
  let compacted = 0;
  const cutoff = Math.max(0, toolIdx.length - keepFull);
  for (let t = 0; t < cutoff; t++) {
    const i = toolIdx[t];
    const m = messages[i];
    const full = String(m.content || '');
    if (full.startsWith('[compacted ')) continue;
    messages[i] = {
      ...m,
      content: summarizeToolResult(m.name || 'tool', full),
    };
    compacted += 1;
  }
  return {
    messages,
    meta: {
      keptFull: Math.min(keepFull, toolIdx.length),
      compacted,
      lastCompactAt: Date.now(),
    },
  };
}

export function upsertManifest(
  manifest: AgentFileManifestEntry[] | undefined,
  path: string,
  op: AgentFileManifestEntry['op'],
  bytes?: number
): AgentFileManifestEntry[] {
  const next = [...(manifest || [])];
  const existing = next.findIndex((e) => e.path === path && e.op === op);
  const entry: AgentFileManifestEntry = { path, op, at: Date.now(), bytes };
  if (existing >= 0) next[existing] = entry;
  else next.push(entry);
  // Cap size
  if (next.length > 80) return next.slice(-80);
  return next;
}

export function buildArtifacts(run: AgentRun): AgentArtifacts {
  const manifest = run.fileManifest || [];
  const filesWritten = [
    ...new Set(manifest.filter((m) => m.op === 'write' || m.op === 'edit').map((m) => m.path)),
  ];
  const filesRead = [...new Set(manifest.filter((m) => m.op === 'read').map((m) => m.path))];
  return {
    filesWritten,
    filesRead,
    lastTestPassed: run.lastTestPassed,
    lastBuildOk: run.lastBuildOk,
  };
}

export function advancePhase(run: AgentRun, toolName: string): AgentPhase {
  const current = run.phase || 'explore';
  const order: AgentPhase[] = ['explore', 'plan', 'implement', 'verify', 'done'];
  const rank = (p: AgentPhase) => order.indexOf(p);

  let next: AgentPhase = current;

  if (toolName === 'set_plan' || toolName === 'update_task') {
    if (rank(current) < rank('plan')) next = 'plan';
  }
  if (toolName === 'list_files' || toolName === 'read_file' || toolName === 'grep') {
    if (current === 'explore' || !run.phase) next = 'explore';
  }
  if (toolName === 'write_file' || toolName === 'edit_file') {
    if (rank(current) < rank('implement')) next = 'implement';
  }
  if (toolName === 'test' || toolName === 'build') {
    if (rank(current) < rank('verify')) next = 'verify';
  }

  // Plan present + exploring → can stay explore; if plan exists and we start writing → implement
  if ((run.plan?.length || 0) > 0 && rank(next) < rank('plan') && toolName !== 'list_files') {
    // keep explore for pure reads
  }

  return next;
}

export function phaseNudge(phase: AgentPhase, openTasks: AgentTask[]): string {
  const open = openTasks.filter((t) => t.status === 'open' || t.status === 'blocked');
  const taskLine =
    open.length > 0
      ? `Open tasks:\n${open.map((t) => `- [${t.status}] ${t.id}: ${t.title}`).join('\n')}`
      : 'No open tasks on the checklist.';
  const tips: Record<AgentPhase, string> = {
    explore: 'Phase: explore — list/read/grep before writing.',
    plan: 'Phase: plan — set_plan / update_task, then implement.',
    implement: 'Phase: implement — prefer edit_file for small changes; write_file for new files.',
    verify: 'Phase: verify — run test (and build for Node/TS) before finishing.',
    done: 'Phase: done — summarize deliverables briefly.',
  };
  return `${tips[phase]}\n${taskLine}`;
}

export function applyPlanTool(
  run: AgentRun,
  name: string,
  args: Record<string, unknown>
): { run: AgentRun; text: string; ok: boolean } {
  if (name === 'set_plan') {
    const tasksRaw = args.tasks;
    let tasks: AgentTask[] = [];
    if (Array.isArray(tasksRaw)) {
      tasks = tasksRaw.map((t: any, i: number) => ({
        id: String(t?.id || `t${i + 1}`),
        title: String(t?.title || t || `Task ${i + 1}`),
        status: (['open', 'done', 'blocked'].includes(t?.status) ? t.status : 'open') as AgentTask['status'],
      }));
    } else if (typeof tasksRaw === 'string') {
      tasks = tasksRaw
        .split(/\n|;/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((title, i) => ({ id: `t${i + 1}`, title, status: 'open' as const }));
    }
    if (!tasks.length) {
      return { run, text: 'set_plan requires tasks[] or newline-separated string.', ok: false };
    }
    return {
      run: { ...run, plan: tasks, phase: run.phase === 'explore' ? 'plan' : run.phase || 'plan' },
      text: `Plan set (${tasks.length} tasks):\n${tasks.map((t) => `- [${t.status}] ${t.id}: ${t.title}`).join('\n')}`,
      ok: true,
    };
  }

  if (name === 'update_task') {
    const id = String(args.id || args.task_id || '');
    const status = String(args.status || '');
    const title = args.title != null ? String(args.title) : undefined;
    if (!id) return { run, text: 'update_task requires id.', ok: false };
    const plan = [...(run.plan || [])];
    const idx = plan.findIndex((t) => t.id === id);
    if (idx < 0) return { run, text: `Unknown task id: ${id}`, ok: false };
    const nextStatus = (['open', 'done', 'blocked'].includes(status)
      ? status
      : plan[idx].status) as AgentTask['status'];
    plan[idx] = {
      ...plan[idx],
      status: nextStatus,
      title: title ?? plan[idx].title,
    };
    return {
      run: { ...run, plan },
      text: `Updated ${id} → ${plan[idx].status}: ${plan[idx].title}`,
      ok: true,
    };
  }

  return { run, text: 'Not a plan tool', ok: false };
}

/** Snapshot suitable for _agent_run.json (no secrets). */
export function buildCheckpoint(run: AgentRun): string {
  const artifacts = buildArtifacts(run);
  const slim = {
    id: run.id,
    sessionId: run.sessionId,
    envId: run.envId,
    goal: run.goal,
    status: run.status,
    phase: run.phase,
    plan: run.plan,
    stepCount: run.stepCount,
    execCount: run.execCount,
    lastTestPassed: run.lastTestPassed,
    lastBuildOk: run.lastBuildOk,
    summary: run.summary,
    error: run.error,
    fileManifest: run.fileManifest,
    artifacts,
    compactMeta: run.compactMeta,
    budgetTier: run.budgetTier,
    resumedFromId: run.resumedFromId,
    verifyNotes: run.verifyNotes,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    steps: (run.steps || []).map((s) => ({
      id: s.id,
      index: s.index,
      tool: s.tool,
      status: s.status,
      argsPreview: s.argsPreview,
      excerpt: s.excerpt?.slice(0, 200),
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
    })),
  };
  return JSON.stringify(slim, null, 2);
}

export function resumeContextBlob(run: AgentRun): string {
  const arts = run.artifacts || buildArtifacts(run);
  const open = (run.plan || []).filter((t) => t.status !== 'done');
  return [
    `Continuing prior agent run ${run.id} (status was ${run.status}).`,
    `Prior summary: ${(run.summary || run.error || '(none)').slice(0, 600)}`,
    `Files written: ${arts.filesWritten.join(', ') || '(none)'}`,
    `Files read: ${arts.filesRead.slice(0, 20).join(', ') || '(none)'}`,
    `Last test: ${typeof run.lastTestPassed === 'boolean' ? (run.lastTestPassed ? 'passed' : 'failed') : 'n/a'}`,
    `Last build: ${typeof run.lastBuildOk === 'boolean' ? (run.lastBuildOk ? 'ok' : 'failed') : 'n/a'}`,
    open.length
      ? `Open tasks:\n${open.map((t) => `- [${t.status}] ${t.id}: ${t.title}`).join('\n')}`
      : 'No open tasks.',
    'Continue from here with a fresh budget. Prefer edit_file for small fixes; re-run test/build as needed.',
  ].join('\n');
}

/** Verify gates before allowing clean `completed`. */
export function evaluateVerifyPolicy(run: AgentRun, envHasPackageJson: boolean): {
  ok: boolean;
  notes: string[];
  nudge?: string;
} {
  const notes: string[] = [];
  const wroteCode = (run.fileManifest || []).some(
    (m) =>
      (m.op === 'write' || m.op === 'edit') &&
      /\.(py|js|jsx|ts|tsx|go|rs|java)$/i.test(m.path) &&
      !m.path.startsWith('_')
  );
  const wroteJsTs = (run.fileManifest || []).some(
    (m) => (m.op === 'write' || m.op === 'edit') && /\.(js|jsx|ts|tsx)$/i.test(m.path)
  );

  if (!wroteCode) return { ok: true, notes };

  if (run.wroteSinceTest || run.lastTestPassed !== true) {
    notes.push('Code was written but tests have not passed since the last write.');
    return {
      ok: false,
      notes,
      nudge:
        'VERIFY GATE: You wrote code but have not run a successful `test` since. Call the test tool now (fix failures if any), then summarize.',
    };
  }

  if (envHasPackageJson && wroteJsTs && run.needsBuild && run.lastBuildOk !== true) {
    notes.push('JS/TS changes with package.json — soft-require build.');
    return {
      ok: false,
      notes,
      nudge:
        'VERIFY GATE: package.json present and JS/TS files were written. Call `build` (or fix until green), then summarize.',
    };
  }

  return { ok: true, notes };
}

/** True iff all system/developer roles are a contiguous prefix (vLLM / OpenAI-compat). */
export function systemMessagesArePrefixOnly(messages: { role: string }[]): boolean {
  let seenNonSystem = false;
  for (const m of messages) {
    const r = String(m.role || '');
    if (r === 'system' || r === 'developer') {
      if (seenNonSystem) return false;
    } else {
      seenNonSystem = true;
    }
  }
  return true;
}

export const READONLY_TOOLS = new Set(['list_files', 'read_file', 'grep']);
export const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'set_plan', 'update_task']);
export const EXEC_TOOLS = new Set(['exec', 'test', 'build', 'github']);
