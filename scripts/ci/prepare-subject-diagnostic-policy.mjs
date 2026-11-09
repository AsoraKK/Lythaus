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
const POLICY_ORIGIN = 'https://admin-api.lythaus.co';

function adminBindingId() {
  const manifest = JSON.parse(fs.readFileSync('infrastructure/cloudflare/native-hyperdrive-production.json', 'utf8'));
  const matches = manifest.bindings.filter((binding) => binding.worker === 'lythaus-admin-api-development' && binding.binding === 'DB_ADMIN_FRESH');
  if (matches.length !== 1) throw new Error('subject_diagnostic_admin_binding_invalid');
  return matches[0].hyperdriveId;
}

function branchMetadata(databaseUrl, roleIdentifiers, branchName) {
  const target = branchQualifiedDatabaseTarget(databaseUrl);
  const role = roleIdentifiers.lythaus_admin;
  if (branchName !== 'main' || !/^[a-z0-9]+$/.test(target.branchId)
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
  let response;
  try {
    response = await fetchImpl('https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-core/branches/main', {
      method: 'GET',
      redirect: 'error',
      headers: { Authorization: authorization, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('subject_diagnostic_planetscale_main_branch_unverified');
  }
  if (!response.ok) throw new Error('subject_diagnostic_planetscale_main_branch_unverified');
  let branch;
  try {
    branch = await response.json();
  } catch {
    throw new Error('subject_diagnostic_planetscale_main_branch_unverified');
  }
  if (branch?.name !== 'main' || branch?.id !== branchId) {
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
} = {}) {
  const roleIdentifiers = JSON.parse(environment.PSCALE_ROLE_IDENTIFIERS ?? '{}');
  const databaseTarget = branchMetadata(
    environment.PLANETSCALE_SCHEMA_READ_DATABASE_URL ?? '', roleIdentifiers,
    environment.PSCALE_BRANCH_NAME ?? '',
  );
  const { branchId, role } = databaseTarget;
  await verifyPlanetScaleMainBranch(branchId, environment, fetchImpl);
  const access = await verifyCloudflareAdminAccess({ environment, fetchImpl });
  if (access.status !== 'verified' || access.adminApiAudienceMatchesSnapshot !== true) {
    throw new Error('subject_diagnostic_access_policy_unverified');
  }
  const adminAudience = access.adminApiAudience;
  const domain = environment.PRODUCT_INTEGRITY_ACCESS_TEAM_DOMAIN ?? '';
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain)) throw new Error('subject_diagnostic_access_issuer_invalid');

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
  const policy = await buildSubjectDiagnosticPolicy({ environment, fetchImpl, nowMs });
  fs.writeFileSync(outputPath, JSON.stringify(policy), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  fs.writeFileSync(modulePath, subjectDiagnosticPolicyModuleSource(policy), { encoding: 'utf8', mode: 0o600 });
  return policy;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await prepareSubjectDiagnosticPolicy();
  console.log('Subject diagnostic policy captured; identifiers withheld.');
}
