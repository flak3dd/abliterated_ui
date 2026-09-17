/**
 * Unit tests for chat history packer / rolling summary / BUILD conversation blob.
 * No live vLLM required.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(os.tmpdir(), 'abliterated-chat-history-test');
fs.mkdirSync(outDir, { recursive: true });

const tsc = spawnSync(
  path.join(root, 'node_modules/.bin/tsc'),
  [
    path.join(root, 'services/chatHistoryPacker.ts'),
    path.join(root, 'services/chatSystemPrompt.ts'),
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
if (!fs.existsSync(path.join(outDir, 'chatHistoryPacker.js'))) {
  console.error('tsc did not emit chatHistoryPacker.js into', outDir, fs.readdirSync(outDir));
  process.exit(1);
}

const require = createRequire(import.meta.url);
const packer = require(path.join(outDir, 'chatHistoryPacker.js'));
const chatPrompt = require(path.join(outDir, 'chatSystemPrompt.js'));

const checks = [];
function check(name, ok) {
  checks.push([name, Boolean(ok)]);
}

{
  const c = packer.extractKeyConstraints(
    'Build a FastAPI app at /Users/adminuser/proj/app.py on host 192.168.4.103. Context limit 16384. Must use pytest.'
  );
  check(
    'extract paths',
    c.some((x) => x.includes('path:') && x.includes('app.py'))
  );
  check(
    'extract host ip',
    c.some((x) => x.includes('host:192.168.4.103'))
  );
  check(
    'extract goal/constraint',
    c.some((x) => /goal:|constraint:/i.test(x))
  );
}

{
  const older = [];
  for (let i = 0; i < 6; i++) {
    older.push({
      id: 'u' + i,
      role: 'user',
      content: `Please use /mnt/nvme/data/set${i}.csv on ssh flak3dd. Goal: implement ingest step ${i}.`,
    });
    older.push({
      id: 'a' + i,
      role: 'assistant',
      content: `Ack step ${i}, will use /mnt/nvme/data/set${i}.csv.`,
    });
  }
  const summary = packer.updateRollingSummary('', older);
  check('summary mentions compressed header', /Earlier conversation/i.test(summary));
  check('summary keeps path constraint', /\/mnt\/nvme\/data/.test(summary));
  check('summary keeps host', /flak3dd/.test(summary));
  check('summary under cap', summary.length <= packer.SUMMARY_CHAR_CAP + 40);
}

{
  const msgs = [];
  for (let i = 0; i < 40; i++) {
    msgs.push({
      id: 'u' + i,
      role: 'user',
      content: `Turn ${i}: continue work on services/agent/context.ts — keep MODEL_CONTEXT_LIMIT 16384. Host dgx-spark.local.`,
    });
    msgs.push({
      id: 'a' + i,
      role: 'assistant',
      content: `Continuing turn ${i} on context.ts for dgx-spark.local.`,
    });
  }
  const prior = packer.updateRollingSummary('', msgs.slice(0, 20));
  const packed = packer.packChatHistory({
    messages: msgs,
    priorSummary: prior,
    keepRecent: 24,
    inputBudget: 10000,
  });
  check('packs summary preamble', packed.summaryUsed.length > 0);
  check('keeps recent verbatim count', packed.recentCount === 24 || packed.recentCount === 24);
  check(
    'includes summary user preamble',
    packed.messages[0]?.role === 'user' && /Earlier conversation/i.test(packed.messages[0].content)
  );
  check(
    'recent includes latest user text',
    packed.messages.some(
      (m) => m.role === 'user' && /Turn 39:/.test(String(m.content))
    )
  );
  check(
    'old turn not verbatim (turn 0 dropped to summary)',
    !packed.messages.some((m) => m.role === 'user' && /Turn 0:/.test(String(m.content)))
  );
  check('estimated tokens under budget-ish', packed.estimatedTokens < 12000);

  const refreshed = packer.refreshPersistedSummary({
    priorSummary: prior,
    messages: msgs,
    keepRecent: 24,
  });
  check('persisted summary non-empty when overflow', refreshed.length > 40);

  const short = packer.refreshPersistedSummary({
    priorSummary: 'keep-me',
    messages: msgs.slice(-4),
    keepRecent: 24,
  });
  check('short chat keeps prior summary without re-fold', short === 'keep-me');
}

{
  const blob = packer.buildConversationGoalBlob({
    goal: 'Implement chat history packer',
    priorSummary: 'Key constraints: path=/Users/adminuser/abliterated_ui; host=192.168.4.103',
    messages: [
      { role: 'user', content: 'Work in /Users/adminuser/abliterated_ui on 192.168.4.103' },
      { role: 'assistant', content: 'Will use that path and host.' },
      { role: 'user', content: 'Also respect 16384 context.' },
    ],
  });
  check('BUILD blob has goal', /Active goal:.*history packer/i.test(blob));
  check('BUILD blob has path', /abliterated_ui/.test(blob));
  check('BUILD blob has host', /192\.168\.4\.103/.test(blob));
}

{
  const prompt = chatPrompt.buildNormalChatSystemPrompt({
    antiHallucination: false,
    activeFilesSummary: '  (none)',
  });
  check(
    'system prompt has history recall rules',
    /use and reference conversation history/i.test(prompt) &&
      /Do not ignore earlier turns/i.test(prompt)
  );
  check(
    'system prompt mentions citing constraints',
    /cite prior user constraints/i.test(prompt)
  );
}

{
  // Budget shrink: huge recent messages should still fit
  const huge = [];
  for (let i = 0; i < 30; i++) {
    huge.push({
      id: 'u' + i,
      role: 'user',
      content: ('PATH /opt/big/file.py HOST box' + i + ' ').repeat(200),
    });
    huge.push({
      id: 'a' + i,
      role: 'assistant',
      content: ('ok ' + i + ' ').repeat(200),
    });
  }
  const packed = packer.packChatHistory({
    messages: huge,
    keepRecent: 24,
    inputBudget: 4000,
  });
  check('aggressive budget still returns messages', packed.messages.length >= 2);
  check('aggressive budget under soft limit', packed.estimatedTokens <= 4500);
  const lastUser = [...packed.messages].reverse().find((m) => m.role === 'user');
  check(
    'aggressive budget protects latest user path marker',
    lastUser && /HOST box29/.test(String(lastUser.content))
  );
}

{
  // Default keepRecent (speed-oriented) still protects newest ask
  const msgs = [];
  for (let i = 0; i < 40; i++) {
    msgs.push({ id: 'u' + i, role: 'user', content: 'Turn ' + i + ': work on services/chatHistoryPacker.ts' });
    msgs.push({ id: 'a' + i, role: 'assistant', content: 'Ack ' + i });
  }
  const packed = packer.packChatHistory({ messages: msgs, inputBudget: 9000 });
  check('default keepRecent <= 16', packed.recentCount <= 16);
  check(
    'default pack keeps latest user turn',
    packed.messages.some((m) => m.role === 'user' && /Turn 39:/.test(String(m.content)))
  );
  check('default summary tighter than old 1600 cap', packed.summaryUsed.length <= 1200 + 80);
}

let failed = 0;
for (const [name, ok] of checks) {
  console.log(ok ? 'PASS' : 'FAIL', '—', name);
  if (!ok) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
