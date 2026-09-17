/**
 * Unit tests for evidence gate + ranked context packer.
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

async function loadTs(rel) {
  // Prefer tsx register via dynamic import of compiled path — use tsx if available
  const full = path.join(root, rel);
  try {
    return await import(pathToFileURL(full).href);
  } catch (e) {
    // fallback: spawn note
    throw e;
  }
}

function check(name, cond) {
  if (!cond) {
    console.error('FAIL', name);
    process.exitCode = 1;
  } else {
    console.log('ok', name);
  }
}

async function main() {
  // Run via: npx tsx scripts/test-evidence-context.mjs
  const ev = await import(pathToFileURL(path.join(root, 'services/agent/evidenceContext.ts')).href);

  const emptyRun = {
    id: 'r1', sessionId: 's', envId: 'e', goal: 'fix tests', status: 'running',
    steps: [], stepCount: 0, execCount: 0, createdAt: 1, updatedAt: 1,
  };
  const fake = ev.evaluateEvidenceGate(emptyRun, 'All tests passed. 12 passed in playwright.');
  check('blocks fake green without tools', !fake.ok);

  const withTools = {
    ...emptyRun,
    steps: [
      { id: '1', index: 0, tool: 'test', status: 'ok', excerpt: '3 passed', startedAt: 1, finishedAt: 2 },
    ],
    lastTestPassed: true,
  };
  const okSum = ev.evaluateEvidenceGate(
    withTools,
    '## Summary\nFixed the bug.\n\n## Evidence\n- test: 3 passed\n',
  );
  check('allows evidenced summary', okSum.ok);

  const listing = ev.evaluateEvidenceGate(emptyRun, 'The directory contains 40 files and ls output shows drwx.');
  check('blocks listing without list_files', !listing.ok);

  const pack = ev.buildRankedContextPack({
    goal: 'fix authentication middleware in src/middleware/auth.ts',
    workflowId: 'debugging',
    plan: [{ id: 'w1', title: 'Capture failure', status: 'open' }],
    env: {
      id: 'e', sessionId: 's', name: 'env', createdAt: 1, updatedAt: 1,
      files: {
        'src/middleware/auth.ts': { path: 'src/middleware/auth.ts', content: 'export function auth(){}', updatedAt: 1, sizeBytes: 10 },
        'README.md': { path: 'README.md', content: 'hello world unrelated', updatedAt: 1, sizeBytes: 10 },
        'package-lock.json': { path: 'package-lock.json', content: 'lock', updatedAt: 1, sizeBytes: 4 },
      },
    },
  });
  check('pack includes ranked-context', pack.includes('[ranked-context-pack]'));
  check('pack prefers auth middleware', pack.includes('src/middleware/auth.ts'));
  check('pack has workflow', pack.includes('[workflow]'));

  const paths = ev.extractMentionedPaths('See `src/foo.ts` and lib/bar.js for details.');
  check('extract paths', paths.includes('src/foo.ts') && paths.includes('lib/bar.js'));

  if (process.exitCode) {
    console.error('evidence tests failed');
    process.exit(1);
  }
  console.log('evidence_context_ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
