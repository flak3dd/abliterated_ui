import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execP = promisify(exec);

async function testDirect() {
  const key = '"/Users/adminuser/Library/Application Support/NVIDIA/Sync/config/nvsync.key"';
  const cmd = process.argv.slice(2).join(' ') || 'cat /mnt/nvme/ocr_pipeline/quick_run.py';
  console.log(`Running remote cmd: ${cmd}`);
  try {
    const { stdout, stderr } = await execP(`ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no -i ${key} flak3dd@192.168.4.103 ${JSON.stringify(cmd)}`);
    console.log('--- STDOUT ---');
    console.log(stdout);
    if (stderr) console.error('--- STDERR ---', stderr);
  } catch (err) {
    console.error('EXEC ERROR:', err.message);
  }
}

testDirect();
