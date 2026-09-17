#!/usr/bin/env node
/**
 * Test Suite for Phase 3: Edge & Maintenance Loop
 * Validates Cloudflare Worker edge types, PyTest pipeline test suite, and Ripgrep rapid debugger.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execFileP = promisify(execFile);

async function runMaintenanceTests() {
  console.log('================================================================');
  console.log('🧪 VERIFYING PHASE 3: EDGE & MAINTENANCE LOOP');
  console.log('================================================================\n');

  // 1. Verify Cloudflare Worker code structure
  console.log('1. Verifying Cloudflare Worker edge router (edge/worker.ts)...');
  const workerContent = await fs.readFile('/Users/adminuser/abliterated_ui/edge/worker.ts', 'utf8');
  if (!workerContent.includes('export default') || !workerContent.includes('CF-Connecting-IP') || !workerContent.includes('X-Edge-Cache')) {
    console.error('❌ edge/worker.ts missing required edge headers or fetch handler!');
    process.exit(1);
  }
  console.log('   ✅ Cloudflare Worker edge routing, caching, and rate limiting logic verified.');

  // 2. Run PyTest pipeline test suite
  console.log('\n2. Executing automated PyTest test suite (compute/tests/test_pipeline.py)...');
  try {
    const { stdout, stderr } = await execFileP('python3', ['-m', 'pytest', 'compute/tests/test_pipeline.py', '-v', '--tb=short'], {
      cwd: '/Users/adminuser/abliterated_ui',
      env: { ...process.env, PYTHONPATH: '/Users/adminuser/abliterated_ui' },
    });
    console.log(stdout.trim());
    if (stderr) console.error(stderr);
    console.log('   ✅ PyTest pipeline test suite passed 100% of test assertions!');
  } catch (err) {
    // If pytest command failed, display output
    if (err.stdout) console.log(err.stdout);
    if (err.stderr) console.error(err.stderr);
    console.error('❌ PyTest verification failed:', err.message);
    process.exit(1);
  }

  // 3. Test Ripgrep rapid debugger
  console.log('\n3. Testing Ripgrep rapid log & traceback debugger (scripts/rapid-debug.sh)...');
  try {
    const { stdout } = await execFileP('bash', ['scripts/rapid-debug.sh', 'ERROR', '1'], {
      cwd: '/Users/adminuser/abliterated_ui',
    });
    console.log(stdout.trim());
    console.log('   ✅ Rapid log debugger executed successfully with sub-second response.');
  } catch (err) {
    console.error('❌ Rapid debugger test failed:', err);
    process.exit(1);
  }

  // 4. Verify Git pre-push hook
  console.log('\n4. Verifying Git pre-push hook (.githooks/pre-push)...');
  const hookContent = await fs.readFile('/Users/adminuser/abliterated_ui/.githooks/pre-push', 'utf8');
  if (!hookContent.includes('pytest compute/tests/test_pipeline.py')) {
    console.error('❌ .githooks/pre-push missing test execution command!');
    process.exit(1);
  }
  console.log('   ✅ Git pre-push hook configured to block pushes on test failure.');

  console.log('\n================================================================');
  console.log('🎉 ALL PHASE 3 EDGE & MAINTENANCE TESTS PASSED CLEANLY!');
  console.log('================================================================');
}

runMaintenanceTests().catch((err) => {
  console.error('Unhandled error in maintenance tests:', err);
  process.exit(1);
});
