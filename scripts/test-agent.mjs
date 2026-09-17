/**
 * Unit tests for in-chat BUILD agent (gate, path helpers, tool-call parse, tools,
 * unlimited budgets, github/git allowlist, edit_file, grep/read offset, phase/plan, trim/compaction).
 * No live Spark / vLLM required. Mocked in-memory env only.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(os.tmpdir(), 'abliterated-agent-test');
fs.mkdirSync(outDir, { recursive: true });

const tsc = spawnSync(
  path.join(root, 'node_modules/.bin/tsc'),
  [
    path.join(root, 'services/agent/gate.ts'),
    path.join(root, 'services/agent/tools.ts'),
    path.join(root, 'services/agent/loop.ts'),
    path.join(root, 'services/agent/context.ts'),
    path.join(root, 'services/chatSystemPrompt.ts'),
    path.join(root, 'services/sparkSsh.ts'),
    path.join(root, 'services/sandboxService.ts'),
    path.join(root, 'services/sandboxDirty.ts'),
    path.join(root, 'services/apiConfig.ts'),
    '--outDir',
    outDir,
    '--module',
    'commonjs',
    '--target',
    'es2020',
    '--skipLibCheck',
    '--esModuleInterop',
    '--ignoreConfig',
  ],
  { encoding: 'utf8' }
);
if (tsc.status !== 0) {
  console.error(tsc.stdout || tsc.stderr);
  process.exit(1);
}

const require = createRequire(import.meta.url);
// Compiled outputs live under os.tmpdir(); point NODE_PATH at the repo so nested
// requires (zustand, etc. via visionHeal) resolve.
process.env.NODE_PATH = [path.join(root, 'node_modules'), process.env.NODE_PATH || '']
  .filter(Boolean)
  .join(path.delimiter);
const Module = require('module');
if (typeof Module._initPaths === 'function') Module._initPaths();

const gate = require(path.join(outDir, 'services/agent/gate.js'));
const tools = require(path.join(outDir, 'services/agent/tools.js'));
const loop = require(path.join(outDir, 'services/agent/loop.js'));
const context = require(path.join(outDir, 'services/agent/context.js'));
const chat = require(path.join(outDir, 'services/chatSystemPrompt.js'));
const sparkSsh = require(path.join(outDir, 'services/sparkSsh.js'));

function makeEnv(files = {}) {
  const mapped = {};
  for (const [p, content] of Object.entries(files)) {
    mapped[p] = {
      path: p,
      content,
      language: 'python',
      updatedAt: Date.now(),
      sizeBytes: content.length,
    };
  }
  return {
    id: 'env_test',
    sessionId: 'sess_test',
    name: 'sandbox-test',
    files: mapped,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

let env = makeEnv({
  'hello.py': 'def hi():\n    return 1\n',
  'pkg/util.py': 'VALUE = 42\n# marker-xyz\n',
  'readme.md': 'line0\nline1\nline2\nline3\nline4\n',
});
const writes = [];
const ctx = {
  envId: env.id,
  getEnv: () => env,
  writeFile: (p, content, language) => {
    writes.push({ p, content, language });
    env = {
      ...env,
      files: {
        ...env.files,
        [p]: {
          path: p,
          content,
          language: language || 'text',
          updatedAt: Date.now(),
          sizeBytes: content.length,
        },
      },
      updatedAt: Date.now(),
    };
  },
  target: 'local_mac',
};

const checks = [];

function check(name, ok) {
  checks.push([name, Boolean(ok)]);
}

// --- gate ---
check(
  'gate off → not blocked, not run',
  (() => {
    const r = gate.evaluateAgentGate({
      isAgentMode: false,
      meshMode: 'spark',
      hasActiveEnv: true,
    });
    return r.run === false && r.blocked === false;
  })()
);

check(
  'gate on + spark + env → run',
  (() => {
    const r = gate.evaluateAgentGate({
      isAgentMode: true,
      meshMode: 'spark',
      hasActiveEnv: true,
    });
    return r.run === true && r.blocked === false;
  })()
);

check(
  'gate on + cloud → blocked mesh (no silent chat)',
  (() => {
    const r = gate.evaluateAgentGate({
      isAgentMode: true,
      meshMode: 'cloud',
      hasActiveEnv: true,
    });
    return r.blocked === true && r.code === 'mesh' && /Spark/i.test(r.reason);
  })()
);

check(
  'gate on + spark + no env → blocked env',
  (() => {
    const r = gate.evaluateAgentGate({
      isAgentMode: true,
      meshMode: 'spark',
      hasActiveEnv: false,
    });
    return r.blocked === true && r.code === 'env';
  })()
);

check(
  'hint shows needs mesh',
  /needs Spark mesh/i.test(
    gate.agentGateHint({ isAgentMode: true, meshMode: 'cloud', hasActiveEnv: true }) || ''
  )
);

check(
  'hint null when agent off',
  gate.agentGateHint({ isAgentMode: false, meshMode: 'spark', hasActiveEnv: true }) === null
);

// --- first-BUILD optional plan session gate ---
check(
  'plan gate offers optional prompt when agent would run and session not ready',
  (() => {
    const r = gate.evaluateBuildPlanSessionGate({
      agentWouldRun: true,
      sessionPlanReady: false,
    });
    return r.prompt === true && r.proceed === false && r.optional === true;
  })()
);

check(
  'plan gate proceeds when session already armed (plan optional / skipped)',
  (() => {
    const r = gate.evaluateBuildPlanSessionGate({
      agentWouldRun: true,
      sessionPlanReady: true,
    });
    return r.prompt === false && r.proceed === true && r.optional === false;
  })()
);

check(
  'plan gate no-ops when agent would not run',
  (() => {
    const r = gate.evaluateBuildPlanSessionGate({
      agentWouldRun: false,
      sessionPlanReady: false,
    });
    return r.prompt === false && r.proceed === true && r.optional === false;
  })()
);

check(
  'approve text detects start build and skip plan',
  gate.isBuildPlanApproveText('start build') &&
    gate.isBuildPlanApproveText('Approve & build') &&
    gate.isBuildPlanApproveText('skip plan') &&
    gate.isBuildPlanApproveText('skip') &&
    !gate.isBuildPlanApproveText('please draft a longer plan')
);

check(
  'local draft plan includes goal',
  /fibonacci/i.test(gate.draftLocalBuildPlan('implement fibonacci'))
);

check(
  'local draft plan includes optional guide',
  /from chat/i.test(
    gate.draftLocalBuildPlan('implement fibonacci', 'from chat: prefer pytest')
  )
);

// --- path helpers ---
check('safeRelPath ok', tools.safeRelPath('src/foo.py') === 'src/foo.py');
check('safeRelPath rejects ..', tools.safeRelPath('../etc/passwd') === null);
check('safeRelPath strips leading slash', tools.safeRelPath('/abs.py') === 'abs.py');
check('langFromPath py', tools.langFromPath('a.py') === 'python');
check('langFromPath tsx', tools.langFromPath('a.tsx') === 'typescript');

// --- tool call parse ---
check(
  'extractToolCalls from openai shape',
  (() => {
    const calls = loop.extractToolCalls({
      tool_calls: [
        {
          id: 'c1',
          function: { name: 'list_files', arguments: '{}' },
        },
      ],
    });
    return calls.length === 1 && calls[0].name === 'list_files';
  })()
);

check(
  'extractToolCalls from xml fallback',
  (() => {
    const calls = loop.extractToolCalls({
      content: '<tool_call>{"name":"read_file","arguments":{"path":"hello.py"}}</tool_call>',
    });
    return calls.length === 1 && calls[0].name === 'read_file' && calls[0].args.path === 'hello.py';
  })()
);

check('parseArgs object passthrough', loop.parseArgs({ path: 'x' }).path === 'x');
check('parseArgs json string', loop.parseArgs('{"cmd":"pytest"}').cmd === 'pytest');

// --- tools against mock env ---
{
  const r = await tools.executeAgentTool('list_files', {}, ctx);
  check('list_files lists hello.py', r.ok && /hello\.py/.test(r.text));
  check('list_files includes sizes', r.ok && /\d+ B/.test(r.text));
}

{
  const r = await tools.executeAgentTool('read_file', { path: 'hello.py' }, ctx);
  check('read_file content', r.ok && /def hi/.test(r.text));
}

{
  const r = await tools.executeAgentTool(
    'read_file',
    { path: 'readme.md', offset: 1, limit: 2 },
    ctx
  );
  check(
    'read_file offset/limit',
    r.ok && /line1/.test(r.text) && /line2/.test(r.text) && !/line4/.test(r.text)
  );
}

{
  const r = await tools.executeAgentTool('read_file', { path: '../x' }, ctx);
  check('read_file rejects traversal', !r.ok);
}

{
  const r = await tools.executeAgentTool('write_file', { path: 'x.py', content: '' }, ctx);
  check('write_file rejects empty', !r.ok);
}

{
  const r = await tools.executeAgentTool('exec', { cmd: 'rm -rf /' }, ctx);
  check('exec rejects non-allowlisted', !r.ok && /not allowlisted/i.test(r.text));
}

{
  const r = await tools.executeAgentTool('nope', {}, ctx);
  check('unknown tool fails', !r.ok);
}

{
  const emptyCtx = { ...ctx, getEnv: () => null };
  const r = await tools.executeAgentTool('list_files', {}, emptyCtx);
  check('no env fails loudly', !r.ok && /No active sandbox/i.test(r.text));
}

// --- budgets / tiers (unlimited — no enforcement) ---
check(
  'budgets exported unlimited',
  !Number.isFinite(tools.MAX_STEPS) &&
    !Number.isFinite(tools.MAX_EXEC) &&
    !Number.isFinite(tools.WALL_MS)
);
check(
  'all tiers unlimited (no-ops)',
  (() => {
    for (const t of ['quick', 'standard', 'large']) {
      const b = tools.resolveBudget(t);
      if (Number.isFinite(b.maxSteps) || Number.isFinite(b.maxExec) || Number.isFinite(b.wallMs)) {
        return false;
      }
    }
    return true;
  })()
);
check(
  'git and gh allowlisted via EXEC pattern helpers',
  tools.isForbiddenForcePush('git push --force origin main') === true &&
    tools.isForbiddenForcePush('git push origin feature') === false &&
    tools.isSecretPath('.env') === true &&
    tools.isSecretPath('src/app.ts') === false
);

// --- edit_file ---
{
  // write without materialize by mocking — write_file will try materialize; use edit on existing
  const before = env.files['hello.py'].content;
  const r = await tools.executeAgentTool(
    'edit_file',
    { path: 'hello.py', old_string: 'return 1', new_string: 'return 2' },
    ctx
  );
  // materialize may fail offline — accept ok or materialize error after local write
  const after = env.files['hello.py']?.content || '';
  const locallyApplied = after.includes('return 2') && !after.includes('return 1');
  check('edit_file applies unique replacement', r.ok || locallyApplied);
  check('edit_file content changed', locallyApplied || after !== before);
}

{
  const r = await tools.executeAgentTool(
    'edit_file',
    { path: 'hello.py', old_string: 'NOT_IN_FILE_ZZZ', new_string: 'x' },
    ctx
  );
  check('edit_file missing old_string fails', !r.ok && /not found/i.test(r.text));
}

{
  env.files['dup.py'] = {
    path: 'dup.py',
    content: 'aaa\nbbb\naaa\n',
    language: 'python',
    updatedAt: Date.now(),
    sizeBytes: 12,
  };
  const r = await tools.executeAgentTool(
    'edit_file',
    { path: 'dup.py', old_string: 'aaa', new_string: 'ccc' },
    ctx
  );
  check('edit_file ambiguous fails', !r.ok && /multiple/i.test(r.text));
}

// --- grep ---
{
  const r = await tools.executeAgentTool('grep', { pattern: 'marker-xyz' }, ctx);
  check('grep finds substring', r.ok && /pkg\/util\.py/.test(r.text));
}

{
  const r = await tools.executeAgentTool(
    'grep',
    { pattern: 'VALUE', path: 'pkg', regex: false },
    ctx
  );
  check('grep path filter', r.ok && /util\.py/.test(r.text));
}

{
  const r = await tools.executeAgentTool('grep', { pattern: 'nope-never-match-zzz' }, ctx);
  check('grep no matches', r.ok && /no matches/i.test(r.text));
}

// --- phase / plan helpers ---
{
  let run = {
    id: 'r1',
    sessionId: 's',
    envId: 'e',
    goal: 'g',
    status: 'running',
    steps: [],
    stepCount: 0,
    execCount: 0,
    phase: 'explore',
    createdAt: 1,
    updatedAt: 1,
  };
  const set = context.applyPlanTool(run, 'set_plan', {
    tasks: [
      { id: 't1', title: 'Write fib' },
      { id: 't2', title: 'Add tests' },
    ],
  });
  check('set_plan creates tasks', set.ok && set.run.plan?.length === 2);
  run = set.run;
  const upd = context.applyPlanTool(run, 'update_task', { id: 't1', status: 'done' });
  check('update_task marks done', upd.ok && upd.run.plan[0].status === 'done');
  check(
    'advancePhase write → implement',
    context.advancePhase(run, 'write_file') === 'implement'
  );
  check(
    'advancePhase test → verify',
    context.advancePhase({ ...run, phase: 'implement' }, 'test') === 'verify'
  );
  const nudge = context.phaseNudge('implement', upd.run.plan);
  check('phaseNudge lists open tasks', /Open tasks/i.test(nudge) && /t2/.test(nudge));
}

// --- trim / compaction ---
{
  const msgs = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'goal' },
  ];
  for (let i = 0; i < 10; i++) {
    msgs.push({
      role: 'tool',
      name: 'read_file',
      tool_call_id: 'c' + i,
      content: 'FULL_CONTENT_' + i + '_' + 'x'.repeat(100),
    });
  }
  const keep = context.KEEP_FULL_TOOL_RESULTS;
  const { messages: out, meta } = context.compactToolMessages(msgs, keep);
  const toolMsgs = out.filter((m) => m.role === 'tool');
  const compacted = toolMsgs.filter((m) => String(m.content).startsWith('[compacted'));
  check('compact keeps last N full (default 3)', meta.keptFull === keep && keep === 3);
  check(
    'compact earlier results',
    compacted.length === 10 - keep && meta.compacted === 10 - keep
  );
  check(
    'summarizeToolResult short',
    context.summarizeToolResult('exec', 'a'.repeat(500)).startsWith('[compacted exec]') &&
      context.summarizeToolResult('exec', 'a'.repeat(500)).length <= context.COMPACT_SUMMARY_CAP + 40
  );
}

// --- context budget / max_tokens ---
{
  check('MODEL_CONTEXT_LIMIT is 16384', context.MODEL_CONTEXT_LIMIT === 16384);
  check('estimateTokens chars/4', context.estimateTokens('abcd') === 1 && context.estimateTokens('a'.repeat(40)) === 10);
  check(
    'compute room: small prompt gets full target',
    (() => {
      const msgs = [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'short goal' },
      ];
      const b = context.prepareCompletionBudget(msgs, {
        toolsOverhead: 0,
        contextLimit: 16384,
        targetOutput: 4096,
      });
      return b.max_tokens === 4096 && b.estimatedInput < 800;
    })()
  );
  check(
    'max_tokens shrinks when input is large',
    (() => {
      const msgs = [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'x'.repeat(4 * 13000) }, // ~13000 tokens
      ];
      try {
        const b = context.prepareCompletionBudget(msgs, {
          toolsOverhead: 0,
          contextLimit: 16384,
          targetOutput: 4096,
          inputBudget: 16000,
          minOutput: 256,
        });
        // 16384 - ~13000 - safety(512) ≈ room for output, must be < 4096 and >= 256
        return b.max_tokens < 4096 && b.max_tokens >= 256 && b.estimatedInput + b.max_tokens <= 16384;
      } catch (e) {
        // Overflow is also acceptable if estimator + safety can't fit min output
        return e?.name === 'AgentContextOverflowError';
      }
    })()
  );
  check(
    'never request max_tokens that overflows 16384',
    (() => {
      const msgs = [
        { role: 'system', content: 's'.repeat(200) },
        { role: 'user', content: 'goal' },
      ];
      for (let i = 0; i < 8; i++) {
        msgs.push({
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'c' + i, type: 'function', function: { name: 'read_file', arguments: '{"path":"a.py"}' } }],
        });
        msgs.push({
          role: 'tool',
          name: 'read_file',
          tool_call_id: 'c' + i,
          content: 'BODY_' + i + '_' + 'y'.repeat(2000),
        });
      }
      const b = context.prepareCompletionBudget(msgs, {
        toolsOverhead: 2400,
        contextLimit: 16384,
        targetOutput: 4096,
        inputBudget: 12000,
      });
      return (
        b.max_tokens >= 256 &&
        b.max_tokens <= 4096 &&
        b.estimatedInput + b.max_tokens <= 16384 &&
        context.estimateMessagesTokens(msgs) + 2400 + context.AGENT_CONTEXT_SAFETY <= 12000 + 50
      );
    })()
  );
  check(
    'overflow surfaces clear error when even min output cannot fit',
    (() => {
      const msgs = [
        { role: 'system', content: 'S'.repeat(4 * 20000) },
        { role: 'user', content: 'U'.repeat(4 * 20000) },
      ];
      try {
        context.prepareCompletionBudget(msgs, {
          toolsOverhead: 0,
          contextLimit: 16384,
          targetOutput: 4096,
          minOutput: 256,
          inputBudget: 16384,
        });
        return false;
      } catch (e) {
        return (
          e?.name === 'AgentContextOverflowError' &&
          /Context overflow/i.test(String(e.message)) &&
          /16384/.test(String(e.message))
        );
      }
    })()
  );
  check(
    'dropOldestToolRounds removes early rounds',
    (() => {
      const msgs = [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'goal' },
      ];
      for (let i = 0; i < 5; i++) {
        msgs.push({
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'c' + i, function: { name: 'read_file', arguments: '{}' } }],
        });
        msgs.push({
          role: 'tool',
          name: 'read_file',
          tool_call_id: 'c' + i,
          content: 'z'.repeat(4 * 3000),
        });
      }
      const before = msgs.length;
      const { dropped } = context.dropOldestToolRounds(msgs, 4000, 0);
      return dropped > 0 && msgs.length < before && msgs[0].role === 'system' && msgs[1].role === 'user';
    })()
  );
}

// --- verify policy ---
{
  const base = {
    id: 'r',
    sessionId: 's',
    envId: 'e',
    goal: 'g',
    status: 'running',
    steps: [],
    stepCount: 0,
    execCount: 0,
    createdAt: 1,
    updatedAt: 1,
    fileManifest: [{ path: 'a.py', op: 'write', at: 1 }],
    wroteSinceTest: true,
  };
  const v = context.evaluateVerifyPolicy(base, false);
  check('verify blocks without test', !v.ok && /test/i.test(v.nudge || ''));
  const ok = context.evaluateVerifyPolicy(
    { ...base, wroteSinceTest: false, lastTestPassed: true },
    false
  );
  check('verify ok after tests', ok.ok);
  const soft = context.evaluateVerifyPolicy(
    {
      ...base,
      fileManifest: [{ path: 'a.ts', op: 'write', at: 1 }],
      wroteSinceTest: false,
      lastTestPassed: true,
      needsBuild: true,
      lastBuildOk: undefined,
    },
    true
  );
  check('verify soft-requires build for ts+package.json', !soft.ok && /build/i.test(soft.nudge || ''));
}

// --- anti-fabrication / evidence harden ---
{
  const sys = String(loop.AGENT_SYSTEM_PROMPT || '');
  check(
    'SYSTEM has evidence harden rules',
    /Never invent tool results/i.test(sys) &&
      /Only claim exec\/test\/build outcomes/i.test(sys) &&
      /example\.com/i.test(sys) &&
      /do not fake green/i.test(sys) &&
      /credential stuffing/i.test(sys) &&
      /SANDBOX \$ ssh/i.test(sys) &&
      (/ssh` tool/i.test(sys) || /ssh tool/i.test(sys) || /\\`ssh\\`/i.test(sys) || /call the `ssh` tool/i.test(sys) || /ssh\b/i.test(sys)) &&
      /tool_call/i.test(sys)
  );
  check(
    'looksLikeFabricatedExecSummary detects example.com',
    context.looksLikeFabricatedExecSummary(
      'Login succeeded at https://example.com/app — all good.'
    )
  );
  check(
    'looksLikeFabricatedExecSummary detects playwright theater',
    context.looksLikeFabricatedExecSummary(
      'Running 12 tests using 4 workers\n  12 passed (Playwright chromium)'
    )
  );
  check(
    'looksLikeFabricatedExecSummary clean summary ok',
    !context.looksLikeFabricatedExecSummary(
      'Wrote fib.py and asked the user to run tests next.'
    )
  );
  check(
    'summaryClaimsSandboxRun detects all tests pass',
    context.summaryClaimsSandboxRun('All tests passed. Ready to ship.')
  );
  check(
    'goalImpliesSandboxRun detects pytest goal',
    context.goalImpliesSandboxRun('implement fib and run pytest') &&
      !context.goalImpliesSandboxRun('add a README section about architecture')
  );

  const noSteps = {
    id: 'r',
    sessionId: 's',
    envId: 'e',
    goal: 'implement hello',
    status: 'running',
    steps: [],
    stepCount: 0,
    execCount: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  check(
    'hasSandboxExecEvidence false without steps',
    context.hasSandboxExecEvidence(noSteps) === false
  );
  check(
    'hasSandboxExecEvidence true with test step',
    context.hasSandboxExecEvidence({
      ...noSteps,
      steps: [
        {
          id: 's1',
          index: 0,
          tool: 'test',
          status: 'ok',
          startedAt: 1,
          finishedAt: 2,
        },
      ],
    }) === true
  );

  const fake = context.evaluateVerifyPolicy(
    noSteps,
    false,
    'All tests passed. Playwright: 8 passed on https://example.com'
  );
  check(
    'verify blocks fabricated summary without tools',
    !fake.ok && /invent|tool evidence|example\.com/i.test((fake.nudge || '') + fake.notes.join(' '))
  );

  const claimOnly = context.evaluateVerifyPolicy(
    noSteps,
    false,
    'Ran the tests — all tests pass, suite is green.'
  );
  check(
    'verify blocks claim-without-evidence',
    !claimOnly.ok && /VERIFY GATE/i.test(claimOnly.nudge || '')
  );

  const goalNeeds = context.evaluateVerifyPolicy(
    { ...noSteps, goal: 'add unit tests and run pytest' },
    false,
    'Implemented the module; stopping here.'
  );
  check(
    'verify blocks goal-implies-run without tools',
    !goalNeeds.ok && /implies running or testing/i.test(goalNeeds.nudge || '')
  );

  const withEvidence = context.evaluateVerifyPolicy(
    {
      ...noSteps,
      goal: 'add unit tests and run pytest',
      steps: [
        {
          id: 's1',
          index: 0,
          tool: 'test',
          status: 'ok',
          startedAt: 1,
          finishedAt: 2,
          excerpt: '3 passed',
        },
      ],
      lastTestPassed: true,
      wroteSinceTest: false,
    },
    false,
    'Tests passed via the test tool (3 passed).'
  );
  check('verify ok with real test evidence', withEvidence.ok);
}

// --- checkpoint / resume blob ---
{
  const run = {
    id: 'agent_x',
    sessionId: 's',
    envId: 'e',
    goal: 'build thing',
    status: 'budget',
    steps: [],
    stepCount: 3,
    execCount: 1,
    phase: 'implement',
    plan: [{ id: 't1', title: 'more', status: 'open' }],
    fileManifest: [{ path: 'a.py', op: 'write', at: 1 }],
    createdAt: 1,
    updatedAt: 2,
  };
  const json = context.buildCheckpoint(run);
  check('checkpoint json', /"agent_x"/.test(json) && /_agent_run/.test(context.CHECKPOINT_PATH));
  const blob = context.resumeContextBlob(run);
  check('resume blob has goal context', /Continuing prior/.test(blob) && /a\.py/.test(blob));
}

// --- schemas include new tools ---
{
  const names = tools.AGENT_TOOL_SCHEMAS.map((s) => s.function.name);
  check(
    'schemas include edit_file grep set_plan github ssh',
    names.includes('edit_file') &&
      names.includes('grep') &&
      names.includes('set_plan') &&
      names.includes('github') &&
      names.includes('ssh')
  );
  check(
    'schemas include ssh_list ssh_read ssh_grep ssh_write ssh_edit',
    names.includes('ssh_list') &&
      names.includes('ssh_read') &&
      names.includes('ssh_grep') &&
      names.includes('ssh_write') &&
      names.includes('ssh_edit')
  );
  check(
    'CHAT_LIVE_TOOL_SCHEMAS mirrors remote ssh tools',
    Array.isArray(sparkSsh.CHAT_LIVE_TOOL_SCHEMAS) &&
      sparkSsh.CHAT_LIVE_TOOL_SCHEMAS.map((s) => s.function.name).includes('ssh_list') &&
      sparkSsh.CHAT_LIVE_TOOL_SCHEMAS.map((s) => s.function.name).includes('ssh_edit')
  );
}

// --- secret path + force-push soft blocks ---
{
  const r = await tools.executeAgentTool('read_file', { path: '.env' }, ctx);
  check('read_file blocks .env', !r.ok && /secret|refus/i.test(r.text));
}
{
  const r = await tools.executeAgentTool(
    'exec',
    { cmd: 'git push --force origin main' },
    ctx
  );
  check('exec blocks force-push to main', !r.ok && /force|refus|main/i.test(r.text));
}
{
  const r = await tools.executeAgentTool('exec', { cmd: 'git status' }, ctx);
  // may fail offline / no runner — but must be allowlisted (not "not allowlisted")
  check(
    'exec allows git (not allowlist reject)',
    !/not allowlisted/i.test(r.text)
  );
}
{
  const r = await tools.executeAgentTool('exec', { cmd: 'gh auth status' }, ctx);
  check(
    'exec allows gh (not allowlist reject)',
    !/not allowlisted/i.test(r.text)
  );
}
{
  check(
    'redactCliSecrets strips gho tokens',
    /REDACTED/.test(tools.redactCliSecrets('Token: gho_ABCDEFG1234567890'))
  );
}


// --- vLLM system-message prefix rule ---
{
  const okMsgs = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'goal' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'list_files', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'c1', name: 'list_files', content: '[]' },
  ];
  check('system prefix-only: valid transcript', context.systemMessagesArePrefixOnly(okMsgs));
  const trailing = [...okMsgs, { role: 'system', content: '[agent-round-nudge]\nnudge' }];
  check('system prefix-only: trailing system fails', !context.systemMessagesArePrefixOnly(trailing));
  const mid = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'goal' },
    { role: 'system', content: 'bad mid' },
    { role: 'assistant', content: 'hi' },
  ];
  check('system prefix-only: mid-conversation system fails', !context.systemMessagesArePrefixOnly(mid));

  // Simulate loop refresh-at-0 pattern (never push system after start)
  const msgs = [
    { role: 'system', content: 'BASE' },
    { role: 'user', content: 'goal' },
    { role: 'assistant', content: 'ok' },
    { role: 'tool', tool_call_id: 'c1', name: 'list_files', content: '[]' },
  ];
  const nudge1 = context.phaseNudge('explore', []);
  loop.applyRoundSystemNudge(msgs, 'BASE', nudge1);
  check(
    'applyRoundSystemNudge refreshes index 0',
    msgs[0].role === 'system' &&
      String(msgs[0].content).includes('[agent-round-nudge]') &&
      String(msgs[0].content).includes('explore')
  );
  check('after nudge refresh still prefix-only', context.systemMessagesArePrefixOnly(msgs));
  const beforeLen = msgs.length;
  const nudge2 = context.phaseNudge('implement', [{ id: 't1', title: 'do', status: 'open' }]);
  loop.applyRoundSystemNudge(msgs, 'BASE', nudge2);
  check(
    'second nudge does not append system',
    msgs.length === beforeLen &&
      msgs.filter((m) => m.role === 'system').length === 1 &&
      /implement/.test(String(msgs[0].content))
  );
  check('tool roles unchanged', msgs.some((m) => m.role === 'tool'));
}

// --- chat never-invent + SSH theater ---
{
  check(
    'CHAT_MINIMUM_NEVER_INVENT_RULES forbids inventing SSH/SANDBOX',
    /Never invent terminal output/i.test(chat.CHAT_MINIMUM_NEVER_INVENT_RULES) &&
      /SANDBOX \$ ssh/i.test(chat.CHAT_MINIMUM_NEVER_INVENT_RULES) &&
      /ssh_list/i.test(chat.CHAT_MINIMUM_NEVER_INVENT_RULES) &&
      (/ssh tool/i.test(chat.CHAT_MINIMUM_NEVER_INVENT_RULES) || /ssh_list/i.test(chat.CHAT_MINIMUM_NEVER_INVENT_RULES) || /BUILD agent/i.test(chat.CHAT_MINIMUM_NEVER_INVENT_RULES))
  );
  const always = chat.buildNormalChatSystemPrompt({
    antiHallucination: false,
    activeFilesSummary: '  (none)',
  });
  check(
    'normal chat always includes minimum never-invent (toggle off)',
    /NEVER INVENT LIVE EXECUTION/i.test(always) && /Never invent terminal output/i.test(always)
  );
  const strict = chat.buildNormalChatSystemPrompt({
    antiHallucination: true,
    activeFilesSummary: '  - app.py',
  });
  check(
    'strict anti-hallucination includes ZERO-HALLUCINATION + never invent',
    /ZERO-HALLUCINATION/i.test(strict) &&
      /terminal output/i.test(strict) &&
      /app\.py/.test(strict)
  );
  check(
    'userAsksRemoteListing detects ssh flak3dd ls',
    chat.userAsksRemoteListing("ssh flak3dd 'ls /mnt/nvme'") === true
  );
  check(
    'remoteListingAgentOffHint when agent off',
    /ssh tool|SSH any host|ssh_list/i.test(chat.remoteListingAgentOffHint("list /mnt/nvme on spark", false) || '') &&
      !/needs Agent: BUILD/i.test(chat.remoteListingAgentOffHint("list /mnt/nvme on spark", false) || '')
  );
  check(
    'CHAT rules allow real ssh tool quote when live',
    /Real remote exec is allowed/i.test(chat.CHAT_MINIMUM_NEVER_INVENT_RULES) &&
      (/ssh tool/i.test(chat.CHAT_MINIMUM_NEVER_INVENT_RULES) || /ssh flak3dd/i.test(chat.CHAT_MINIMUM_NEVER_INVENT_RULES)) &&
      !/Agent OFF has no tools/i.test(chat.CHAT_MINIMUM_NEVER_INVENT_RULES)
  );
  check(
    'remoteListingAgentOffHint null when agent on',
    chat.remoteListingAgentOffHint("ssh flak3dd ls /mnt/nvme", true) === null
  );
  check(
    'looksLikeFabricatedExecSummary detects SANDBOX $ ssh theater',
    context.looksLikeFabricatedExecSummary(
      'SANDBOX $ ssh flak3dd ls -lh /mnt/nvme\ntotal 12\ndrwxr-xr-x 2 root root 4096 Jan 1 models'
    )
  );
  const sshFake = context.evaluateVerifyPolicy(
    {
      id: 'r',
      sessionId: 's',
      envId: 'e',
      goal: 'list remote files',
      status: 'running',
      steps: [],
      stepCount: 0,
      execCount: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    false,
    "SANDBOX $ ssh flak3dd 'ls /mnt/nvme'\ndrwxr-xr-x models"
  );
  check(
    'verify blocks SANDBOX ssh theater without tools',
    !sshFake.ok && /VERIFY GATE|invent|SANDBOX/i.test((sshFake.nudge || '') + sshFake.notes.join(' '))
  );
}


// --- general ssh tool (any host) ---
{
  check('isValidSshHost accepts alias', sparkSsh.isValidSshHost('myserver') === true);
  check('isValidSshHost accepts user@host', sparkSsh.isValidSshHost('admin@192.168.4.103') === true);
  check('isValidSshHost accepts flak3dd', sparkSsh.isValidSshHost('flak3dd') === true);
  check('isValidSshHost rejects metachar', sparkSsh.isValidSshHost('host;rm') === false);
  check('isValidSshHost rejects spaces', sparkSsh.isValidSshHost('my server') === false);

  const okNorm = sparkSsh.normalizeSshArgs({ host: 'myserver', command: 'ls /data' });
  check(
    'normalizeSshArgs allows any host (not flak3dd-only)',
    !('error' in okNorm) &&
      okNorm.host === 'myserver' &&
      /BatchMode=yes/.test(okNorm.localCmd) &&
      /myserver/.test(okNorm.localCmd) &&
      /ls \/data/.test(okNorm.localCmd)
  );

  const flak = sparkSsh.normalizeSshArgs({ host: 'flak3dd', command: 'hostname' });
  check('normalizeSshArgs still allows flak3dd', !('error' in flak) && flak.host === 'flak3dd');

  const badHost = sparkSsh.normalizeSshArgs({ host: 'bad;host', command: 'ls' });
  check('normalizeSshArgs rejects bad host', 'error' in badHost);

  const secret = sparkSsh.normalizeSshArgs({ host: 'myserver', command: 'cat .env' });
  check('normalizeSshArgs soft-refuses .env', 'error' in secret && /secret|\.env|refus/i.test(secret.error));

  check(
    'isAllowedSsh allows ssh myserver',
    tools.isAllowedSsh("ssh myserver 'ls /data'") === true
  );
  check(
    'isAllowedSsh allows BatchMode form',
    tools.isAllowedSsh('ssh -o BatchMode=yes -o ConnectTimeout=30 myserver -- ls') === true
  );
  check(
    'isAllowedSsh rejects invalid host',
    tools.isAllowedSsh('ssh bad;host ls') === false
  );
  check(
    'remoteCommandTouchesSecrets detects cat .env',
    sparkSsh.remoteCommandTouchesSecrets('cat /home/u/.env') === true
  );
  check(
    'remoteCommandTouchesSecrets allows ls',
    sparkSsh.remoteCommandTouchesSecrets('ls -lah /data') === false
  );
  check(
    'resolveSshFromUserText parses ssh myserver ls',
    (() => {
      const n = sparkSsh.resolveSshFromUserText('ssh myserver ls /data');
      return n && n.host === 'myserver' && /ls \/data/.test(n.command);
    })()
  );
  check(
    'chatSshToolsAllowed when agent off',
    sparkSsh.chatSshToolsAllowed({ isAgentMode: false }) === true
  );
  check(
    'chatSshToolsAllowed false when agent on (BUILD uses agent schemas)',
    sparkSsh.chatSshToolsAllowed({ isAgentMode: true }) === false
  );

  check(
    'isSecretRemotePath refuses .env and id_ed25519',
    sparkSsh.isSecretRemotePath('/home/u/.env') === true &&
      sparkSsh.isSecretRemotePath('/home/u/.ssh/id_ed25519') === true &&
      sparkSsh.isSecretRemotePath('/data/app.py') === false
  );
  check(
    'validateRemoteToolPath refuses secrets',
    typeof sparkSsh.validateRemoteToolPath('/proj/.env') !== 'string' &&
      /refus|secret|\.env/i.test(sparkSsh.validateRemoteToolPath('/proj/.env').error)
  );
  check(
    'validateRemoteToolPath accepts /data',
    sparkSsh.validateRemoteToolPath('/data') === '/data'
  );
  check(
    'safeRemotePath rejects metachar and ..',
    sparkSsh.safeRemotePath('/tmp/../etc/passwd') === null &&
      sparkSsh.safeRemotePath('/tmp/file;rm') === null &&
      sparkSsh.safeRemotePath('/mnt/nvme/models') === '/mnt/nvme/models'
  );
  check(
    'buildSshListCommand depth1 is ls -la',
    /ls -la/.test(sparkSsh.buildSshListCommand('/data', 1))
  );
  check(
    'buildSshReadCommand has head caps',
    /head -c/.test(sparkSsh.buildSshReadCommand('/data/a.py', 1024, 50)) &&
      /head -n/.test(sparkSsh.buildSshReadCommand('/data/a.py', 1024, 50))
  );
  const grepcmd = sparkSsh.buildSshGrepCommand('/data', 'TODO', { maxHits: 10 });
  check(
    'buildSshGrepCommand ok',
    typeof grepcmd === 'string' && /grep/.test(grepcmd) && /TODO/.test(grepcmd)
  );
  const writeTooBig = sparkSsh.buildSshWriteCommand(
    '/tmp/x.txt',
    'x'.repeat(sparkSsh.SSH_WRITE_MAX_BYTES + 1)
  );
  check(
    'buildSshWriteCommand refuses oversize',
    typeof writeTooBig !== 'string' && /exceeds/i.test(writeTooBig.error)
  );
  const writeOk = sparkSsh.buildSshWriteCommand('/tmp/x.txt', 'hello remote');
  check(
    'buildSshWriteCommand builds python3 base64 write',
    typeof writeOk === 'string' && /python3/.test(writeOk) && /base64/.test(writeOk)
  );
  const editOk = sparkSsh.applyRemoteEdit('aaa bbb ccc', 'bbb', 'BBB');
  check(
    'applyRemoteEdit success',
    editOk.ok === true && editOk.next === 'aaa BBB ccc'
  );
  const editMiss = sparkSsh.applyRemoteEdit('aaa bbb ccc', 'zzz', 'Z');
  check(
    'applyRemoteEdit missing old_string',
    editMiss.ok === false && /not found/i.test(editMiss.error)
  );
  const editAmb = sparkSsh.applyRemoteEdit('aaa aaa', 'aaa', 'b');
  check(
    'applyRemoteEdit ambiguous old_string',
    editAmb.ok === false && /multiple/i.test(editAmb.error)
  );
  check(
    'isValidSshHost still rejects injection',
    sparkSsh.isValidSshHost('host$(rm)') === false &&
      sparkSsh.isValidSshHost('user@host') === true
  );
  check(
    'SYSTEM prompt mandates ssh_list → ssh_read workflow',
    /ssh_list/i.test(loop.AGENT_SYSTEM_PROMPT) &&
      /ssh_read/i.test(loop.AGENT_SYSTEM_PROMPT) &&
      /ssh_write/i.test(loop.AGENT_SYSTEM_PROMPT) &&
      /ssh_edit/i.test(loop.AGENT_SYSTEM_PROMPT)
  );
}



// --- remote ssh_write/ssh_edit soft refuse (no live runner needed) ---
{
  const r = await tools.executeAgentTool(
    'ssh_write',
    { host: 'myserver', path: '/home/u/.env', content: 'SECRET=1' },
    ctx
  );
  check('ssh_write refuses .env', !r.ok && /refus|secret|\.env/i.test(r.text));
}
{
  const r = await tools.executeAgentTool(
    'ssh_edit',
    { host: 'myserver', path: '/home/u/.ssh/id_ed25519', old_string: 'a', new_string: 'b' },
    ctx
  );
  check('ssh_edit refuses private key path', !r.ok && /refus|secret|id_ed25519/i.test(r.text));
}
{
  const r = await tools.executeAgentTool(
    'ssh_read',
    { host: 'bad;host', path: '/data/a.py' },
    ctx
  );
  check('ssh_read rejects invalid host', !r.ok && /invalid/i.test(r.text));
}
{
  const r = await tools.executeAgentTool(
    'ssh_list',
    { host: 'myserver', path: '/tmp/../etc' },
    ctx
  );
  check('ssh_list rejects path traversal', !r.ok && /invalid/i.test(r.text));
}

let failed = 0;
for (const [name, ok] of checks) {
  console.log(ok ? 'PASS' : 'FAIL', '—', name);
  if (!ok) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);

console.log('Note: live Spark vLLM + sandbox-runner e2e not exercised here.');
process.exit(failed ? 1 : 0);
