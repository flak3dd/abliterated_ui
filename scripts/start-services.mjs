import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';

const execP = promisify(exec);

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  brightGreen: '\x1b[92m',
  brightCyan: '\x1b[96m',
};

async function httpCheck(urlStr, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    try {
      const req = http.get(urlStr, { timeout: timeoutMs }, (res) => {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, elapsed: Date.now() - t0 });
      });
      req.on('error', (e) => resolve({ ok: false, error: e.message, elapsed: Date.now() - t0 }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timed out', elapsed: timeoutMs }); });
    } catch (err) {
      resolve({ ok: false, error: err.message, elapsed: 0 });
    }
  });
}

async function bootAllServices() {
  console.log(`\n${C.bold}======================================================================${C.reset}`);
  console.log(`   ${C.brightCyan}⚡ BOOTSTRAPPING ALL SERVICES: :7860, :8188, :17325 ⚡${C.reset}`);
  console.log(`${C.bold}======================================================================${C.reset}\n`);

  // 1. Image Bridge & ComfyUI on DGX Spark (flak3dd)
  console.log(`${C.cyan}1. Launching Image Bridge (:7860) & ComfyUI (:8188) on DGX Spark...${C.reset}`);

  const remoteBootScript = `
    set -euo pipefail

    # A. Launch Diffusers Image Bridge (:7860) with 0.0.0.0 binding
    echo -n "  • Starting Diffusers Image Bridge (:7860)... "
    IMG_DIR="/home/flak3dd/abliterated-spark/spark-image"
    if [ -d "$IMG_DIR" ]; then
      cd "$IMG_DIR"
      mkdir -p logs
      if ! ss -tlpn 2>/dev/null | grep -q ":7860"; then
        nohup env ABLITERATED_IMAGE_HOST=0.0.0.0 ABLITERATED_IMAGE_PORT=7860 ./serve-spark.sh </dev/null > logs/bridge.log 2>&1 &
        echo "STARTED (PID: $!)"
      else
        echo "ALREADY RUNNING"
      fi
    else
      echo "FAILED (Dir not found: $IMG_DIR)"
    fi

    # B. Launch ComfyUI Graph Engine (:8188) with 0.0.0.0 binding
    echo -n "  • Starting ComfyUI Graph Engine (:8188)... "
    COMFY_DIR="/home/flak3dd/ComfyUI"
    if [ -d "$COMFY_DIR" ]; then
      cd "$COMFY_DIR"
      if ! ss -tlpn 2>/dev/null | grep -q ":8188"; then
        PY="$COMFY_DIR/.venv/bin/python"
        [ ! -x "$PY" ] && PY="python3"
        nohup "$PY" main.py --listen 0.0.0.0 --port 8188 --preview-method auto </dev/null > comfyui.log 2>&1 &
        echo "STARTED (PID: $!)"
      else
        echo "ALREADY RUNNING"
      fi
    else
      echo "FAILED (Dir not found: $COMFY_DIR)"
    fi
  `;

  try {
    const { stdout, stderr } = await execP(`ssh flak3dd '${remoteBootScript.replace(/'/g, "'\\''")}'`);
    console.log(stdout || stderr);
  } catch (err) {
    console.log(`${C.yellow}Remote execution output:${C.reset} ${err.message}`);
  }

  // 2. Launch Local Spark Controller (:17325)
  console.log(`\n${C.cyan}2. Launching Spark Controller Daemon (:17325)...${C.reset}`);
  const ctrlDir = '/Users/adminuser/abliterated/spark-controller';

  try {
    const isLive = await httpCheck('http://127.0.0.1:17325/api/endpoints', 800);
    if (!isLive.ok) {
      const child = spawn('node', ['server.mjs'], {
        cwd: ctrlDir,
        env: { ...process.env, HOST: '0.0.0.0', PORT: '17325' },
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      console.log(`  ${C.green}✔ Spark Controller spawned (PID: ${child.pid}) on http://127.0.0.1:17325${C.reset}`);
    } else {
      console.log(`  ${C.green}✔ Spark Controller already active on http://127.0.0.1:17325${C.reset}`);
    }
  } catch (err) {
    console.log(`${C.yellow}Local controller launch notice:${C.reset} ${err.message}`);
  }

  // 3. Launch Ephemeral Sandbox Runner (:17330)
  console.log(`\n${C.cyan}3. Launching Sandbox Runner Daemon (:17330)...${C.reset}`);
  const sandboxDir = '/Users/adminuser/abliterated_ui';
  try {
    const sandboxLive = await httpCheck('http://127.0.0.1:17330/health', 800);
    if (!sandboxLive.ok) {
      const child = spawn('node', ['scripts/sandbox-runner.mjs'], {
        cwd: sandboxDir,
        env: { ...process.env, SANDBOX_HOST: '0.0.0.0', SANDBOX_PORT: '17330' },
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      console.log(`  ${C.green}✔ Sandbox Runner spawned (PID: ${child.pid}) on http://127.0.0.1:17330${C.reset}`);
    } else {
      console.log(`  ${C.green}✔ Sandbox Runner already active on http://127.0.0.1:17330${C.reset}`);
    }
  } catch (err) {
    console.log(`${C.yellow}Sandbox runner launch notice:${C.reset} ${err.message}`);
  }

  // 4. Verification Poll
  console.log(`\n${C.bold}4. Verifying All Active Endpoints (Polling for readiness)...${C.reset}`);

  const checks = [
    { name: 'Image Bridge (:7860)', url: 'http://192.168.4.103:7860/health', altUrl: 'http://100.94.45.77:7860/health' },
    { name: 'ComfyUI (:8188)', url: 'http://192.168.4.103:8188/system_stats', altUrl: 'http://100.94.45.77:8188/system_stats' },
    { name: 'Controller (:17325)', url: 'http://127.0.0.1:17325/api/endpoints', altUrl: 'http://localhost:17325/' },
    { name: 'Sandbox Runner (:17330)', url: 'http://127.0.0.1:17330/health', altUrl: 'http://localhost:17330/health' },
    { name: 'vLLM LLM (:8000)', url: 'http://192.168.4.103:8000/v1/models', altUrl: 'http://100.94.45.77:8000/v1/models' },
    { name: 'Gateway (:8080)', url: 'http://127.0.0.1:8080/v1/models', altUrl: 'http://localhost:8080/v1/models' },
  ];

  for (let attempt = 1; attempt <= 4; attempt++) {
    console.log(`  • Probe attempt ${attempt}/4...`);
    await new Promise((r) => setTimeout(r, 1500));

    let allPassed = true;
    for (const item of checks) {
      if (item.passed) continue;

      let res = await httpCheck(item.url, 2000);
      if (!res.ok && item.altUrl) {
        res = await httpCheck(item.altUrl, 2000);
      }

      if (res.ok) {
        console.log(`    ${C.brightGreen}✔ ${item.name}${C.reset} is ONLINE! (${res.elapsed}ms)`);
        item.passed = true;
      } else {
        allPassed = false;
      }
    }

    if (allPassed) break;
  }

  console.log(`\n${C.bold}======================================================================${C.reset}`);
  console.log(`                 ${C.bold}SERVICE STATUS SUMMARY${C.reset}`);
  console.log(`${C.bold}======================================================================${C.reset}`);
  checks.forEach((c) => {
    const badge = c.passed ? `${C.green}✔ ONLINE  ${C.reset}` : `${C.yellow}○ STANDBY${C.reset}`;
    console.log(`  ${badge}  ${c.name.padEnd(26)} ${C.dim}--> ${c.url}${C.reset}`);
  });
  console.log(`======================================================================\n`);
}

bootAllServices().catch((err) => {
  console.error('Boot error:', err);
});
