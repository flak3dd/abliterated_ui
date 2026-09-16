/** Pure gate for in-chat BUILD agent — no store imports (unit-testable). */

export type AgentGateInput = {
  isAgentMode: boolean;
  meshMode: string;
  hasActiveEnv: boolean;
};

export type AgentGateResult =
  | { run: false; blocked: false }
  | { run: true; blocked: false }
  | { run: false; blocked: true; reason: string; code: 'mesh' | 'env' };

export function evaluateAgentGate(input: AgentGateInput): AgentGateResult {
  if (!input.isAgentMode) return { run: false, blocked: false };
  if (input.meshMode !== 'spark') {
    return {
      run: false,
      blocked: true,
      code: 'mesh',
      reason:
        'BUILD agent is on, but mesh is not Spark. Switch to Spark mesh (local GB10 vLLM), then send again. Normal chat was not started.',
    };
  }
  if (!input.hasActiveEnv) {
    return {
      run: false,
      blocked: true,
      code: 'env',
      reason:
        'BUILD agent is on, but there is no active sandbox environment. Open or create a session with a sandbox, then send again. Normal chat was not started.',
    };
  }
  return { run: true, blocked: false };
}

export function agentGateHint(input: {
  isAgentMode: boolean;
  meshMode: string;
  hasActiveEnv: boolean;
}): string | null {
  if (!input.isAgentMode) return null;
  const g = evaluateAgentGate(input);
  if (g.blocked) {
    return g.code === 'mesh'
      ? 'Agent: needs Spark mesh — will not fall through to chat'
      : 'Agent: needs sandbox env — will not fall through to chat';
  }
  return 'Agent: BUILD · tool loop on Spark sandbox';
}

/** Per-session first-BUILD plan gate (pure — unit-testable). */
export type BuildPlanSessionGateInput = {
  /** True when evaluateAgentGate said run (Spark + env + agent on). */
  agentWouldRun: boolean;
  /** True after user approved a plan for this chat session. */
  sessionPlanReady: boolean;
};

export type BuildPlanSessionGateResult =
  | { proceed: true; prompt: false }
  | { proceed: false; prompt: true };

export function evaluateBuildPlanSessionGate(
  input: BuildPlanSessionGateInput
): BuildPlanSessionGateResult {
  if (!input.agentWouldRun) return { proceed: true, prompt: false };
  if (input.sessionPlanReady) return { proceed: true, prompt: false };
  return { proceed: false, prompt: true };
}

/** User reply that means "approve plan / start BUILD". */
export function isBuildPlanApproveText(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  return /^(start\s*build|approve(\s*&?\s*build)?|approve\s*plan|yes|go|build\s*it)$/i.test(
    t
  );
}

/** Lightweight local plan when model draft is unavailable. */
export function draftLocalBuildPlan(goal: string): string {
  const g = (goal || '').trim() || '(no goal)';
  return [
    '## Build plan',
    '',
    `**Goal:** ${g}`,
    '',
    '1. Explore the sandbox (list/read relevant files).',
    '2. Implement the smallest complete change set for the goal.',
    '3. Add or update tests covering the change.',
    '4. Run tests (and build if applicable); fix until green.',
    '5. Summarize files written and verification result.',
  ].join('\n');
}

