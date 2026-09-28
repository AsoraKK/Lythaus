import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const sanitizedExit = error => { const code = error?.message && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'AUTHORIZATION_LEDGER_FAILED'; process.stdout.write(`EVALUATION_AUTHORIZATION_REJECTED:${code}\n`); process.exitCode = 1; };
process.on('uncaughtException', sanitizedExit);
process.on('unhandledRejection', sanitizedExit);
const args = process.argv.slice(2);
const value = name => { const index = args.indexOf(name); if (index < 0 || !args[index + 1]) throw new Error('ARGUMENT_REQUIRED'); return args[index + 1]; };
const approval = JSON.parse(fs.readFileSync(path.resolve(value('--approval')), 'utf8'));
const sourceSha = value('--source-sha');
if (!/^[0-9a-f]{40}$/.test(sourceSha) || approval.sourceSha !== sourceSha) throw new Error('SOURCE_IDENTITY_MISMATCH');
if (!/^[A-Za-z0-9._:-]{8,128}$/.test(approval.authorizationId ?? '')) throw new Error('AUTHORIZATION_ID_REQUIRED');
const authorizationKey = createHash('sha256').update(JSON.stringify({ authorizationId: approval.authorizationId, sourceSha, checkpointSha256: approval.checkpointSha256, expiresAtEpochSeconds: approval.expiresAtEpochSeconds })).digest('hex');
const markerName = `authenticity-evaluation-consumed-${authorizationKey.slice(0, 32)}`;
const marker = { schemaVersion: 'lythaus-private-evaluation-consumed-v1', authorizationIdSha256: createHash('sha256').update(approval.authorizationId).digest('hex'), authorizationKey, sourceSha, consumedAt: new Date().toISOString(), runId: process.env.GITHUB_RUN_ID ?? null, maxSafeAttempts: approval.maxSafeAttempts ?? null, maxActiveMinutes: approval.maxActiveMinutes ?? null };
const writeOutput = output => { if (output) fs.appendFileSync(output, `artifact_name=${markerName}\n`, { encoding: 'utf8' }); };
const ledger = args.includes('--ledger') ? path.resolve(value('--ledger')) : null;
if (ledger) {
  fs.mkdirSync(path.dirname(ledger), { recursive: true, mode: 0o700 });
  try { const handle = fs.openSync(ledger, 'wx', 0o600); fs.writeFileSync(handle, JSON.stringify(marker) + '\n'); fs.closeSync(handle); }
  catch (error) { if (error?.code === 'EEXIST') throw new Error('AUTHORIZATION_ALREADY_CONSUMED'); throw error; }
  writeOutput(process.env.GITHUB_OUTPUT); process.stdout.write('EVALUATION_AUTHORIZATION_CONSUMED\n'); process.exit(0);
}
const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const api = process.env.GITHUB_API_URL ?? 'https://api.github.com';
if (!token || !repository) throw new Error('GITHUB_ARTIFACT_LEDGER_UNAVAILABLE');
const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
const findArtifacts = async () => {
  const response = await fetch(`${api}/repos/${repository}/actions/artifacts?name=${encodeURIComponent(markerName)}&per_page=100&page=1`, { headers });
  if (!response.ok) throw new Error('GITHUB_ARTIFACT_LEDGER_UNAVAILABLE');
  const data = await response.json();
  return (data.artifacts ?? []).filter(item => item.name === markerName && item.expired !== true);
};
let artifacts = await findArtifacts();
if (args.includes('--verify') && !artifacts.some(item => String(item.workflow_run?.id ?? '') === String(process.env.GITHUB_RUN_ID ?? ''))) {
  for (let attempt = 1; attempt < 10; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    artifacts = await findArtifacts();
    if (artifacts.some(item => String(item.workflow_run?.id ?? '') === String(process.env.GITHUB_RUN_ID ?? ''))) break;
  }
}
if (artifacts.length && !args.includes('--verify')) throw new Error('AUTHORIZATION_ALREADY_CONSUMED');
if (args.includes('--verify')) {
  const runId = process.env.GITHUB_RUN_ID;
  if (!runId || !artifacts.some(item => String(item.workflow_run?.id ?? '') === runId)) throw new Error('AUTHORIZATION_MARKER_NOT_DURABLE');
  process.stdout.write('EVALUATION_AUTHORIZATION_VERIFIED\n');
  process.exit(0);
}
const output = args.includes('--output') ? path.resolve(value('--output')) : null;
if (output) { fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 }); fs.writeFileSync(output, JSON.stringify(marker) + '\n', { mode: 0o600 }); }
writeOutput(process.env.GITHUB_OUTPUT); process.stdout.write('EVALUATION_AUTHORIZATION_CONSUMED\n');
