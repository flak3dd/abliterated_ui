import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execP = promisify(exec);
const SSH_KEY = '"/Users/adminuser/Library/Application Support/NVIDIA/Sync/config/nvsync.key"';
const SPARK_IP = '192.168.4.103';

async function sshExec(cmd) {
  try {
    const encoded = Buffer.from(cmd).toString('base64');
    const { stdout, stderr } = await execP(
      `ssh -o ConnectTimeout=8 -o StrictHostKeyChecking=no -i ${SSH_KEY} flak3dd@${SPARK_IP} "echo ${encoded} | base64 -d | bash"`
    );
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (e) {
    return { ok: false, error: e.message, stdout: (e.stdout || '').trim(), stderr: (e.stderr || '').trim() };
  }
}

async function main() {
  const script = `
nvidia-smi
ps aux | grep serve-openai-bridge | grep -v grep
`;
  const res = await sshExec(script);
  console.log(res.stdout);
}

main().catch(console.error);
