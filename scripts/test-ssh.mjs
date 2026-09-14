import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execP = promisify(exec);

async function testDirect() {
  const key = '"/Users/adminuser/Library/Application Support/NVIDIA/Sync/config/nvsync.key"';
  
  for (const host of ['192.168.4.103', '192.168.4.101', '100.94.45.77']) {
    console.log(`Testing direct SSH to ${host}...`);
    try {
      const { stdout } = await execP(`ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no -i ${key} flak3dd@${host} 'hostname; uptime'`);
      console.log(`SUCCESS on ${host}:`, stdout.trim());
      break;
    } catch (err) {
      console.log(`Failed on ${host}:`, err.message.slice(0, 100));
    }
  }
}

testDirect();
