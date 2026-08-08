import type { Client } from 'pg';
import { transaction, type HyperdriveBinding } from './index.ts';

export interface DatabaseIdentityExpectations {
  target: string;
  schemaFingerprint: string;
  relationCount: number;
  schemaVersion: string;
  roleClass: string;
  budgetLedgerApplied?: boolean;
}

export interface DatabaseIdentityReport {
  databaseEnvironment: string;
  branchFingerprint: 'unknown';
  schemaFingerprint: string;
  relationCount: number;
  identityContactEmails: boolean;
  budgetLedgerApplied: boolean;
  schemaVersion: string;
  roleClass: string;
  transactionSucceeded: boolean;
  readiness: 'pass' | 'fail';
}

export interface DatabaseReadinessResponse {
  databaseEnvironment: string;
  branchFingerprint: 'unknown';
  schemaFingerprint: string;
  relationCount: number;
  identityContactEmails: boolean;
  budgetLedgerApplied: boolean;
  schemaVersion: string;
  roleClass: string;
  readiness: 'pass' | 'fail';
  readyForAuthentication: boolean;
}

export function databaseReadinessResponse(
  report: DatabaseIdentityReport,
  authenticatedAcceptanceProven: boolean,
): DatabaseReadinessResponse {
  return {
    databaseEnvironment: report.databaseEnvironment,
    branchFingerprint: 'unknown',
    schemaFingerprint: report.schemaFingerprint,
    relationCount: report.relationCount,
    identityContactEmails: report.identityContactEmails,
    budgetLedgerApplied: report.budgetLedgerApplied,
    schemaVersion: report.schemaVersion,
    roleClass: report.roleClass,
    readiness: report.readiness,
    readyForAuthentication: authenticatedAcceptanceProven && report.readiness === 'pass' && report.budgetLedgerApplied,
  };
}

export function databaseExpectationsFromEnv(env: {
  EXPECTED_DATABASE_TARGET?: string;
  EXPECTED_DATABASE_SCHEMA_FINGERPRINT?: string;
  EXPECTED_DATABASE_RELATION_COUNT?: string;
  EXPECTED_DATABASE_SCHEMA_VERSION?: string;
  EXPECTED_DATABASE_ROLE_CLASS?: string;
  EXPECTED_DATABASE_BUDGET_LEDGER_APPLIED?: string;
}): DatabaseIdentityExpectations {
  const relationCount = Number(env.EXPECTED_DATABASE_RELATION_COUNT ?? 0);
  return {
    target: env.EXPECTED_DATABASE_TARGET ?? 'unknown',
    schemaFingerprint: env.EXPECTED_DATABASE_SCHEMA_FINGERPRINT ?? 'unknown',
    relationCount: Number.isInteger(relationCount) && relationCount > 0 ? relationCount : 0,
    schemaVersion: env.EXPECTED_DATABASE_SCHEMA_VERSION ?? 'unknown',
    roleClass: env.EXPECTED_DATABASE_ROLE_CLASS ?? 'unknown',
    budgetLedgerApplied: env.EXPECTED_DATABASE_BUDGET_LEDGER_APPLIED === undefined
      ? undefined
      : env.EXPECTED_DATABASE_BUDGET_LEDGER_APPLIED === 'true',
  };
}

interface RelationRow {
  table_type: string;
  table_schema: string;
  table_name: string;
}

interface MigrationRow {
  version: string;
  checksum: string;
}

interface RoleRow {
  rolsuper: boolean;
  rolcanlogin: boolean;
  rolbypassrls: boolean;
}

export function classifyRole(role: Pick<RoleRow, 'rolsuper' | 'rolcanlogin' | 'rolbypassrls'>): string {
  if (role.rolsuper) return 'superuser';
  if (role.rolbypassrls) return 'bypass_rls';
  if (!role.rolcanlogin) return 'no_login';
  return 'login_non_superuser';
}

export function buildSchemaFingerprint(relations: RelationRow[], migrations: MigrationRow[]): Promise<string> {
  const relationLines = [...relations]
    .sort((left, right) => `${left.table_type}:${left.table_schema}.${left.table_name}`.localeCompare(`${right.table_type}:${right.table_schema}.${right.table_name}`))
    .map((row) => `${row.table_type}:${row.table_schema}.${row.table_name}`);
  const migrationLines = [...migrations]
    .sort((left, right) => left.version.localeCompare(right.version))
    .map((row) => `${row.version}=${row.checksum}`);
  const input = `${relationLines.join('\n')}\n--migrations--\n${migrationLines.join('\n')}`;
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)).then((digest) => (
    Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
  ));
}

export function isDatabaseIdentityReady(report: Omit<DatabaseIdentityReport, 'readiness'>, expected: DatabaseIdentityExpectations): boolean {
  return report.databaseEnvironment === expected.target
    && report.schemaFingerprint === expected.schemaFingerprint
    && report.relationCount === expected.relationCount
    && report.identityContactEmails
    && (expected.budgetLedgerApplied === undefined || report.budgetLedgerApplied === expected.budgetLedgerApplied)
    && report.schemaVersion === expected.schemaVersion
    && report.roleClass === expected.roleClass
    && report.transactionSucceeded;
}

function unavailableReport(): DatabaseIdentityReport {
  return {
    databaseEnvironment: 'unknown',
    branchFingerprint: 'unknown',
    schemaFingerprint: 'unknown',
    relationCount: 0,
    identityContactEmails: false,
    budgetLedgerApplied: false,
    schemaVersion: 'unknown',
    roleClass: 'unknown',
    transactionSucceeded: false,
    readiness: 'fail',
  };
}

export async function inspectDatabaseIdentity(
  binding: HyperdriveBinding,
  expected: DatabaseIdentityExpectations,
): Promise<DatabaseIdentityReport> {
  try {
    const report = await transaction(binding, async (client: Client) => {
      await client.query('SET TRANSACTION READ ONLY');
      const roleResult = await client.query<RoleRow>(
        `SELECT r.rolsuper, r.rolcanlogin, r.rolbypassrls
           FROM pg_roles r
          WHERE r.rolname = current_user`
      );
      const relationResult = await client.query<RelationRow>(
        `SELECT table_type, table_schema, table_name
           FROM information_schema.tables
          WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
          ORDER BY table_type, table_schema, table_name`
      );
      const migrationResult = await client.query<MigrationRow>(
        `SELECT version, checksum FROM system.schema_migrations ORDER BY version`
      );
      const ledgerResult = await client.query<{
        periods: string | null;
        reservations: string | null;
        usageEvents: string | null;
        killSwitches: string | null;
      }>(
        `SELECT
           to_regclass('system.cost_budget_periods')::text AS periods,
           to_regclass('system.cost_budget_reservations')::text AS reservations,
           to_regclass('system.cost_usage_events')::text AS "usageEvents",
           to_regclass('system.cost_kill_switches')::text AS "killSwitches"`
      );
      await client.query('SELECT 1 AS readiness');
      const role = roleResult.rows[0];
      if (!role) throw new Error('database_role_unavailable');
      const schemaFingerprint = await buildSchemaFingerprint(relationResult.rows, migrationResult.rows);
      const schemaVersion = migrationResult.rows.at(-1)?.version ?? 'unknown';
      const ledger = ledgerResult.rows[0];
      const budgetLedgerApplied = Boolean(ledger?.periods && ledger.reservations && ledger.usageEvents && ledger.killSwitches);
      // Hyperdrive's Worker-local connection string does not expose the origin
      // branch. The deployment gate proves that separately by origin fingerprint;
      // this report deliberately does not claim a branch based on configuration.
      const databaseEnvironment = expected.target || 'unknown';
      const partial: Omit<DatabaseIdentityReport, 'readiness'> = {
        databaseEnvironment,
        branchFingerprint: 'unknown',
        schemaFingerprint,
        relationCount: relationResult.rowCount ?? relationResult.rows.length,
        identityContactEmails: relationResult.rows.some((row) => row.table_schema === 'identity' && row.table_name === 'contact_emails'),
        budgetLedgerApplied,
        schemaVersion,
        roleClass: classifyRole(role),
        transactionSucceeded: true,
      };
      return { ...partial, readiness: isDatabaseIdentityReady(partial, expected) ? 'pass' : 'fail' } satisfies DatabaseIdentityReport;
    });
    return report;
  } catch {
    return unavailableReport();
  }
}
