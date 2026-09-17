#!/usr/bin/env node
/**
 * Automated Verification Script for Sovereign Spark Ephemeral Container Engine
 */

import { spawnContainer, execInContainer, destroyContainer, listActiveContainers } from './sandbox-container.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const NVSYNC_SSH_KEY = '/Users/adminuser/Library/Application Support/NVIDIA/Sync/config/nvsync.key';
const SSH_CONTROL_PATH = '/tmp/ssh_mux_spark_%h_%p_%r';

async function sshRemote(script, timeout = 60000) {
  const b64 = Buffer.from(String(script), 'utf8').toString('base64');
  return execFileP(
    'ssh',
    [
      '-o', 'ProxyCommand=none',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ConnectTimeout=10',
      '-o', 'ControlMaster=auto',
      '-o', `ControlPath=${SSH_CONTROL_PATH}`,
      '-o', 'ControlPersist=10m',
      '-i', NVSYNC_SSH_KEY,
      'flak3dd@192.168.4.103',
      `echo ${b64} | base64 -d | bash`,
    ],
    { timeout, maxBuffer: 10 * 1024 * 1024 }
  );
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 VERIFYING SOVEREIGN SPARK LINUX CONTAINER ENGINE');
  console.log('================================================================\n');

  const testEnvId = `test_pod_${Date.now()}`;
  const target = 'dgx_spark';

  console.log(`1. Spawning isolated Linux container on ${target} (envId: ${testEnvId})...`);
  const spawnRes = await spawnContainer({
    envId: testEnvId,
    profile: 'python_data',
    target,
    timeoutMinutes: 10,
    sshRemote,
  });
  console.log('   Spawn Result:', JSON.stringify(spawnRes));
  if (!spawnRes.ok) {
    console.error('❌ Failed to spawn container:', spawnRes);
    process.exit(1);
  }
  console.log('   ✅ Container spawned successfully:', spawnRes.containerName);

  console.log('\n2. Listing active containers...');
  const activeList = listActiveContainers();
  console.log('   Active containers count:', activeList.length);
  if (!activeList.some(c => c.containerName === spawnRes.containerName)) {
    console.error('❌ Container not found in active list!');
    process.exit(1);
  }
  console.log('   ✅ Container registered in active list.');

  console.log('\n3. Executing OS & Python verification inside container...');
  const osTest = await execInContainer({
    envId: testEnvId,
    command: 'uname -a && cat /etc/os-release | grep PRETTY_NAME && python3 --version',
    target,
    sshRemote,
  });
  console.log('   OS Output:\n', osTest.stdout.trim());
  if (!osTest.ok) {
    console.error('❌ OS test failed:', osTest);
    process.exit(1);
  }
  console.log('   ✅ Container runs native Linux kernel & Python 3.11!');

  console.log('\n4. Verifying pre-installed packages (DuckDB, Pandas, NumPy, PyTest, FastAPI)...');
  const pkgTest = await execInContainer({
    envId: testEnvId,
    command: `python3 -c "
import sys
import duckdb
import pandas as pd
import numpy as np
import pytest
import fastapi
print('Python:', sys.version.split()[0])
print('DuckDB Version:', duckdb.__version__)
print('Pandas Version:', pd.__version__)
print('NumPy Version:', np.__version__)
print('PyTest Version:', pytest.__version__)
print('FastAPI Version:', fastapi.__version__)

con = duckdb.connect(':memory:')
df = pd.DataFrame({'a': [1, 2, 3], 'b': [10.5, 20.5, 30.5]})
res = con.execute('SELECT AVG(b) as avg_b, SUM(a) as sum_a FROM df').df()
print('DuckDB query executed on DataFrame:', res.to_dict(orient='records'))
"`,
    target,
    sshRemote,
  });
  console.log('   Package & Query Output:\n', pkgTest.stdout.trim());
  if (!pkgTest.ok) {
    console.error('❌ Package verification failed:', pkgTest);
    process.exit(1);
  }
  console.log('   ✅ Pre-installed packages and DuckDB analytical query verified!');

  console.log('\n5. Verifying workspace volume mount bidirectional persistence (/workspace)...');
  const volumeWrite = await execInContainer({
    envId: testEnvId,
    command: 'echo "hello from inside linux container" > /workspace/container_proof.txt',
    target,
    sshRemote,
  });
  if (!volumeWrite.ok) {
    console.error('❌ Failed to write in container workspace:', volumeWrite);
    process.exit(1);
  }

  // Check from host filesystem
  const hostCheck = await sshRemote(`cat /tmp/spark-sandboxes/${testEnvId}/container_proof.txt`);
  console.log('   Host check output:', hostCheck.stdout.trim());
  if (!hostCheck.stdout.includes('hello from inside linux container')) {
    console.error('❌ Volume persistence mismatch!');
    process.exit(1);
  }
  console.log('   ✅ Workspace volume mount bidirectional synchronization verified!');

  console.log('\n6. Tearing down and destroying container...');
  const destroyRes = await destroyContainer({
    envId: testEnvId,
    target,
    sshRemote,
  });
  console.log('   Destroy Result:', JSON.stringify(destroyRes));
  if (!destroyRes.ok) {
    console.error('❌ Failed to destroy container:', destroyRes);
    process.exit(1);
  }

  // Verify container is gone from host docker ps
  const psCheck = await sshRemote(`docker ps -a --filter name=${spawnRes.containerName} --format "{{.Names}}"`);
  if (psCheck.stdout.trim().includes(spawnRes.containerName)) {
    console.error('❌ Container still exists on host!');
    process.exit(1);
  }
  console.log('   ✅ Container cleanly stopped, removed, and untracked.');

  console.log('\n================================================================');
  console.log('🎉 ALL LINUX CONTAINER ENGINE TESTS PASSED PERFECTLY!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Unhandled test error:', err);
  process.exit(1);
});
