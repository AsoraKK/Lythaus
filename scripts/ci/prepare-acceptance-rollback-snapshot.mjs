#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  createAcceptanceRollbackSnapshot,
  validateAcceptanceRollbackSnapshot,
} from '../release/acceptance-rollback-snapshot.mjs';

const args = process.argv.slice(2);
const argument = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const mode = args[0];
const outputPath = argument('--output');
const read = (name) => {
  const value = argument(name);
  if (!value) throw new Error(`${name} is required`);
  return JSON.parse(fs.readFileSync(value, 'utf8'));
};

if (!['capture', 'from-run', 'validate'].includes(mode) || !outputPath) {
  throw new Error('usage: prepare-acceptance-rollback-snapshot.mjs <capture|from-run|validate> --output <path> [inputs]');
}

let snapshot;
if (mode === 'capture') {
  snapshot = createAcceptanceRollbackSnapshot({
    workerDeployments: {
      public: read('--public'),
      admin: read('--admin'),
      jobs: read('--jobs'),
      coordinator: read('--coordinator'),
    },
    routeSnapshots: {
      adminApi: read('--admin-route'),
      coordinator: read('--coordinator-route'),
    },
  });
} else if (mode === 'from-run') {
  const run = read('--run');
  snapshot = validateAcceptanceRollbackSnapshot(run.rollbackSnapshot, { candidateDependencies: run.candidateDependencies ?? undefined });
} else {
  snapshot = validateAcceptanceRollbackSnapshot(read('--input'));
}

fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: 'VERIFIED', mode, output: outputPath }));
