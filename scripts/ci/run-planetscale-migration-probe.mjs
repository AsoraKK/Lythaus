import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { auditMigrationRole, ownerContext, AuditFailure, check } from './planetscale-migration-role-audit.mjs';
import { runProbe, probeConsent } from './planetscale-migration-probe.mjs';
import { quietConsumers } from './planetscale-migration-probe-evidence.mjs';

export async function main(env = process.env, args = process.argv.slice(2)) {
  let report = { status: 'BLOCKED', blocker: 'operation_unverified', operationOutcome: 'UNVERIFIED_RECONCILE_BEFORE_RETRY' };
  try {
    ownerContext(env);
    check(args.length === 1 && ['audit', 'probe', 'validate-probe-approval'].includes(args[0]), 'mode_invalid');
    if (args[0] === 'validate-probe-approval') {
      probeConsent(env); return { status: 'APPROVAL_SHAPE_VALID_NOT_EXECUTION_AUTHORITY' };
    }
    const assertMain = async () => {
      const git = argv => execFileSync('git', argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }).trim();
      check(git(['rev-parse', 'HEAD']) === env.RELEASE_SHA, 'checkout_changed');
      git(['diff', '--exit-code']); git(['diff', '--cached', '--exit-code']);
      git(['fetch', '--no-tags', '--depth=1', 'origin', 'main']);
      check(git(['rev-parse', 'FETCH_HEAD']) === env.RELEASE_SHA, 'protected_main_moved');
    };
    await assertMain();
    const { default: pg } = await import('pg');
    const clientFactory = config => new pg.Client(config);
    if (args[0] === 'audit') {
      await quietConsumers(env);
      report = await auditMigrationRole({ env, clientFactory });
    } else {
      check(path.isAbsolute(env.RUNNER_TEMP ?? ''), 'private_receipt_directory_required');
      const file = path.join(env.RUNNER_TEMP, 'migration-probe.json');
      const checkpoint = value => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
      report = await runProbe({ env, clientFactory, assertMain, checkpoint });
    }
  } catch (error) {
    report.blocker = error instanceof AuditFailure ? error.message : 'operation_unverified';
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await main(); process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (!['AUDIT_READY_NOT_INSTALL_AUTHORITY', 'PROBE_EXPIRED_AND_CLOSED_NOT_MIGRATION_READY',
    'APPROVAL_SHAPE_VALID_NOT_EXECUTION_AUTHORITY'].includes(report.status)) process.exitCode = 1;
}
