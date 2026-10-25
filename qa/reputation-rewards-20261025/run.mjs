import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ROOT, MAIN, INTERVAL_HEAD } from './pinned-source.mjs';

const directory = join(ROOT, 'qa/reputation-rewards-20261025/results');
mkdirSync(directory, { recursive: true });
const args = ['--experimental-strip-types', '--test', '--test-concurrency=1', '--test-reporter=tap',
  'qa/reputation-rewards-20261025/events.test.mjs',
  'qa/reputation-rewards-20261025/calendar-display.test.mjs',
  'qa/reputation-rewards-20261025/intervals.test.mjs'];
const startedAt = new Date().toISOString();
const output = createWriteStream(join(directory, 'node-test.tap.txt'));
let transcript = '';
const child = spawn(process.execPath, args, { cwd: ROOT,
  env: { PATH: dirname(process.execPath) + ':' + (process.env.PATH ?? ''), HOME: process.env.HOME, TMPDIR: process.env.TMPDIR },
  stdio: ['ignore', 'pipe', 'pipe'] });
for (const stream of [child.stdout, child.stderr]) stream.on('data', data => {
  transcript += data.toString(); output.write(data); process.stdout.write(data);
});
const result = await new Promise((resolve, reject) => {
  child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal }));
});
await new Promise(resolve => output.end(resolve));
const count = name => Number(transcript.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1] ?? NaN);
writeFileSync(join(directory, 'summary.json'), JSON.stringify({ scope: 'ordinary-business-rule-qa', startedAt,
  finishedAt: new Date().toISOString(), sourceMain: MAIN, intervalCandidate: INTERVAL_HEAD,
  node: process.version, command: ['node', ...args].join(' '), ...result,
  tests: count('tests'), passed: count('pass'), failed: count('fail'), skipped: count('skipped'), cancelled: count('cancelled'),
  method: 'Pure calculators and local fake SQL/transaction driver only; no database/socket/provider calls.' }, null, 2) + '\n');
process.exitCode = result.code ?? 1;
