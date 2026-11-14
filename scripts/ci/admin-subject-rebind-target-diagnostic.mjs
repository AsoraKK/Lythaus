import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { branchQualifiedDatabaseTarget } from './planetscale-0021-target-identity.mjs';

const emptyChecks = () => ({ branchMatches: null, databaseMatches: null, originMatches: null, migrationRoleMatches: null });

export function assessRebindInstallTarget({ environment, expected, generatedAt = new Date().toISOString() }) {
  const source = environment.RELEASE_SHA;
  const report = {
    schemaVersion: 'lythaus-admin-rebind-install-target-diagnostic-v1',
    sourceMainSha: typeof source === 'string' && /^[a-f0-9]{40}$/.test(source) ? source : null,
    generatedAt, status: 'BLOCKED', checks: emptyChecks(), blockers: [],
    databaseConnections: false, databaseWrites: false, providerRequests: false,
    credentialsCreated: false, authorityAssessed: false, functionStateAssessed: false,
  };
  if (!report.sourceMainSha) return { ...report, blockers: ['release_sha_invalid'] };
  if (!expected || !/^[a-f0-9]{64}$/.test(expected.expectedMainOriginFingerprint ?? '')) {
    return { ...report, blockers: ['committed_main_origin_pin_invalid'] };
  }
  let roles;
  try { roles = JSON.parse(environment.PSCALE_ROLE_IDENTIFIERS); }
  catch { return { ...report, blockers: ['canonical_migration_role_map_invalid'] }; }
  if (!roles || typeof roles !== 'object' || Array.isArray(roles)
    || typeof roles.lythaus_migrations !== 'string' || !/^pscale_api_[a-z0-9]+$/.test(roles.lythaus_migrations)) {
    return { ...report, blockers: ['canonical_migration_role_map_invalid'] };
  }
  let target;
  try { target = branchQualifiedDatabaseTarget(environment.PLANETSCALE_ADMIN_DATABASE_URL); }
  catch { return { ...report, blockers: ['existing_migration_connection_target_invalid'] }; }
  const checks = {
    branchMatches: target.branchId === 'vqa2g2xc9wsl',
    databaseMatches: target.sqlDatabaseName === 'postgres',
    originMatches: target.originFingerprint === expected.expectedMainOriginFingerprint,
    migrationRoleMatches: target.role === roles.lythaus_migrations,
  };
  const blockers = Object.entries(checks).filter(([, matches]) => !matches).map(([name]) => name);
  return { ...report, checks, blockers, status: blockers.length ? 'BLOCKED' : 'MATCHES_INSTALL_TARGET_PINS' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let report;
  try {
    const expected = JSON.parse(fs.readFileSync('infrastructure/cloudflare/native-hyperdrive-production.json', 'utf8'));
    report = assessRebindInstallTarget({ environment: process.env, expected });
  } catch {
    report = { status: 'BLOCKED', blockers: ['target_diagnostic_failed_details_redacted'],
      databaseConnections: false, databaseWrites: false, providerRequests: false, credentialsCreated: false };
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.status === 'MATCHES_INSTALL_TARGET_PINS' ? 0 : 1;
}
