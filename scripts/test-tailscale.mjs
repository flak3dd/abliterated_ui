import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execP = promisify(exec);

async function checkStatusJson() {
  try {
    const { stdout } = await execP("ssh flak3dd 'tailscale status --json'");
    const data = JSON.parse(stdout);
    console.log('Self Host:', data.Self?.HostName, data.Self?.TailscaleIPs);
    console.log('MagicDNS Suffix:', data.MagicDNSSuffix);
    console.log('User Profile:', data.User);
    console.log('Peers count:', Object.keys(data.Peer || {}).length);
    for (const [key, peer] of Object.entries(data.Peer || {})) {
      console.log(`- Peer: ${peer.HostName} (${peer.TailscaleIPs?.[0]}) Active: ${peer.Active} OS: ${peer.OS} LastSeen: ${peer.LastSeen}`);
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
}

checkStatusJson();
