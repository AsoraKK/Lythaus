import { readFile } from 'node:fs/promises';
import {
  buildWp004bBudgetFinalizerSummary,
  emergencyFinalizerSummary,
  writeWp004bAtomicJson,
} from '../../packages/authenticity/src/wp004b.ts';

function parseArgs(argv) {
  const options = {
    journal: '.artifacts/wp004b-call-accounting.json',
    output: '.artifacts/wp004b-budget-finalizer.json',
    caseOrder: ['B1', 'B2', 'B3'],
    maxCalls: 3,
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--journal') options.journal = argv[++index] ?? null;
    else if (argv[index] === '--output') options.output = argv[++index] ?? null;
    else if (argv[index] === '--case-order') options.caseOrder = (argv[++index] ?? '').split(',').filter(Boolean);
    else if (argv[index] === '--max-calls') options.maxCalls = Number(argv[++index]);
    else throw new Error('WP004B_FINALIZER_ARGUMENT_INVALID');
  }
  if (!options.journal || !options.output || !Number.isInteger(options.maxCalls) || options.maxCalls <= 0 || options.caseOrder.length === 0) {
    throw new Error('WP004B_FINALIZER_ARGUMENT_INVALID');
  }
  return options;
}

function safeErrorCategory(error) {
  return error instanceof Error && error.message === 'WP004B_FINALIZER_ARGUMENT_INVALID'
    ? error.message : 'WP004B_FINALIZER_FAILURE';
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(JSON.stringify({ schemaVersion: 'lythaus-wp004b-budget-finalizer-v1', status: 'FAILED', errorCategory: safeErrorCategory(error) }));
  process.exitCode = 1;
  options = { journal: '.artifacts/wp004b-call-accounting.json', output: '.artifacts/wp004b-budget-finalizer.json', caseOrder: ['B1', 'B2', 'B3'], maxCalls: 3 };
}
const profile = { caseOrder: options.caseOrder, maxJudgeCalls: options.maxCalls, maxTotalCalls: options.maxCalls };
let summary = emergencyFinalizerSummary(profile);
let failed = false;
try {
  const journal = JSON.parse(await readFile(options.journal, 'utf8'));
  summary = buildWp004bBudgetFinalizerSummary(journal, profile);
  failed = summary.budgetIntegrity !== 'PASS';
} catch (error) {
  failed = true;
  console.error(JSON.stringify({ schemaVersion: summary.schemaVersion, status: 'FAILED', errorCategory: safeErrorCategory(error) }));
}
try {
  await writeWp004bAtomicJson(options.output, summary);
} catch (error) {
  failed = true;
  console.error(JSON.stringify({ schemaVersion: summary.schemaVersion, status: 'FAILED', errorCategory: safeErrorCategory(error) }));
}
console.log(JSON.stringify(summary));
if (failed) process.exitCode = 1;
