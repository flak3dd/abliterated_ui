#!/usr/bin/env node
/**
 * Pushes compute, gateway, pubsub, and scripts to DGX Spark (192.168.4.103).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const KEY = '/Users/adminuser/Library/Application Support/NVIDIA/Sync/config/nvsync.key';
const HOST = process.env.SPARK_HOST || '192.168.4.103';
const USER = process.env.SPARK_USER || 'flak3dd';
const REMOTE_DIR = process.env.SPARK_DIR || '/home/flak3dd/abliterated_ui';

console.log('⚡ Pushing pipeline components to DGX Spark...');
console.log(`   Target: ${USER}@${HOST}:${REMOTE_DIR}`);

const rsyncArgs = [
  '-avz',
  '--progress',
  '-e',
  `ssh -o StrictHostKeyChecking=no -i "${KEY}"`,
  '--exclude', '__pycache__',
  '--exclude', '*.pyc',
  '--exclude', '.git',
  '--exclude', 'node_modules',
  '--exclude', '.next',
  '--exclude', 'dist',
  '--exclude', '.expo',
  path.join(REPO_ROOT, 'compute'),
  path.join(REPO_ROOT, 'gateway'),
  path.join(REPO_ROOT, 'services'),
  path.join(REPO_ROOT, 'scripts'),
  path.join(REPO_ROOT, 'edge'),
  path.join(REPO_ROOT, '.githooks'),
  `${USER}@${HOST}:${REMOTE_DIR}/`,
];

const child = spawn('rsync', rsyncArgs, { stdio: 'inherit' });

child.on('exit', (code) => {
  if (code === 0) {
    console.log('\n✔ Sync complete! Compute tier is updated on Spark.');
    console.log(`SSH into Spark and run:\n  cd ${REMOTE_DIR}\n  uvicorn compute.app:app --host 0.0.0.0 --port 8090 --reload\n`);
  } else {
    console.error(`\n✖ Rsync exited with code ${code}`);
    process.exit(code || 1);
  }
});
