import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const SCHEMA_SHA = '050b1d1a3e973b367c28eae9617840e5d4816573';
export const BASELINE_SHA = 'ba10cfb16941cd163e345af3c00b9bd739884646';
export const INPUTS = Object.freeze(['LYTHAUS_NEW_CORE_MIGRATION_DATABASE_URL',
  'LYTHAUS_NEW_CORE_VERIFIER_DATABASE_URL', 'PLANETSCALE_API_TOKEN']);
const ORIGIN = '30458dae9a257fc30c567ae95f44975fc766233fb11fc15d2542399bbdcd3558';
const MANIFEST = '49e4497af7c2e8b1bfb4df5208774a68969211187f93ba4e1ef21c03067ab614';
const REPO = 'AsoraKK/Lythaus';
const OWNER = 211295889;

export function assertContext(env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || env.GITHUB_REPOSITORY !== REPO || env.GITHUB_REPOSITORY_ID !== '1010752912'
    || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_REF_PROTECTED !== 'true'
    || env.GITHUB_RUN_ATTEMPT !== '1' || env.GITHUB_ACTOR !== 'AsoraKK'
    || env.GITHUB_ACTOR_ID !== String(OWNER) || env.GITHUB_TRIGGERING_ACTOR !== env.GITHUB_ACTOR
    || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')
    || env.REQUESTED_CONTROL_SHA !== env.GITHUB_SHA || env.REQUESTED_SCHEMA_SHA !== SCHEMA_SHA
    || env.REQUESTED_TARGET !== 'lythaus/lythaus-new-core/main'
    || env.CONFIRM_READ_ONLY !== 'true' || env.RUNNER_DEBUG === '1'
    || env.NODE_DEBUG || env.NODE_OPTIONS) throw new Error('preflight_context_blocked');
}

async function getJson(url, token, fetchImpl) {
  const response = await fetchImpl(url, { method: 'GET', redirect: 'error', cache: 'no-store',
    signal: AbortSignal.timeout(15_000), headers: { authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' } });
  if (response.status !== 200 || response.redirected || (response.url && response.url !== url)) throw new Error('metadata_read_blocked');
  const raw = await response.text();
  if (Buffer.byteLength(raw) > 256 * 1024) throw new Error('metadata_read_blocked');
  return JSON.parse(raw);
}

export async function verifyExistingGate({ env, fetchImpl = fetch, requireApproval = false }) {
  assertContext(env);
  const base = `https://api.github.com/repos/${REPO}`;
  const gate = await getJson(`${base}/environments/production`, env.GH_TOKEN, fetchImpl);
  const rules = gate.protection_rules;
  const reviewers = rules?.filter((r) => r.type === 'required_reviewers');
  if (gate.name !== 'production' || !Array.isArray(rules) || rules.length !== 2
    || reviewers.length !== 1 || reviewers[0].prevent_self_review !== false
    || reviewers[0].reviewers?.length !== 1 || reviewers[0].reviewers[0].type !== 'User'
    || reviewers[0].reviewers[0].reviewer?.id !== OWNER
    || rules.filter((r) => r.type === 'branch_policy').length !== 1
    || gate.deployment_branch_policy?.protected_branches !== false
    || gate.deployment_branch_policy?.custom_branch_policies !== true) throw new Error('existing_gate_changed');
  const policies = await getJson(`${base}/environments/production/deployment-branch-policies?per_page=100`, env.GH_TOKEN, fetchImpl);
  if (policies.total_count !== 1 || policies.branch_policies?.length !== 1
    || policies.branch_policies[0].name !== 'main' || policies.branch_policies[0].type !== 'branch') throw new Error('existing_branch_gate_changed');
  let ownerApprovalRecorded = false;
  if (requireApproval) {
    if (!/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '')) throw new Error('approval_history_unavailable');
    const history = await getJson(`${base}/actions/runs/${env.GITHUB_RUN_ID}/approvals`, env.GH_TOKEN, fetchImpl);
    ownerApprovalRecorded = Array.isArray(history) && history.some((entry) => entry.state === 'approved'
      && entry.user?.id === OWNER && entry.environments?.some((item) => item.id === gate.id));
    if (!ownerApprovalRecorded) throw new Error('owner_review_not_recorded');
  }
  return { existing_owner_review_gate_verified: true, main_only: true,
    self_review_prevention_enabled: false, owner_approval_recorded: ownerApprovalRecorded,
    admin_bypass_available: gate.can_admins_bypass === true };
}

export async function inspectSqlInput(raw, role, modules, createClient) {
  const report = { accessible: typeof raw === 'string' && raw.length > 0,
    format_valid: false, target_valid: false, authentication_valid: false,
    read_only_enforced: false, scoped_role_valid: false, baseline_valid: false };
  if (!report.accessible) return report;
  let client;
  try {
    const parsed = new URL(raw);
    const identity = modules.branchQualifiedDatabaseTarget(raw);
    report.format_valid = Boolean(parsed.password) && ['postgres:', 'postgresql:'].includes(parsed.protocol);
    report.target_valid = report.format_valid && identity.branchId === 'xwkb9quljkzd'
      && identity.sqlDatabaseName === 'postgres' && identity.role === role
      && identity.originFingerprint === ORIGIN && identity.origin.port === 5432;
    if (!report.target_valid) return report;
    const config = modules.adminDatabaseConnectionConfig(raw);
    client = createClient({ ...config, options: '-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=3000',
      connectionTimeoutMillis: 10_000, query_timeout: 12_000 });
    await client.connect();
    const state = await client.query(`SELECT current_database()='postgres' AS database_matches,
      session_user=current_user AND current_user=$1 AS role_matches,
      current_setting('server_version_num')::integer / 10000=17 AS version_matches,
      current_setting('transaction_read_only')='on' AS read_only,
      NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit) AS safe_role,
      rolcanlogin AND rolvaliduntil='infinity'::timestamptz AS login_valid,
      has_database_privilege(current_user,'postgres','CONNECT') AS connect_allowed,
      has_database_privilege(current_user,'postgres','CREATE') AS create_allowed,
      has_database_privilege(current_user,'postgres','CREATE WITH GRANT OPTION') AS create_grant_option
      FROM pg_roles WHERE rolname=current_user`, [role]);
    const row = state.rows[0];
    report.authentication_valid = row?.database_matches === true && row?.role_matches === true && row?.version_matches === true;
    report.read_only_enforced = row?.read_only === true;
    report.scoped_role_valid = report.authentication_valid && row.safe_role === true && row.login_valid === true
      && row.connect_allowed === true && row.create_grant_option === false
      && row.create_allowed === (role === 'lythaus_migrations');
    if (!report.scoped_role_valid || !report.read_only_enforced) return report;
    if (role === 'lythaus_migrations') {
      await modules.assertSchemaOnlyBaseline(client);
      await modules.assertNewCoreEmptyCatalog(client, { application_schema_count: 1, application_relation_count: 2 });
      const map = Object.fromEntries(modules.NEW_CORE_ROLE_LABELS.map((label) => [label, label]));
      await modules.verifyNewCoreRoleMemberships(client, map, modules.NEW_CORE_SQL_CREATOR_SHA256, { mode: 'sql-console' });
      report.baseline_valid = true;
    } else {
      const ledger = await client.query("SELECT to_regclass('system.schema_migrations') IS NULL AS absent");
      report.baseline_valid = ledger.rows[0]?.absent === true;
    }
  } catch { /* Report fixed booleans only; never serialize a driver error. */ }
  finally { if (client) await client.end().catch(() => undefined); }
  return report;
}

export async function inspectExistingSecrets({ env, modules, createClient, fetchImpl = fetch }) {
  const token = env.PLANETSCALE_API_TOKEN;
  const provider = { accessible: typeof token === 'string' && token.length > 0, format_valid: false,
    metadata_authorized: false, target_valid: false, managed_role_inventory_valid: false };
  try {
    modules.planetScaleServiceTokenAuthorizationHeader(token);
    provider.format_valid = true;
    const result = await modules.inspectNewCorePlanetScaleRoles({ token, sourceSha: SCHEMA_SHA,
      roleMode: 'sql-console', fetchImpl });
    provider.metadata_authorized = result.httpStatus === 200;
    provider.target_valid = result.databaseMatch === true && result.branchMatch === true;
    provider.managed_role_inventory_valid = result.inventoryMatches === true;
  } catch { /* Provider response bodies and token material stay private. */ }
  const migration = await inspectSqlInput(env[INPUTS[0]], 'lythaus_migrations', modules, createClient);
  const verifier = await inspectSqlInput(env[INPUTS[1]], 'lythaus_verifier', modules, createClient);
  const reports = { [INPUTS[0]]: migration, [INPUTS[1]]: verifier, [INPUTS[2]]: provider };
  return { status: Object.values(reports).every((entry) => Object.values(entry).every((value) => value === true))
    ? 'READ_ONLY_PREFLIGHT_PASS' : 'READ_ONLY_PREFLIGHT_BLOCKED', schema_candidate: SCHEMA_SHA, inputs: reports };
}

async function main() {
  const env = process.env;
  let report;
  try {
    const mode = process.argv[2];
    if (!['--gate', '--inspect'].includes(mode)) throw new Error('mode_blocked');
    const gate = await verifyExistingGate({ env, requireApproval: mode === '--inspect' });
    if (mode === '--gate') { console.log(JSON.stringify({ status: 'EXISTING_GATE_VERIFIED', ...gate })); return; }
    const candidate = path.resolve(env.SCHEMA_CANDIDATE_DIRECTORY ?? 'schema-candidate');
    const git = (...args) => execFileSync('git', ['-C', candidate, ...args], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
    if (git('rev-parse','HEAD') !== SCHEMA_SHA || git('status','--porcelain') !== '') throw new Error('candidate_blocked');
    process.chdir(candidate);
    const load = (file) => import(pathToFileURL(path.join(candidate, file)).href);
    const modules = Object.assign({}, ...await Promise.all([
      load('scripts/ci/lythaus-new-core-clean-install.mjs'),
      load('scripts/ci/lythaus-new-core-empty-catalog.mjs'),
      load('scripts/ci/lythaus-new-core-role-profile.mjs'),
      load('scripts/ci/inspect-new-core-planetscale-roles.mjs'),
      load('scripts/ci/planetscale-0021-target-identity.mjs'),
      load('scripts/planetscale/service-token-auth.mjs'),
      load('scripts/ci/planetscale-migration-manifest.mjs'),
    ]));
    if (modules.loadApprovedMigrations({ root: candidate, committedOnly: true }).checksum !== MANIFEST) throw new Error('manifest_blocked');
    const { default: pg } = await import('pg');
    report = await inspectExistingSecrets({ env, modules, createClient: (config) => new pg.Client(config) });
    report.owner_review_verified = gate.owner_approval_recorded;
    report.approved_schema_main_baseline_unchanged = env.GITHUB_SHA === BASELINE_SHA;
    report.schema_write_authorized_by_preflight = false;
  } catch { report = { status: 'READ_ONLY_PREFLIGHT_GATE_BLOCKED', schema_candidate: SCHEMA_SHA }; }
  const output = JSON.stringify(report);
  console.log(output);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, '```json\n' + JSON.stringify(report,null,2) + '\n```\n');
  if (report.status !== 'READ_ONLY_PREFLIGHT_PASS') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
