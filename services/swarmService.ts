import { SwarmSession, SwarmSubtask, WorkspaceFile, AgentRole } from '../types';
import { streamChatCompletion } from './vllmService';
import { extractFilesFromMarkdown } from './zipService';
import { evaluateFactualGrounding } from './hallucinationDetector';

/**
 * Intelligent task decomposition prompt
 */
function buildOrchestratorPrompt(masterPrompt: string, existingFileNames: string[]): string {
  return `You are the Lead Swarm Architect on Abliterated Sovereign Cloud.
Your task is to decompose a complex software engineering request into 2 to 4 discrete, modular subtasks that specialized worker agents will execute concurrently.

CRITICAL DECOMPOSITION RULES:
1. Divide responsibilities cleanly so each worker owns distinct, non-overlapping target files (e.g. models.py vs service.py vs test_service.py).
2. Always assign one task to role "tester" to write comprehensive pytest / vitest test suites.
3. Keep dependency lists accurate: independent tasks have "dependencies": [], dependent tasks list prerequisites by ID.
4. Output MUST be ONLY valid, parseable JSON matching this schema:

{
  "masterGoal": "Brief summary of the full architecture",
  "tasks": [
    {
      "id": "task_1",
      "role": "worker",
      "title": "Core Data Models & Types",
      "description": "Define data structures, schemas, and typed contracts.",
      "targetFiles": ["models.py"],
      "dependencies": []
    },
    {
      "id": "task_2",
      "role": "worker",
      "title": "Core Engine & Business Logic",
      "description": "Implement main algorithmic processing engine.",
      "targetFiles": ["service.py"],
      "dependencies": ["task_1"]
    },
    {
      "id": "task_3",
      "role": "tester",
      "title": "Automated Pytest Suite",
      "description": "Unit tests and edge-case test suite for service and models.",
      "targetFiles": ["test_service.py"],
      "dependencies": ["task_1", "task_2"]
    }
  ]
}

Existing sandbox files: ${existingFileNames.length > 0 ? existingFileNames.join(', ') : 'none'}
User Request to decompose: "${masterPrompt}"`;
}

/**
 * Parses JSON safely from markdown code fences or raw text
 */
function extractJsonFromText(text: string): any {
  try {
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenceMatch ? fenceMatch[1].trim() : text.trim();
    return JSON.parse(candidate);
  } catch {
    const braceStart = text.indexOf('{');
    const braceEnd = text.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
      return JSON.parse(text.slice(braceStart, braceEnd + 1));
    }
    throw new Error('Failed to parse JSON from orchestrator output');
  }
}

export interface SwarmEvaluationResult {
  shouldSpawn: boolean;
  confidence: number;
  reason: string;
}

/**
 * Intelligent Swarm Triage Evaluator
 * When Swarm Mode is enabled, the agent autonomously assesses whether a user prompt
 * warrants spawning multiple specialized agents (Swarm) or should be answered directly as a Single Agent.
 */
export async function evaluateSwarmNeed({
  prompt,
  activeFileCount = 0,
  host,
  port = 8000,
}: {
  prompt: string;
  activeFileCount?: number;
  host: string;
  port?: number;
}): Promise<SwarmEvaluationResult> {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();

  // 1. Explicit user commands
  if (
    lower.startsWith('/swarm') ||
    lower.startsWith('swarm:') ||
    lower.startsWith('@swarm') ||
    lower.includes('[swarm]') ||
    /\b(run swarm|spawn swarm|use swarm|multi-agent swarm|multi agent)\b/i.test(lower)
  ) {
    return {
      shouldSpawn: true,
      confidence: 1.0,
      reason: 'Explicit user command requesting multi-agent swarm orchestration.',
    };
  }

  if (
    lower.startsWith('/single') ||
    lower.startsWith('single:') ||
    lower.startsWith('@single') ||
    /\b(no swarm|single agent|don't swarm|dont swarm)\b/i.test(lower)
  ) {
    return {
      shouldSpawn: false,
      confidence: 1.0,
      reason: 'Explicit user command requesting single agent response.',
    };
  }

  // 2. Fast Heuristic Filter for common simple messages (Zero latency)
  // Short greetings or conversational pleasantries
  const isGreeting = /^(hi|hello|hey|yo|greetings|thanks|thank you|good (morning|afternoon|evening)|help)\b[!.?]*$/i.test(trimmed);
  if (isGreeting) {
    return {
      shouldSpawn: false,
      confidence: 0.99,
      reason: 'Conversational interaction — single agent response.',
    };
  }

  // Short questions or single queries (< 65 chars) without project creation verbs
  const hasCreationIntent = /\b(build|create|implement|architect|develop|scaffold|full-stack|test suite|multi-file|system|pipeline)\b/i.test(lower);
  if (trimmed.length < 65 && !hasCreationIntent) {
    return {
      shouldSpawn: false,
      confidence: 0.95,
      reason: 'Direct question or query — handled directly by single agent.',
    };
  }

  // 3. Fast Agent Autonomous Triage on DGX Spark Blackwell vLLM (~100ms)
  try {
    const triageSystemPrompt = `You are the Sovereign Spark Swarm Orchestration Triage Agent on DGX Spark GB10.
Analyze the user request and determine whether it warrants spawning a Multi-Agent Swarm (Architect, Coder, QA Engineer working in parallel) OR if a Single Agent response is sufficient.

SPAWN MULTI-AGENT SWARM ONLY IF:
1. The request requires building, scaffolding, or refactoring a complete software project, application, service, or multi-component system.
2. The task requires distinct separation of concerns (e.g. system architecture + core engine logic + comprehensive automated test suites).
3. The prompt asks for an end-to-end multi-file codebase.

USE SINGLE AGENT IF:
1. The request is a direct question, explanation, conceptual inquiry, or conversation.
2. The user is asking for a single function, script, regex, command, or bug fix.
3. The user is asking to review, format, or explain code.
4. The request is an iterative, single-file, or simple task.

Output STRICT JSON ONLY:
{
  "shouldSpawn": true | false,
  "confidence": 0.0 to 1.0,
  "reason": "One concise sentence explaining your choice"
}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const response = await fetch(`http://${host}:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen-abliterated',
        messages: [
          { role: 'system', content: triageSystemPrompt },
          { role: 'user', content: `Analyze this user prompt:\n"${trimmed.slice(0, 1000)}"` },
        ],
        temperature: 0.05,
        max_tokens: 90,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content || '';
      try {
        const parsed = extractJsonFromText(content);
        if (typeof parsed?.shouldSpawn === 'boolean') {
          return {
            shouldSpawn: parsed.shouldSpawn,
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
            reason: parsed.reason || (parsed.shouldSpawn ? 'Complex multi-component task detected by agent.' : 'Single agent response suitable.'),
          };
        }
      } catch {
        const mentionsSwarm = /"shouldSpawn"\s*:\s*true/i.test(content) || /\b(decision|verdict)\s*:\s*swarm\b/i.test(content);
        return {
          shouldSpawn: mentionsSwarm,
          confidence: 0.8,
          reason: mentionsSwarm ? 'Agent classified request as complex multi-component task.' : 'Agent determined single response is sufficient.',
        };
      }
    }
  } catch (triageErr) {
    console.warn('[swarmService] Autonomous triage network/timeout fallback:', triageErr);
  }

  // 4. Resilient Fallback Pattern Matcher (when offline or triage timeout)
  const complexityScore = [
    /\b(full[- ]stack|end[- ]to[- ]end|complete (app|application|system|service|library|platform))\b/i.test(lower),
    /\b(database|sqlite|postgres|redis|auth|api|backend|frontend)\b/i.test(lower) && /\b(test|pytest|vitest|suite)\b/i.test(lower),
    /\b(multiple files|architecture|modular|microservice|data model)\b/i.test(lower),
    /\b(build|implement|create)\b/i.test(lower) && lower.length > 100,
  ].filter(Boolean).length;

  const shouldSpawn = complexityScore >= 2;
  return {
    shouldSpawn,
    confidence: 0.75,
    reason: shouldSpawn
      ? 'Complex multi-component project detected with high complexity score.'
      : 'Standard query resolved with single agent.',
  };
}

/**
 * Deterministic fallback decomposition when offline or for instant planning
 */
function createFallbackDecomposition(
  masterPrompt: string,
  sessionId: string,
  envId: string,
  dispatchReason?: string
): SwarmSession {
  const isPython = !masterPrompt.toLowerCase().includes('react') && !masterPrompt.toLowerCase().includes('typescript');
  const slug = masterPrompt.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

  const tasks: SwarmSubtask[] = [
    {
      id: 'task_arch',
      role: 'worker',
      title: 'Data Schemas & Core Types',
      description: 'Implement foundational data models, configuration classes, and type hints.',
      targetFiles: [isPython ? `${slug}_models.py` : 'src/types.ts'],
      dependencies: [],
      status: 'queued',
    },
    {
      id: 'task_core',
      role: 'worker',
      title: 'Core Engine & Processing Logic',
      description: 'Implement main business logic, algorithms, and orchestration methods.',
      targetFiles: [isPython ? `${slug}_engine.py` : 'src/engine.ts'],
      dependencies: ['task_arch'],
      status: 'queued',
    },
    {
      id: 'task_qa',
      role: 'tester',
      title: 'Automated Test Matrix',
      description: 'Write comprehensive test suite covering happy paths, edge cases, and validation.',
      targetFiles: [isPython ? `test_${slug}.py` : 'src/engine.test.ts'],
      dependencies: ['task_arch', 'task_core'],
      status: 'queued',
    },
  ];

  return {
    id: `swarm_${Date.now()}`,
    sessionId,
    envId,
    masterGoal: masterPrompt,
    tasks,
    status: 'planning',
    overallProgress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    activeWorkerCount: 0,
    totalFilesGenerated: 0,
    dispatchReason,
  };
}

/**
 * Plans and decomposes a master prompt into a Swarm DAG
 */
export async function planSwarmSession({
  masterPrompt,
  sessionId,
  envId,
  existingFiles,
  host,
  port = 8000,
  dispatchReason,
}: {
  masterPrompt: string;
  sessionId: string;
  envId: string;
  existingFiles: Record<string, WorkspaceFile>;
  host: string;
  port?: number;
  dispatchReason?: string;
}): Promise<SwarmSession> {
  const fallback = createFallbackDecomposition(masterPrompt, sessionId, envId, dispatchReason);

  try {
    const existingNames = Object.keys(existingFiles);
    const prompt = buildOrchestratorPrompt(masterPrompt, existingNames);

    let rawOutput = '';
    await streamChatCompletion({
      host,
      port,
      temperature: 0.2,
      antiHallucination: true,
      messages: [
        { role: 'system', content: 'You are an expert Swarm Planner. You output only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      callbacks: {
        onToken: (tok) => { rawOutput += tok; },
        onComplete: () => {},
        onError: () => {},
      },
    });

    const parsed = extractJsonFromText(rawOutput);
    if (parsed?.tasks && Array.isArray(parsed.tasks) && parsed.tasks.length > 0) {
      const tasks: SwarmSubtask[] = parsed.tasks.map((t: any, idx: number) => ({
        id: t.id || `task_${idx + 1}`,
        role: (t.role as AgentRole) || 'worker',
        title: t.title || `Subtask ${idx + 1}`,
        description: t.description || '',
        targetFiles: Array.isArray(t.targetFiles) ? t.targetFiles : ['output.py'],
        dependencies: Array.isArray(t.dependencies) ? t.dependencies : [],
        status: 'queued',
      }));

      return {
        id: `swarm_${Date.now()}`,
        sessionId,
        envId,
        masterGoal: parsed.masterGoal || masterPrompt,
        tasks,
        status: 'running',
        overallProgress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        activeWorkerCount: 0,
        totalFilesGenerated: 0,
        dispatchReason,
      };
    }
  } catch (err) {
    console.warn('[swarmService] Orchestrator planning used fallback:', err);
  }

  return { ...fallback, status: 'running' };
}

/**
 * Executes a single subtask worker stream
 */
export async function executeWorkerSubtask({
  task,
  swarmGoal,
  sharedContext,
  host,
  port = 8000,
  onToken,
}: {
  task: SwarmSubtask;
  swarmGoal: string;
  sharedContext: Record<string, string>; // filename -> code
  host: string;
  port?: number;
  onToken?: (token: string, isReasoning: boolean) => void;
}): Promise<{ content: string; reasoning: string; files: WorkspaceFile[]; groundingScore: number }> {
  const contextSnippets = Object.entries(sharedContext)
    .map(([file, code]) => `File [${file}]:\n\`\`\`\n${code.slice(0, 1000)}\n\`\`\``)
    .join('\n\n');

  const workerSystemPrompt = `You are a Specialized ${task.role.toUpperCase()} Agent operating in a parallel DGX Blackwell Swarm.
Overarching Goal: "${swarmGoal}"
Assigned Task: "${task.title}"
Task Purpose: ${task.description}
TARGET FILES TO CREATE: ${task.targetFiles.join(', ')}

STRICT AGENT EXECUTION RULES:
1. Focus EXCLUSIVELY on generating high-quality, 100% operational code for your target files: ${task.targetFiles.join(', ')}.
2. Use explicit markdown headers for every code block (e.g. \`\`\`python ${task.targetFiles[0]}).
3. Zero stubbing: NEVER write "TODO", "pass", or "...". Everything must be fully implemented.
4. If writing tests, use pytest format with assertions. Ensure import paths match the root directory.

Existing shared files from other workers:
${contextSnippets || '(None yet, you are creating the initial modules)'}`;

  let content = '';
  let reasoning = '';
  const startTime = Date.now();

  await streamChatCompletion({
    host,
    port,
    temperature: 0.15,
    antiHallucination: true,
    messages: [
      { role: 'system', content: workerSystemPrompt },
      { role: 'user', content: `Execute subtask "${task.title}" and output the implementation for ${task.targetFiles.join(', ')}.` },
    ],
    callbacks: {
      onToken: (tok, isReasoning) => {
        if (isReasoning) {
          reasoning += tok;
        } else {
          content += tok;
        }
        onToken?.(tok, isReasoning);
      },
      onComplete: () => {},
      onError: (err) => { throw err; },
    },
  });

  const files = extractFilesFromMarkdown(content);
  const grounding = evaluateFactualGrounding(content);

  return {
    content,
    reasoning,
    files,
    groundingScore: grounding.groundingScore,
  };
}
