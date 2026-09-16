import { analyzeLayout } from '../layoutLmv3Service';
import { streamChatCompletion } from '../vllmService';
import { runSandboxBrowserTest } from '../sandboxService';
import { useMeshStore } from '../../stores/useMeshStore';
import type { ExecutionTarget } from '../../types';

export type VisionIssue = {
  severity: 'error' | 'warn' | 'info';
  area: string;
  detail: string;
  fixHint?: string;
};

export type VisionHealRound = {
  round: number;
  screenshot?: string | null;
  layoutScore?: number;
  issues: VisionIssue[];
  critique: string;
  ok: boolean;
};

function parseIssues(text: string): VisionIssue[] {
  const issues: VisionIssue[] = [];
  try {
    const m = text.match(/\[[\s\S]*\]/);
    if (m) {
      const arr = JSON.parse(m[0]);
      if (Array.isArray(arr)) {
        for (const row of arr.slice(0, 12)) {
          issues.push({
            severity: (row.severity === 'error' || row.severity === 'warn' ? row.severity : 'info') as any,
            area: String(row.area || row.region || 'ui'),
            detail: String(row.detail || row.message || row),
            fixHint: row.fixHint ? String(row.fixHint) : undefined,
          });
        }
      }
    }
  } catch {
    /* fall through */
  }
  if (!issues.length && /overlap|misalign|broken|overflow|cutoff|collision/i.test(text)) {
    issues.push({
      severity: 'warn',
      area: 'layout',
      detail: text.slice(0, 400),
      fixHint: 'Adjust CSS spacing, flex/grid, and z-index; ensure buttons are not clipped.',
    });
  }
  return issues;
}

/** Critique a screenshot with LayoutLMv3 (if up) + Spark multimodal chat. */
export async function critiqueViewport(opts: {
  screenshotDataUrl: string;
  goal: string;
  signal?: AbortSignal;
}): Promise<{ critique: string; issues: VisionIssue[]; layoutScore?: number }> {
  const mesh = useMeshStore.getState();
  const host = mesh.activeHost;
  const port = mesh.activePort;

  let layoutScore: number | undefined;
  try {
    const layout = await analyzeLayout(host, {
      imageDataUrl: opts.screenshotDataUrl,
      signal: opts.signal,
    });
    layoutScore = layout?.score;
  } catch {
    /* layout optional */
  }

  let critique = '';
  const system = `You are a visual QA critic for web UIs. Given a viewport screenshot, list concrete visual defects.
Return a short paragraph THEN a JSON array of issues:
[{"severity":"error|warn|info","area":"...","detail":"...","fixHint":"..."}]
Focus on: overlapping elements, cut-off text, misaligned buttons, broken CSS, empty panels, low contrast, overflow.`;

  await streamChatCompletion({
    host,
    port,
    temperature: 0.1,
    antiHallucination: true,
    max_tokens: 1200,
    abortSignal: opts.signal,
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Goal/prompt for this UI:\n${opts.goal.slice(0, 800)}\n\nLayoutLMv3 score hint: ${layoutScore ?? 'n/a'}. Critique the screenshot.`,
          },
          { type: 'image_url', image_url: { url: opts.screenshotDataUrl } },
        ],
      },
    ],
    callbacks: {
      onToken: (t, isR) => {
        if (!isR) critique += t;
      },
      onComplete: (c) => {
        if (c) critique = c;
      },
      onError: () => {},
    },
  });

  return { critique: critique.trim(), issues: parseIssues(critique), layoutScore };
}

/**
 * Self-heal loop: browser-test → critique → return structured fix brief for BUILD tools.
 * Caller applies edits via write_file/edit_file then re-invokes.
 */
export async function runVisionHealRound(opts: {
  envId: string;
  target: ExecutionTarget;
  goal: string;
  url?: string;
  round: number;
  signal?: AbortSignal;
}): Promise<VisionHealRound> {
  const test = await runSandboxBrowserTest(opts.envId, opts.target, {
    url: opts.url,
    headed: true,
  });
  if (!test.ok || !test.screenshotBase64) {
    return {
      round: opts.round,
      ok: false,
      issues: [
        {
          severity: 'error',
          area: 'browser',
          detail: test.error || 'browser-test failed / no screenshot',
          fixHint: test.hint,
        },
      ],
      critique: test.error || 'no screenshot',
      screenshot: null,
    };
  }

  const { critique, issues, layoutScore } = await critiqueViewport({
    screenshotDataUrl: test.screenshotBase64,
    goal: opts.goal,
    signal: opts.signal,
  });

  const blocking = issues.filter((i) => i.severity === 'error' || i.severity === 'warn');
  return {
    round: opts.round,
    screenshot: test.screenshotBase64,
    layoutScore,
    issues,
    critique,
    ok: blocking.length === 0,
  };
}

export function formatHealBrief(round: VisionHealRound): string {
  const lines = [
    `VISION HEAL ROUND ${round.round} — ${round.ok ? 'PASS' : 'NEEDS FIXES'}`,
    round.layoutScore != null ? `layoutScore=${round.layoutScore}` : '',
    '',
    round.critique.slice(0, 1500),
    '',
    'ISSUES:',
    ...round.issues.map(
      (i) => `- [${i.severity}] ${i.area}: ${i.detail}${i.fixHint ? ' | fix: ' + i.fixHint : ''}`
    ),
    '',
    round.ok
      ? 'Visual presentation looks acceptable. Stop healing.'
      : 'Edit CSS/JSX/HTML to fix issues, then call vision_heal again (or browser_test).',
  ];
  return lines.filter(Boolean).join('\n');
}

