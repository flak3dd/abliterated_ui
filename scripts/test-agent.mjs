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
const gate = require(path.join(outDir, 'services/agent/gate.js'));
const tools = require(path.join(outDir, 'services/agent/tools.js'));
const loop = require(path.join(outDir, 'services/agent/loop.js'));
const context = require(path.join(outDir, 'services/agent/context.js'));

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

// --- first-BUILD plan session gate ---
check(
  'plan gate prompts when agent would run and session not ready',
  (() => {
    const r = gate.evaluateBuildPlanSessionGate({
      agentWouldRun: true,
      sessionPlanReady: false,
    });
    return r.prompt === true && r.proceed === false;
  })()
);

check(
  'plan gate proceeds when session already plan-ready',
  (() => {
    const r = gate.evaluateBuildPlanSessionGate({
      agentWouldRun: true,
      sessionPlanReady: true,
    });
    return r.prompt === false && r.proceed === true;
  })()
);

check(
  'plan gate no-ops when agent would not run',
  (() => {
    const r = gate.evaluateBuildPlanSessionGate({
      agentWouldRun: false,
      sessionPlanReady: false,
    });
    return r.prompt === false && r.proceed === true;
  })()
);

check(
  'approve text detects start build',
  gate.isBuildPlanApproveText('start build') &&
    gate.isBuildPlanApproveText('Approve & build') &&
    !gate.isBuildPlanApproveText('please draft a longer plan')
);

check(
  'local draft plan includes goal',
  /fibonacci/i.test(gate.draftLocalBuildPlan('implement fibonacci'))
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
  const { messages: out, meta } = context.compactToolMessages(msgs, 6);
  const toolMsgs = out.filter((m) => m.role === 'tool');
  const compacted = toolMsgs.filter((m) => String(m.content).startsWith('[compacted'));
  check('compact keeps last 6 full', meta.keptFull === 6);
  check('compact earlier results', compacted.length === 4 && meta.compacted === 4);
  check(
    'summarizeToolResult short',
    context.summarizeToolResult('exec', 'a'.repeat(500)).startsWith('[compacted exec]')
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
    'schemas include edit_file grep set_plan github',
    names.includes('edit_file') &&
      names.includes('grep') &&
      names.includes('set_plan') &&
      names.includes('github')
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

let failed = 0;
for (const [name, ok] of checks) {
  console.log(ok ? 'PASS' : 'FAIL', '—', name);
  if (!ok) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
console.log('Note: live Spark vLLM + sandbox-runner e2e not exercised here.');
process.exit(failed ? 1 : 0);
