import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planetScaleServiceTokenAuthorizationHeader } from '../planetscale/service-token-auth.mjs';
import { assessPlanetScaleBackupEvidence, resolve0021BackupId } from './planetscale-0021-only-contract.mjs';
import { read0021RestoreEvidenceRecord } from './planetscale-0021-restore-evidence-loader.mjs';
import { ownerRecoveryContextFromEnvironment } from './owner-recovery-exception.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backupId = resolve0021BackupId(process.env.PLANETSCALE_0021_BACKUP_ID, process.env.PLANETSCALE_PRODUCTION_BACKUP_ID);
const blockers = [];
if (!/^[a-f0-9]{40}$/.test(process.env.RELEASE_SHA ?? '')) blockers.push('production_recovery_release_sha_invalid');
let branch = null;
let backup = null;
try {
  const authorization = planetScaleServiceTokenAuthorizationHeader(process.env.PLANETSCALE_API_TOKEN ?? '');
  const base = 'https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-core/branches/main';
  if (!backupId) throw new Error('backup_id_missing');
  const results = await Promise.allSettled([base, `${base}/backups/${encodeURIComponent(backupId)}`].map(async url => {
    const response = await fetch(url, {
      method: 'GET', headers: { Authorization: authorization, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error('provider_read_failed');
    return response.json();
  }));
  if (results[0].status === 'fulfilled') branch = results[0].value;
  if (results[1].status === 'fulfilled') backup = results[1].value;
  if (results.some(result => result.status !== 'fulfilled')) blockers.push('production_recovery_provider_read_failed');
} catch {
  blockers.push('production_recovery_provider_inputs_missing_or_invalid');
}
const input = read0021RestoreEvidenceRecord(backupId, root);
const assessment = assessPlanetScaleBackupEvidence({
  branch, backup, backupId, restoreEvidenceRecord: input.record, restoreEvidenceRecordPath: input.recordPath,
  restoreEvidenceArtifact: input.evidenceArtifact, ownerRecoveryContext: ownerRecoveryContextFromEnvironment(),
});
blockers.push(...assessment.blockers);
const report = {
  sourceMainSha: process.env.RELEASE_SHA ?? null,
  databaseWrites: false,
  providerMutations: false,
  generatedAt: new Date().toISOString(),
  ready: blockers.length === 0,
  blockers: [...new Set(blockers)],
  ...assessment,
};
report.blockers = [...new Set(blockers)];
report.ok = report.ready;
const output = `${JSON.stringify(report, null, 2)}\n`;
if (process.env.RECOVERY_READINESS_REPORT_FILE) {
  fs.mkdirSync(path.dirname(process.env.RECOVERY_READINESS_REPORT_FILE), { recursive: true });
  fs.writeFileSync(process.env.RECOVERY_READINESS_REPORT_FILE, output, { mode: 0o600 });
}
console.log(output.trimEnd());
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT,
  `independent_recovery_status=${report.ready ? report.restoreEvidence.independentRecovery.status : 'BLOCKED'}\nrecovery_readiness_status=${report.ready ? 'PASS' : 'BLOCKED'}\n`);
if (!report.ready) process.exitCode = 1;
