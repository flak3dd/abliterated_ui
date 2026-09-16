import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(os.tmpdir(), 'abliterated-mesh-routing');
fs.mkdirSync(outDir, { recursive: true });
const tsc = spawnSync(
  path.join(root, 'node_modules/.bin/tsc'),
  [
    path.join(root, 'services/meshRouting.ts'),
    path.join(root, 'services/apiConfig.ts'),
    path.join(root, 'services/modelResolve.ts'),
    path.join(root, 'services/modelCatalog.ts'),
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
const require = createRequire(import.meta.url);
const mesh = require(path.join(outDir, 'services/meshRouting.js'));
const api = require(path.join(outDir, 'services/apiConfig.js'));
const models = require(path.join(outDir, 'services/modelResolve.js'));

const candidates = [
  { id: 'spark_vllm_lan', host: '192.168.4.103', port: 8000, chatRoute: true, group: 'local' },
  { id: 'image_bridge', host: '192.168.4.103', port: 7860, chatRoute: false, group: 'local' },
  {
    id: 'abliteration_cloud',
    host: 'api.abliteration.ai',
    port: 443,
    chatRoute: true,
    group: 'external',
    provider: 'abliterated',
  },
  {
    id: 'featherless_mesh',
    host: 'api.featherless.ai',
    port: 443,
    chatRoute: true,
    group: 'external',
    provider: 'featherless',
  },
];

const checks = [
  [
    'routeFromHost abliterated.io is abliteration',
    models.routeFromHost('api.abliterated.io') === 'abliteration',
  ],
  [
    'routeFromHost abliteration.ai is abliteration',
    models.routeFromHost('api.abliteration.ai') === 'abliteration',
  ],
  [
    'routeFromHost abliterated.ai is abliteration',
    models.routeFromHost('api.abliterated.ai') === 'abliteration',
  ],
  [
    'cloudProviderFromHost abliterated.io',
    api.cloudProviderFromHost('api.abliterated.io') === 'abliteration',
  ],
  [
    'cloudProviderFromHost featherless.ai',
    api.cloudProviderFromHost('api.featherless.ai') === 'featherless',
  ],
  [
    'resolveApiUrl featherless.ai uses https',
    api.resolveApiUrl('api.featherless.ai', 443).startsWith('https://api.featherless.ai'),
  ],
  [
    'matchEndpoint 8000 is chat not image',
    mesh.matchEndpoint(candidates, '192.168.4.103', 8000)?.id === 'spark_vllm_lan',
  ],
  [
    'matchEndpoint 7860 is image',
    mesh.matchEndpoint(candidates, '192.168.4.103', 7860)?.id === 'image_bridge',
  ],
  [
    'LAN probe headers have no Authorization',
    !mesh.probeHeadersFor({ provider: undefined }, { abliteratedApiKey: 'secret' }).Authorization,
  ],
  [
    'abliterated probe headers include Bearer',
    mesh.probeHeadersFor({ provider: 'abliterated' }, { abliteratedApiKey: 'secret' }).Authorization ===
      'Bearer secret',
  ],
  [
    'restoreChatForMode cloud keeps Abliteration',
    mesh.restoreChatForMode('cloud', {
      cloud: { host: 'api.abliteration.ai', port: 443 },
    }).host === 'api.abliteration.ai',
  ],
  [
    'restoreChatForMode spark default',
    mesh.restoreChatForMode('spark', null).host === '192.168.4.103',
  ],
  [
    'local http page proxies Abliteration via :17332',
    api.cloudProxyUrlForPage(
      { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:8999' },
      'api.abliteration.ai',
      '/v1/models'
    ) === 'http://127.0.0.1:17332/abliteration/v1/models',
  ],
  [
    'https production page uses same-origin /api/cloud',
    api.cloudProxyUrlForPage(
      { protocol: 'https:', hostname: 'web.abliterated.app', origin: 'https://web.abliterated.app' },
      'api.abliteration.ai',
      '/v1/chat/completions'
    ) === 'https://web.abliterated.app/api/cloud/abliteration/v1/chat/completions',
  ],
  [
    'LAN spark host is not cloud-proxied',
    api.cloudProxyUrlForPage(
      { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:8999' },
      '192.168.4.103',
      '/v1/models'
    ) === null,
  ],
  [
    'LAN spark host is spark-proxied on local http page',
    api.sparkProxyUrlForPage(
      { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:8081' },
      '192.168.4.103',
      8000,
      '/v1/chat/completions'
    ) === 'http://127.0.0.1:17332/spark/192.168.4.103/8000/v1/chat/completions',
  ],
  [
    'loopback spark host is not spark-proxied',
    api.sparkProxyUrlForPage(
      { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:8081' },
      '127.0.0.1',
      8000,
      '/v1/models'
    ) === null,
  ],
];

let fail = 0;
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
  if (!ok) fail += 1;
}
process.exit(fail ? 1 : 0);
