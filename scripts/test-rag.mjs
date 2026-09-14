import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(os.tmpdir(), 'abliterated-rag-js');
fs.mkdirSync(outDir, { recursive: true });

const tsc = spawnSync(
  path.join(root, 'node_modules/.bin/tsc'),
  [
    path.join(root, 'services/ragService.ts'),
    path.join(root, 'services/ragDataset.ts'),
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
  console.error(tsc.stdout || '');
  console.error(tsc.stderr || '');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const rag = require(path.join(outDir, 'ragService.js'));
const { KNOWLEDGE_DATASET, KNOWLEDGE_DATASET_VERSION } = require(path.join(outDir, 'ragDataset.js'));

const docs = KNOWLEDGE_DATASET.map((record) => ({
  id: record.id,
  title: record.title,
  path: record.path,
  content: record.content,
  source: 'seed',
  updatedAt: Date.now(),
  contentHash: rag.hashContent(record.content),
}));

docs.push({
  id: 'sandbox:env:main.py',
  title: 'main.py',
  path: 'main.py',
  content:
    'def add(a, b):\n    """Return the sum of a and b."""\n    return a + b\n\ndef mul(a, b):\n    return a * b\n',
  source: 'sandbox',
  envId: 'env_test',
  updatedAt: Date.now(),
  contentHash: rag.hashContent('def add'),
});

const chunks = rag.buildChunks(docs);
const hostHits = rag.retrieveChunks(chunks, 'What is the Spark LAN IP and vLLM port?', 6);
const codeHits = rag.retrieveChunks(chunks, 'Where is the add function defined?', 4);
const ragHits = rag.retrieveChunks(chunks, 'How does local RAG retrieval work in this app?', 4);
const emptyHits = rag.retrieveChunks(chunks, 'xyzzy-unrelated-quantum-bananas', 4);

function topPath(hits) {
  return hits[0]?.chunk?.path || hits[0]?.chunk?.title || null;
}

const checks = [
  ['dataset has 9+ docs', KNOWLEDGE_DATASET.length >= 9],
  ['chunks built', chunks.length >= 12],
  ['LAN IP retrieved', hostHits.some((h) => h.chunk.text.includes('192.168.4.103'))],
  ['vLLM port retrieved', hostHits.some((h) => h.chunk.text.includes('8000'))],
  ['sandbox function retrieved', codeHits.some((h) => h.chunk.path === 'main.py')],
  ['RAG ops retrieved', ragHits.some((h) => /BM25|hashed dense|Knowledge tab/i.test(h.chunk.text))],
  ['noise ranked below cluster facts', emptyHits.length === 0 || emptyHits[0].score < hostHits[0].score],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
  if (!ok) failed += 1;
}

console.log('version', KNOWLEDGE_DATASET_VERSION, 'docs', KNOWLEDGE_DATASET.length, 'chunks', chunks.length);
console.log('top host hit:', topPath(hostHits), hostHits[0]?.score?.toFixed(3));
console.log('top code hit:', topPath(codeHits), codeHits[0]?.score?.toFixed(3));
process.exit(failed ? 1 : 0);
