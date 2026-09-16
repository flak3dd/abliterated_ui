import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(os.tmpdir(), 'abliterated-model-resolve');
fs.mkdirSync(outDir, { recursive: true });
const tsc = spawnSync(
  path.join(root, 'node_modules/.bin/tsc'),
  [
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
const m = require(path.join(outDir, 'modelResolve.js'));
const cat = require(path.join(outDir, 'modelCatalog.js'));

const checks = [
  [
    'spark prefers qwen',
    m.resolveChatModel('spark', ['qwen-abliterated'], null).id === 'qwen-abliterated',
  ],
  [
    'featherless rejects leftover qwen if not in catalog',
    m.resolveChatModel('featherless', ['meta-llama/Meta-Llama-3.1-8B-Instruct'], 'qwen-abliterated').id ===
      'meta-llama/Meta-Llama-3.1-8B-Instruct',
  ],
  [
    'abliteration prefers named id',
    m.resolveChatModel('abliteration', ['abliterated-model', 'other'], null).id === 'abliterated-model',
  ],
  [
    'abliteration host stays abliteration even in spark mode',
    m.routeFromHost('api.abliteration.ai', 'spark') === 'abliteration',
  ],
  [
    'abliteration catalog names large v2',
    cat.prettyModelName('abliterated-model-large-v2') === 'Abliterated Large v2',
  ],
  [
    'ddb loadable when bridge does not mark missing',
    m.imageLoadable('ddb-edit').ok === true,
  ],
  [
    'ddb blocked when weights unavailable',
    m.imageLoadable('ddb-edit', { available: false }).ok === false,
  ],
  [
    'filterModels matches id fragment',
    cat.filterModels([{ id: 'krea2-raw-fp8', name: 'Krea' }], 'krea').length === 1,
  ],
  [
    'rankModels puts selected+loaded first',
    cat.rankModels([
      { id: 'b', available: true },
      { id: 'a', selected: true, loaded: true, available: true },
    ])[0].id === 'a',
  ],
  ['model enabled by default', cat.isModelEnabled({}, 'krea2-raw-fp8') === true],
  [
    'ddb toggle aliases both ids',
    cat.isModelEnabled({ 'ddb-edit': false }, 'xing0916/DDB_Edit') === false,
  ],
  [
    'merge collapses ddb huggingface alias',
    cat
      .mergeImageCatalog(
        [{ id: 'ddb-edit', name: 'DDB Edit', badge: 'ID', desc: '' }],
        ['ddb-edit', 'xing0916/DDB_Edit', 'krea2-raw-fp8']
      )
      .map((x) => x.id)
      .join(',') === 'ddb-edit,krea2-raw-fp8',
  ],
  [
    'canonical ddb id is short studio id',
    cat.canonicalImageModelId('xing0916/DDB_Edit') === 'ddb-edit',
  ],
];
let fail = 0;
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
  if (!ok) fail += 1;
}
process.exit(fail ? 1 : 0);
