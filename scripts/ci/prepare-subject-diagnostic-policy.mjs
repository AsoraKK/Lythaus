import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyCloudflareAdminAccess } from './verify-cloudflare-admin-access.mjs';
import { verifyHyperdriveTargets } from './verify-cloudflare-hyperdrive-targets.mjs';
import { branchQualifiedDatabaseTarget } from './planetscale-0021-target-identity.mjs';
import { planetScaleServiceTokenAuthorizationHeader } from '../planetscale/service-token-auth.mjs';
import { validateSubjectDiagnosticPolicy, SUBJECT_DIAGNOSTIC_MAX_WINDOW_SECONDS } from '../../apps/lythaus-admin-api/src/solo-recovery/diagnostic-policy.ts';

const POLICY_MODULE_PATH = 'apps/lythaus-admin-api/src/solo-recovery/diagnostic-policy.generated.ts';
const POLICY_ORIGIN = 'https://admin.lythaus.co';
const ACCOUNT_ID = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
const BRANCH_ID = 'vqa2g2xc9wsl';

function humanPin(sourceSha, email) {
  if (!/^[0-9a-f]{40}$/.test(sourceSha ?? '') || typeof email !== 'string'
    || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('subject_diagnostic_human_input_invalid');
  return crypto.createHash('sha256').update(`lythaus:diagnostic-human:v1:${sourceSha}:${email.toLowerCase()}`).digest('hex');
}

export function stageDiagnosticHuman(environment) {
  if (!path.isAbsolute(environment.RUNNER_TEMP ?? '')) throw new Error('subject_diagnostic_private_directory_required');
  const pin = humanPin(environment.RELEASE_SHA, environment.EXPECTED_DIAGNOSTIC_HUMAN_EMAIL);
  fs.writeFileSync(path.join(environment.RUNNER_TEMP, 'admin-diagnostic-human.json'),
    JSON.stringify({ ADMIN_SUBJECT_DIAGNOSTIC_HUMAN_PIN: pin }), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
}

function adminBindingId() {
  const manifest = JSON.parse(fs.readFileSync('infrastructure/cloudflare/native-hyperdrive-production.json', 'utf8'));
  const matches = manifest.bindings.filter((binding) => binding.worker === 'lythaus-admin-api-development' && binding.binding === 'DB_ADMIN_FRESH');
  if (matches.length !== 1) throw new Error('subject_diagnostic_admin_binding_invalid');
  return matches[0].hyperdriveId;
}

function branchMetadata(databaseUrl, roleIdentifiers, branchName) {
  const target = branchQualifiedDatabaseTarget(databaseUrl);
  const role = roleIdentifiers.lythaus_admin;
  if (branchName !== 'main' || target.branchId !== BRANCH_ID
    || !/^pscale_api_[a-z0-9]+$/.test(target.role)
    || !/^pscale_api_[a-z0-9]+$/.test(role)
    || target.sqlDatabaseName !== 'postgres'
    || !target.origin.host.toLowerCase().endsWith('.psdb.cloud')) {
    throw new Error('subject_diagnostic_main_metadata_target_invalid');
  }
  return { branchId: target.branchId, role, originFingerprint: target.originFingerprint };
}

async function verifyPlanetScaleMainBranch(branchId, environment, fetchImpl) {
  const authorization = planetScaleServiceTokenAuthorizationHeader(environment.PLANETSCALE_API_TOKEN ?? '');
  const base = 'https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-core';
  async function read(url) {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'error',
      headers: { Authorization: authorization, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error('subject_diagnostic_planetscale_main_branch_unverified');
    return response.json();
  }
  const [database, branch] = await Promise.all([read(base), read(base + '/branches/main')]);
  if (database?.id !== 'hzhe0cbn6rxi' || database.name !== 'lythaus-core' || database.kind !== 'postgresql'
    || branch?.name !== 'main' || branch.id !== branchId || branch.ready !== true || branch.production !== true) {
    throw new Error('subject_diagnostic_planetscale_main_branch_mismatch');
  }
}

export function subjectDiagnosticPolicyModuleSource(policy) {
  return `import type { SubjectDiagnosticPolicy } from './diagnostic-policy.ts';\n\nexport const COMPILED_SUBJECT_DIAGNOSTIC_POLICY: SubjectDiagnosticPolicy | null = ${JSON.stringify(policy)};\n`;
}

export async function buildSubjectDiagnosticPolicy({
  environment = process.env,
  fetchImpl = fetch,
  nowMs = Date.now(),
  verifyTargets = verifyHyperdriveTargets,
  intendedHumanPin,
} = {}) {
  if (environment.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT_ID || !/^[a-f0-9]{64}$/.test(intendedHumanPin ?? '')
    || !/^[a-f0-9]{40}$/.test(environment.RELEASE_SHA ?? '') || environment.RELEASE_SHA !== environment.GITHUB_SHA) {
    throw new Error('subject_diagnostic_release_context_invalid');
  }
  const roleIdentifiers = JSON.parse(environment.PSCALE_ROLE_IDENTIFIERS ?? '{}');
  const databaseTarget = branchMetadata(
    environment.PLANETSCALE_SCHEMA_READ_DATABASE_URL ?? '', roleIdentifiers,
    environment.PSCALE_BRANCH_NAME ?? '',
  );
  const { branchId, role } = databaseTarget;
  await verifyPlanetScaleMainBranch(branchId, environment, fetchImpl);
  const access = await verifyCloudflareAdminAccess({ environment, fetchImpl,
    verifyHuman: email => humanPin(environment.RELEASE_SHA, email) === intendedHumanPin });
  if (access.status !== 'verified' || access.adminApiAudienceMatchesSnapshot !== true) {
    throw new Error('subject_diagnostic_access_policy_unverified');
  }
  const adminAudience = access.applications.find(application => application.name === 'Lythaus Admin UI')?.audience;
  if (!adminAudience || adminAudience === access.adminApiAudience) throw new Error('subject_diagnostic_ui_audience_invalid');
  const domain = environment.PRODUCT_INTEGRITY_ACCESS_TEAM_DOMAIN ?? '';
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain)) throw new Error('subject_diagnostic_access_issuer_invalid');
  const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/access/organizations`, {
    method: 'GET', redirect: 'error', headers: { authorization: `Bearer ${environment.CLOUDFLARE_API_TOKEN}` },
    signal: AbortSignal.timeout(15_000),
  });
  const org = response.ok && await response.json();
  if (org?.success !== true || org.result?.auth_domain !== domain) throw new Error('subject_diagnostic_access_issuer_invalid');

  const targets = await verifyTargets({
    environment: { ...environment, HYPERDRIVE_VERIFY_IDS: adminBindingId() },
    fetchImpl,
    readOnlyGetOnly: true,
  });
  const adminBindings = targets.bindings?.filter((binding) => (
    binding.worker === 'lythaus-admin-api-development' && binding.binding === 'DB_ADMIN_FRESH' && binding.roleClass === 'lythaus_admin'
  )) ?? [];
  if (targets.status !== 'pass' || targets.targetBranch !== 'main' || adminBindings.length !== 1
    || targets.originFingerprint !== databaseTarget.originFingerprint
    || adminBindings[0].hyperdriveId !== adminBindingId()
    || adminBindings[0].originFingerprint !== databaseTarget.originFingerprint
    || adminBindings[0].roleMatches !== true || adminBindings[0].runtimeRoleMatches !== true) {
    throw new Error('subject_diagnostic_admin_hyperdrive_unverified');
  }
  const now = Math.floor(nowMs / 1000);
  return validateSubjectDiagnosticPolicy({
    origin: POLICY_ORIGIN,
    sourceSha: environment.RELEASE_SHA,
    accessIssuer: `https://${domain}`,
    accessAudience: adminAudience,
    notBefore: now,
    expiresAt: now + SUBJECT_DIAGNOSTIC_MAX_WINDOW_SECONDS,
    databaseTarget: {
      branchId,
      databaseName: 'postgres',
      originFingerprint: databaseTarget.originFingerprint,
      roleFingerprint: crypto.createHash('sha256').update(`lythaus-admin-diagnostic-role:v1:${role}`).digest('hex'),
    },
  });
}

export async function prepareSubjectDiagnosticPolicy({
  environment = process.env,
  fetchImpl = fetch,
  nowMs = Date.now(),
} = {}) {
  if (environment.ENABLE_SUBJECT_DIAGNOSTIC !== 'true') throw new Error('subject_diagnostic_capture_not_enabled');
  const modulePath = environment.SUBJECT_DIAGNOSTIC_POLICY_MODULE_PATH;
  const outputPath = environment.SUBJECT_DIAGNOSTIC_POLICY_OUTPUT_PATH;
  if (modulePath !== POLICY_MODULE_PATH || typeof outputPath !== 'string'
    || !path.isAbsolute(outputPath) || !outputPath.startsWith(`${environment.RUNNER_TEMP ?? ''}${path.sep}`)) {
    throw new Error('subject_diagnostic_capture_output_invalid');
  }
  const { ADMIN_SUBJECT_DIAGNOSTIC_HUMAN_PIN: intendedHumanPin } =
    JSON.parse(fs.readFileSync(path.join(environment.RUNNER_TEMP, 'admin-diagnostic-human.json'), 'utf8'));
  const policy = await buildSubjectDiagnosticPolicy({ environment, fetchImpl, nowMs, intendedHumanPin });
  fs.writeFileSync(outputPath, JSON.stringify({ notBefore: policy.notBefore, expiresAt: policy.expiresAt }),
    { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  fs.writeFileSync(modulePath, subjectDiagnosticPolicyModuleSource(policy), { encoding: 'utf8', mode: 0o600 });
  return policy;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === '--stage-human') stageDiagnosticHuman(process.env);
    else if (process.argv[2] === '--inspect') {
      await buildSubjectDiagnosticPolicy({ intendedHumanPin: humanPin(process.env.RELEASE_SHA, process.env.EXPECTED_DIAGNOSTIC_HUMAN_EMAIL) });
      console.log('Protected issuer, audiences, human selectors and production database target verified.');
    } else if (process.argv.length === 2) await prepareSubjectDiagnosticPolicy();
    else throw new Error('subject_diagnostic_operation_invalid');
  } catch (error) {
    const code = /^subject_diagnostic_[a-z_]+$/.test(error?.message ?? '')
      ? error.message : 'subject_diagnostic_provider_or_input_unverified';
    console.error(code);
    process.exitCode = 1;
  }
}
