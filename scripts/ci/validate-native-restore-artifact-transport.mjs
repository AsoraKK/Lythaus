import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { requireThat, failureCode } from './planetscale-native-restore-contract.mjs';
import { decimal, githubRead, sha256 } from './planetscale-native-restore-evidence.mjs';
import { githubArtifactDownloader } from './planetscale-native-restore-cleanup-artifact-transport.mjs';

export function artifactTransportFixture(env) {
  requireThat(env.GITHUB_REPOSITORY_ID === '1010752912'
    && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/Lythaus$/.test(env.GITHUB_REPOSITORY ?? '')
    && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') && decimal(env.GITHUB_RUN_ID)
    && decimal(env.GITHUB_RUN_ATTEMPT), 'artifact_rehearsal_context_invalid');
  requireThat(!env.PLANETSCALE_RESTORE_API_TOKEN && !env.PLANETSCALE_SCHEMA_READ_DATABASE_URL,
    'artifact_rehearsal_provider_access_forbidden');
  const name = `native-restore-artifact-transport-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 'native-restore-artifact-transport-fixture-v1',
    synthetic: true, repository: env.GITHUB_REPOSITORY, sourceSha: env.GITHUB_SHA,
    runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
    providerMutations: false, recoveryCertified: false }) + '\n');
  return { name, bytes };
}

export async function verifyArtifactTransportFixture(env, fetchImpl = fetch) {
  const expected = artifactTransportFixture(env);
  requireThat(decimal(env.REHEARSAL_ARTIFACT_ID) && /^[a-f0-9]{64}$/.test(env.REHEARSAL_ARTIFACT_DIGEST ?? ''),
    'artifact_rehearsal_upload_unproven');
  const metadata = await githubRead(env, `/actions/artifacts/${env.REHEARSAL_ARTIFACT_ID}`, fetchImpl);
  requireThat(metadata.name === expected.name && metadata.digest === `sha256:${env.REHEARSAL_ARTIFACT_DIGEST}`,
    'artifact_rehearsal_upload_binding_invalid');
  const archive = await githubArtifactDownloader(env, fetchImpl)({ artifactId: env.REHEARSAL_ARTIFACT_ID,
    runId: env.GITHUB_RUN_ID });
  requireThat(sha256(archive) === env.REHEARSAL_ARTIFACT_DIGEST, 'artifact_rehearsal_archive_digest_mismatch');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-artifact-transport-'));
  try {
    const file = path.join(directory, 'artifact.zip');
    fs.writeFileSync(file, archive, { mode: 0o600, flag: 'wx' });
    const entries = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8', maxBuffer: 4096,
      stdio: ['ignore', 'pipe', 'pipe'] });
    requireThat(entries === 'transport.json\n', 'artifact_rehearsal_archive_entries_invalid');
    const bytes = execFileSync('unzip', ['-p', file, 'transport.json'], { maxBuffer: 4096,
      stdio: ['ignore', 'pipe', 'pipe'] });
    requireThat(bytes.equals(expected.bytes), 'artifact_rehearsal_extracted_bytes_mismatch');
    return { schemaVersion: 'native-restore-artifact-transport-receipt-v1', state: 'ARTIFACT_TRANSPORT_VERIFIED',
      sourceSha: env.GITHUB_SHA, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
      artifactId: env.REHEARSAL_ARTIFACT_ID, archiveSha256: sha256(archive), payloadSha256: sha256(bytes),
      syntheticPayload: true, providerMutations: false, recoveryCertified: false };
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

async function main() {
  const env = process.env, stage = process.argv[2];
  requireThat(process.argv.length === 3 && ['prepare', 'verify'].includes(stage), 'artifact_rehearsal_stage_invalid');
  const expected = artifactTransportFixture(env);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  requireThat(head === env.GITHUB_SHA, 'artifact_rehearsal_checkout_mismatch');
  requireThat(path.isAbsolute(env.RUNNER_TEMP ?? ''), 'artifact_rehearsal_temporary_directory_required');
  const directory = path.join(env.RUNNER_TEMP, expected.name);
  if (stage === 'prepare') {
    requireThat(path.isAbsolute(env.GITHUB_OUTPUT ?? ''), 'artifact_rehearsal_output_required');
    fs.mkdirSync(directory, { mode: 0o700 });
    const file = path.join(directory, 'transport.json');
    fs.writeFileSync(file, expected.bytes, { mode: 0o600, flag: 'wx' });
    fs.appendFileSync(env.GITHUB_OUTPUT, `artifact_name=${expected.name}\nartifact_path=${file}\n`);
    process.stdout.write(JSON.stringify({ state: 'SYNTHETIC_ARTIFACT_STAGED', providerMutations: false }) + '\n');
  } else {
    const receipt = await verifyArtifactTransportFixture(env);
    fs.writeFileSync(path.join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    process.stdout.write(JSON.stringify(receipt) + '\n');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(); }
  catch (error) {
    process.stdout.write(JSON.stringify({ state: 'ARTIFACT_TRANSPORT_UNPROVEN', blockers: [failureCode(error)],
      providerMutations: false, recoveryCertified: false }) + '\n');
    process.exitCode = 1;
  }
}
