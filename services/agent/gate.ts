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
