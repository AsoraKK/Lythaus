import { readFile } from 'node:fs/promises';
import { buildWp004bBudgetFinalizerSummary, emergencyFinalizerSummary, writeWp004bAtomicJson } from '../../packages/authenticity/src/wp004b.ts';

function parseArgs(argv) {
  const options = { journal: '.artifacts/wp004b-call-accounting.json', output: '.artifacts/wp004b-budget-finalizer.json' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--journal') options.journal = argv[++index] ?? null;
    else if (argv[index] === '--output') options.output = argv[++index] ?? null;
    else throw new Error('WP004B_FINALIZER_ARGUMENT_INVALID');
  }
  return options;
}

function safeErrorCategory(error) {
  return error instanceof Error && error.message === 'WP004B_FINALIZER_ARGUMENT_INVALID'
    ? error.message : 'WP004B_FINALIZER_FAILURE';
}

const options = parseArgs(process.argv.slice(2));
let summary = emergencyFinalizerSummary();
let failed = false;
try {
  const journal = JSON.parse(await readFile(options.journal, 'utf8'));
  summary = buildWp004bBudgetFinalizerSummary(journal);
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
