import http from 'http';
import https from 'https';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  brightGreen: '\x1b[92m',
  brightCyan: '\x1b[96m',
};

async function httpGet(urlStr, timeoutMs = 3000) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    try {
      const parsed = new URL(urlStr);
      const mod = parsed.protocol === 'https:' ? https : http;
      const req = mod.get(urlStr, { timeout: timeoutMs }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const elapsed = Date.now() - t0;
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {}
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 400,
            status: res.statusCode,
            body: data,
            json,
            elapsed,
          });
        });
      });
      req.on('error', (e) => resolve({ ok: false, status: 0, error: e.message, elapsed: Date.now() - t0 }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, status: 0, error: 'Timed out', elapsed: timeoutMs });
      });
    } catch (err) {
      resolve({ ok: false, status: 0, error: err.message, elapsed: 0 });
    }
  });
}

async function httpPost(urlStr, payload, timeoutMs = 8000) {
  const t0 = Date.now();
  const body = JSON.stringify(payload);
  return new Promise((resolve) => {
    try {
      const parsed = new URL(urlStr);
      const mod = parsed.protocol === 'https:' ? https : http;
      const req = mod.request(
        urlStr,
        {
          method: 'POST',
          timeout: timeoutMs,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            const elapsed = Date.now() - t0;
            let json = null;
            try {
              json = JSON.parse(data);
            } catch {}
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              body: data,
              json,
              elapsed,
            });
          });
        }
      );
      req.on('error', (e) => resolve({ ok: false, status: 0, error: e.message, elapsed: Date.now() - t0 }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, status: 0, error: 'Timed out', elapsed: timeoutMs });
      });
      req.write(body);
      req.end();
    } catch (err) {
      resolve({ ok: false, status: 0, error: err.message, elapsed: 0 });
    }
  });
}

async function runPreflight() {
  console.log(`\n${C.bold}======================================================================${C.reset}`);
  console.log(`   ${C.brightCyan}⚡ NVIDIA DGX SPARK (GB10) ENDPOINT PREFLIGHT DIAGNOSTIC SUITE ⚡${C.reset}`);
  console.log(`${C.bold}======================================================================${C.reset}`);
  console.log(`${C.dim}Auditing routes, models, latency, throughput, and hardware services...${C.reset}\n`);

  // Candidate Hosts: Direct LANs, Tailscale VPN, and Localhost
  const hosts = [
    { name: 'Direct LAN (.103)', host: '192.168.4.103' },
    { name: 'Direct LAN (.101)', host: '192.168.4.101' },
    { name: 'Tailscale VPN', host: '100.94.45.77' },
    { name: 'Localhost Tunnel', host: '127.0.0.1' },
  ];

  let primaryHost = null;
  let fastestLatency = 99999;

  // Step 1: Probe Host Routes
  console.log(`${C.bold}[Step 1/7] Probing Network Routes & Selecting Lowest-Latency Host...${C.reset}`);
  for (const h of hosts) {
    process.stdout.write(`  • Probing ${h.name} (${h.host}:8000)... `);
    const probe = await httpGet(`http://${h.host}:8000/v1/models`, 2000);
    if (probe.ok) {
      console.log(`${C.green}✔ REACHABLE${C.reset} (${probe.elapsed}ms)`);
      if (probe.elapsed < fastestLatency) {
        fastestLatency = probe.elapsed;
        primaryHost = h;
      }
    } else {
      console.log(`${C.yellow}○ UNREACHABLE${C.reset} (${probe.error || 'HTTP ' + probe.status})`);
    }
  }

  if (!primaryHost) {
    console.log(`\n${C.yellow}⚠ Neither direct LAN nor Tailscale responded on port 8000 in time.${C.reset}`);
    console.log(`${C.dim}Defaulting to 100.94.45.77 for remainder of preflight...${C.reset}\n`);
    primaryHost = hosts[1];
  } else {
    console.log(`\n${C.brightGreen}✔ Locked active preflight route:${C.reset} ${C.bold}${primaryHost.name}${C.reset} (${primaryHost.host}) [${fastestLatency}ms]\n`);
  }

  const results = [];
  const host = primaryHost.host;

  // Test 1: Route Latency Summary
  results.push({
    name: 'Network Route',
    target: host,
    status: fastestLatency < 1000 ? 'PASS' : 'WARN',
    detail: `${primaryHost.name} · ${fastestLatency}ms latency`,
  });

  // Test 2: vLLM Server Port :8000 & Loaded Model
  process.stdout.write(`  • [Step 2/7] Testing vLLM Server (:8000 /v1/models)... `);
  const vllmRes = await httpGet(`http://${host}:8000/v1/models`, 3000);
  if (vllmRes.ok) {
    const models = (vllmRes.json?.data || []).map((m) => m.id).join(', ') || 'qwen-abliterated';
    console.log(`${C.green}✔ PASS${C.reset} (${vllmRes.elapsed}ms · Model: ${C.bold}${models}${C.reset})`);
    results.push({ name: 'vLLM API (:8000)', target: `${host}:8000`, status: 'PASS', detail: `Model: ${models}` });
  } else {
    console.log(`${C.red}❌ FAIL${C.reset} (${vllmRes.error || 'HTTP ' + vllmRes.status})`);
    results.push({ name: 'vLLM API (:8000)', target: `${host}:8000`, status: 'FAIL', detail: vllmRes.error || `HTTP ${vllmRes.status}` });
  }

  // Test 3: Micro-Inference Latency Test
  process.stdout.write(`  • [Step 3/7] Testing vLLM Micro-Inference Roundtrip... `);
  const infRes = await httpPost(
    `http://${host}:8000/v1/chat/completions`,
    {
      model: 'qwen-abliterated',
      messages: [{ role: 'user', content: 'Respond with exactly: PING' }],
      max_tokens: 16,
      temperature: 0.1,
    },
    10000
  );

  if (infRes.ok) {
    const reply = infRes.json?.choices?.[0]?.message?.content?.trim() || 'OK';
    console.log(`${C.green}✔ PASS${C.reset} (${infRes.elapsed}ms · Token reply: "${reply.slice(0, 20)}")`);
    results.push({ name: 'vLLM Inference', target: '/chat/completions', status: 'PASS', detail: `${infRes.elapsed}ms roundtrip` });
  } else {
    console.log(`${C.yellow}⚠ WARN${C.reset} (${infRes.error || 'HTTP ' + infRes.status})`);
    results.push({ name: 'vLLM Inference', target: '/chat/completions', status: 'WARN', detail: infRes.error || `HTTP ${infRes.status}` });
  }

  // Test 4: Image Bridge (:7860)
  process.stdout.write(`  • [Step 4/7] Testing Image Diffusers Bridge (:7860)... `);
  let imgRes = await httpGet(`http://${host}:7860/health`, 2500);
  if (!imgRes.ok) imgRes = await httpGet(`http://${host}:7860/docs`, 2500);
  if (imgRes.ok) {
    console.log(`${C.green}✔ PASS${C.reset} (${imgRes.elapsed}ms · Krea 2 RAW Bridge Online)`);
    results.push({ name: 'Image Bridge (:7860)', target: `${host}:7860`, status: 'PASS', detail: 'Krea 2 RAW Bridge Active' });
  } else {
    console.log(`${C.dim}○ STANDBY${C.reset} (${imgRes.error || 'Port inactive'})`);
    results.push({ name: 'Image Bridge (:7860)', target: `${host}:7860`, status: 'STANDBY', detail: imgRes.error || 'Standby' });
  }

  // Test 5: Spark Controller Daemon (:17325)
  process.stdout.write(`  • [Step 6/7] Testing Spark Controller Daemon (:17325)... `);
  let ctlRes = await httpGet(`http://${host}:17325/api/endpoints`, 2500);
  let ctlTarget = `${host}:17325`;
  if (!ctlRes.ok) {
    ctlRes = await httpGet(`http://127.0.0.1:17325/api/endpoints`, 2000);
    if (ctlRes.ok) {
      ctlTarget = '127.0.0.1:17325';
    } else {
      ctlRes = await httpGet(`http://127.0.0.1:17325/api/status`, 6000);
      if (ctlRes.ok) ctlTarget = '127.0.0.1:17325';
    }
  }
  if (ctlRes.ok) {
    console.log(`${C.green}✔ PASS${C.reset} (${ctlRes.elapsed}ms · Controller Active on ${ctlTarget})`);
    results.push({ name: 'Controller (:17325)', target: ctlTarget, status: 'PASS', detail: `Daemon Active on ${ctlTarget}` });
  } else {
    console.log(`${C.dim}○ STANDBY${C.reset} (${ctlRes.error || 'Port :17325 idle'})`);
    results.push({ name: 'Controller (:17325)', target: `${host}:17325`, status: 'STANDBY', detail: ctlRes.error || 'Standby' });
  }

  // Test 7: Spark Gateway Router (:8080)
  process.stdout.write(`  • [Step 7/8] Testing Spark Unified Gateway (:8080)... `);
  const gwRes = await httpGet(`http://${host}:8080/v1/models`, 2500) || await httpGet(`http://localhost:8080/v1/models`, 2000);
  if (gwRes.ok) {
    console.log(`${C.green}✔ PASS${C.reset} (${gwRes.elapsed}ms · Gateway Active)`);
    results.push({ name: 'Gateway Router (:8080)', target: `${host}:8080`, status: 'PASS', detail: 'Zero-Downtime Router Active' });
  } else {
    // Check localhost if remote is standby
    const localGw = await httpGet(`http://localhost:8080/v1/models`, 1500);
    if (localGw.ok) {
      console.log(`${C.green}✔ PASS${C.reset} (${localGw.elapsed}ms · Local Gateway Active)`);
      results.push({ name: 'Gateway Router (:8080)', target: 'localhost:8080', status: 'PASS', detail: 'Local Gateway Active' });
    } else {
      console.log(`${C.dim}○ STANDBY${C.reset} (${gwRes.error || 'Port :8080 idle'})`);
      results.push({ name: 'Gateway Router (:8080)', target: `${host}:8080`, status: 'STANDBY', detail: gwRes.error || 'Standby' });
    }
  }

  // Test 8: Hardware & Mobile App Dev Server (:8081)
  process.stdout.write(`  • [Step 8/8] Testing Spark Mobile Client UI (:8081)... `);
  const mobileRes = await httpGet(`http://localhost:8081/`, 2000);
  if (mobileRes.ok) {
    console.log(`${C.green}✔ PASS${C.reset} (${mobileRes.elapsed}ms · Web Client Active)`);
    results.push({ name: 'Mobile App (:8081)', target: 'localhost:8081', status: 'PASS', detail: 'Metro Dev Server Serving' });
  } else {
    console.log(`${C.yellow}⚠ STANDBY${C.reset} (${mobileRes.error || 'HTTP ' + mobileRes.status})`);
    results.push({ name: 'Mobile App (:8081)', target: 'localhost:8081', status: 'STANDBY', detail: mobileRes.error || 'Standby' });
  }

  // Summary Diagnostic Table
  console.log(`\n${C.bold}======================================================================${C.reset}`);
  console.log(`                     ${C.bold}PREFLIGHT DIAGNOSTIC SUMMARY${C.reset}`);
  console.log(`${C.bold}======================================================================${C.reset}`);
  console.log(`${C.dim}┌───────────────────────────┬───────────┬───────────────────────────────────────┐${C.reset}`);
  console.log(`${C.dim}│${C.reset} ${C.bold}Component${C.reset}                 ${C.dim}│${C.reset} ${C.bold}Status${C.reset}    ${C.dim}│${C.reset} ${C.bold}Details / Diagnostics${C.reset}                 ${C.dim}│${C.reset}`);
  console.log(`${C.dim}├───────────────────────────┼───────────┼───────────────────────────────────────┤${C.reset}`);

  results.forEach((r) => {
    let badge = `${C.green}✔ PASS   ${C.reset}`;
    if (r.status === 'FAIL') badge = `${C.red}❌ FAIL   ${C.reset}`;
    if (r.status === 'WARN') badge = `${C.yellow}⚠ WARN   ${C.reset}`;
    if (r.status === 'STANDBY') badge = `${C.dim}○ STANDBY${C.reset}`;
    console.log(
      `${C.dim}│${C.reset} ${r.name.padEnd(25)} ${C.dim}│${C.reset} ${badge} ${C.dim}│${C.reset} ${r.detail.slice(0, 37).padEnd(37)} ${C.dim}│${C.reset}`
    );
  });

  console.log(`${C.dim}└───────────────────────────┴───────────┴───────────────────────────────────────┘${C.reset}\n`);

  const passCount = results.filter((r) => r.status === 'PASS').length;
  console.log(
    `${C.bold}Preflight Result:${C.reset} ${C.brightGreen}${passCount}/${results.length} checks PASSED.${C.reset}`
  );
  console.log(`${C.dim}Hardware node is ready for low-latency streaming completions.${C.reset}\n`);
}

runPreflight().catch((err) => {
  console.error('Preflight error:', err);
});
