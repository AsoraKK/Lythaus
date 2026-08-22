import fs from 'node:fs';
import path from 'node:path';
import { loadApprovedMigrations } from './planetscale-migration-manifest.mjs';

const root = process.cwd();
const outputIndex = process.argv.indexOf('--output');
if (outputIndex !== -1 && !process.argv[outputIndex + 1]) {
  throw new Error('--output requires a file path');
}
const outputPath = outputIndex === -1
  ? path.join(root, '.artifacts', 'release', 'release-manifest.json')
  : path.resolve(root, process.argv[outputIndex + 1]);
const releaseSha = process.env.RELEASE_SHA ?? process.env.GITHUB_SHA ?? '';

if (!/^[0-9a-f]{40}$/.test(releaseSha)) {
  throw new Error('RELEASE_SHA must be a full 40-character commit SHA');
}

const valueOrNull = (name) => process.env[name] || null;
const shaOrNull = (name) => {
  const value = valueOrNull(name);
  if (value !== null && !/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${name} must be a full 40-character commit SHA when provided`);
  }
  return value;
};
const fingerprintOrNull = (name) => {
  const value = valueOrNull(name);
  if (value !== null && !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${name} must be a 64-character SHA-256 fingerprint when provided`);
  }
  return value;
};
const deploymentIdOrNull = (name) => {
  const value = valueOrNull(name);
  if (value !== null && !/^[A-Za-z0-9._:-]{6,200}$/.test(value)) {
    throw new Error(`${name} must be a sanitized Pages deployment identifier when provided`);
  }
  return value;
};
const urlOrNull = (name) => {
  const value = valueOrNull(name);
  if (value !== null) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error(`${name} must be an HTTPS URL without credentials or fragments`);
  }
  return value;
};
const relationCountOrNull = (name) => {
  const value = valueOrNull(name);
  if (value !== null && !/^\d+$/.test(value)) throw new Error(`${name} must be a non-negative integer when provided`);
  return value === null ? null : Number.parseInt(value, 10);
};
const statusOrUnknown = (name) => process.env[name] || 'UNKNOWN/BLOCKED';

const registry = JSON.parse(fs.readFileSync(path.join(root, 'infrastructure', 'lythaus-resource-registry.json'), 'utf8'));
const hyperdrive = JSON.parse(fs.readFileSync(path.join(root, 'infrastructure', 'cloudflare', 'native-hyperdrive-production.json'), 'utf8'));
const migration = loadApprovedMigrations({ root, committedOnly: true });

const surfaces = {
  marketing: {
    project: 'lythaus-marketing',
    branch: valueOrNull('MARKETING_PAGES_BRANCH'),
    deploymentId: deploymentIdOrNull('MARKETING_DEPLOYMENT_ID'),
    deploymentUrl: urlOrNull('MARKETING_DEPLOYMENT_URL'),
    domains: ['lythaus.co', 'www.lythaus.co'],
    deployedSha: shaOrNull('MARKETING_DEPLOYMENT_SHA'),
  },
  web: {
    project: 'lythaus-web',
    branch: valueOrNull('WEB_PAGES_BRANCH'),
    deploymentId: deploymentIdOrNull('WEB_DEPLOYMENT_ID'),
    deploymentUrl: urlOrNull('WEB_DEPLOYMENT_URL'),
    deployedSha: shaOrNull('WEB_DEPLOYMENT_SHA'),
  },
  admin: {
    project: valueOrNull('LYTHAUS_ADMIN_PAGES_PROJECT'),
    branch: valueOrNull('ADMIN_PAGES_BRANCH'),
    deploymentId: deploymentIdOrNull('ADMIN_DEPLOYMENT_ID'),
    deploymentUrl: urlOrNull('ADMIN_DEPLOYMENT_URL'),
    domains: ['admin.lythaus.co'],
    deployedSha: shaOrNull('ADMIN_DEPLOYMENT_SHA'),
  },
  workers: {
    publicApi: { name: 'lythaus-public-api-development', versionId: valueOrNull('PUBLIC_API_WORKER_VERSION'), sourceSha: shaOrNull('WORKER_SOURCE_SHA') },
    adminApi: { name: 'lythaus-admin-api-development', versionId: valueOrNull('ADMIN_API_WORKER_VERSION'), sourceSha: shaOrNull('WORKER_SOURCE_SHA') },
    jobs: { name: 'lythaus-jobs-development', versionId: valueOrNull('JOBS_WORKER_VERSION'), sourceSha: shaOrNull('WORKER_SOURCE_SHA') },
  },
};

const cloudflareStatus = statusOrUnknown('CLOUDFLARE_INVENTORY_STATUS');
const planetscaleStatus = statusOrUnknown('PLANETSCALE_INVENTORY_STATUS');
const requiredEvidence = [
  cloudflareStatus === 'VERIFIED',
  planetscaleStatus === 'VERIFIED',
  process.env.HYPERDRIVE_VERIFIED_MAIN === 'true',
  process.env.DATABASE_IDENTITY_VERIFIED === 'true',
  process.env.BUDGET_ENFORCEMENT_VERIFIED === 'true',
  process.env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true',
  fingerprintOrNull('PLANETSCALE_SCHEMA_FINGERPRINT') !== null,
  process.env.PLANETSCALE_GRANTS_VERIFIED === 'true',
  surfaces.marketing.deployedSha === releaseSha,
  surfaces.web.deployedSha === releaseSha,
  surfaces.admin.deployedSha === releaseSha,
  surfaces.marketing.branch !== null,
  surfaces.web.branch !== null,
  surfaces.admin.branch !== null,
  surfaces.marketing.deploymentId !== null,
  surfaces.web.deploymentId !== null,
  surfaces.admin.deploymentId !== null,
  surfaces.marketing.deploymentUrl !== null,
  surfaces.web.deploymentUrl !== null,
  surfaces.admin.deploymentUrl !== null,
  surfaces.marketing.project === 'lythaus-marketing',
  surfaces.web.project === 'lythaus-web',
  surfaces.admin.project !== null,
  Object.values(surfaces.workers).every(({ versionId, sourceSha }) => versionId !== null && sourceSha === releaseSha),
  relationCountOrNull('PLANETSCALE_RELATION_COUNT') !== null,
  /^17\./.test(valueOrNull('PLANETSCALE_SERVER_VERSION') ?? ''),
  /^[0-9a-f]{64}$/.test(valueOrNull('PLANETSCALE_MIGRATION_SET_SHA256') ?? ''),
  urlOrNull('PROVIDER_EVIDENCE_RUN_URL') !== null,
];
const status = requiredEvidence.every(Boolean)
  ? 'ready'
  : [cloudflareStatus, planetscaleStatus].some((value) => value === 'UNKNOWN/BLOCKED' || value === 'BLOCKED')
    ? 'blocked'
    : 'partial';

const manifest = {
  schemaVersion: 'lythaus-release-manifest-v2',
  status,
  capturedAt: new Date().toISOString(),
  repository: { owner: 'AsoraKK', name: 'Lythaus', releaseSha },
  surfaces,
  deploymentEvidence: {
    databaseIdentityVerified: process.env.DATABASE_IDENTITY_VERIFIED === 'true',
    budgetEnforcementVerified: process.env.BUDGET_ENFORCEMENT_VERIFIED === 'true',
    authenticatedAcceptanceProven: process.env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true',
  },
  cloudflare: {
    accountId: registry.policy.cloudflareAccountId,
    zone: registry.policy.activeZone,
    inventoryStatus: cloudflareStatus,
    hyperdrive: {
      manifestPath: 'infrastructure/cloudflare/native-hyperdrive-production.json',
      targetBranch: hyperdrive.productionTargetBranch,
    expectedMainOriginFingerprint: hyperdrive.expectedMainOriginFingerprint,
    verifiedMain: process.env.HYPERDRIVE_VERIFIED_MAIN === 'true',
    providerEvidenceRunUrl: urlOrNull('PROVIDER_EVIDENCE_RUN_URL'),
    },
  },
  planetscale: {
    organization: hyperdrive.planetScaleOrganization,
    database: hyperdrive.planetScaleDatabase,
    branch: hyperdrive.productionTargetBranch,
    inventoryStatus: planetscaleStatus,
    serverVersion: valueOrNull('PLANETSCALE_SERVER_VERSION'),
    relationCount: relationCountOrNull('PLANETSCALE_RELATION_COUNT'),
    latestMigration: migration.migrations.at(-1)?.name ?? null,
    migrationSetSha256: migration.checksum,
    observedMigrationSetSha256: valueOrNull('PLANETSCALE_MIGRATION_SET_SHA256'),
    migrationBytes: migration.bytes,
    databaseIdentityVerified: process.env.DATABASE_IDENTITY_VERIFIED === 'true',
    schemaFingerprint: fingerprintOrNull('PLANETSCALE_SCHEMA_FINGERPRINT'),
    grantsVerified: process.env.PLANETSCALE_GRANTS_VERIFIED === 'true',
    migrationCount: migration.migrations.length,
  },
  evidence: {
    source: 'exact reviewed main SHA and sanitized provider evidence',
    unknowns: [
      cloudflareStatus === 'VERIFIED' ? null : `Cloudflare live inventory status is ${cloudflareStatus}`,
      planetscaleStatus === 'VERIFIED' ? null : `PlanetScale live inventory status is ${planetscaleStatus}`,
      process.env.HYPERDRIVE_VERIFIED_MAIN === 'true' ? null : 'Hyperdrive main-target proof is unavailable',
      process.env.DATABASE_IDENTITY_VERIFIED === 'true' ? null : 'Database identity proof is unavailable',
      Object.values(surfaces.workers).some(({ versionId }) => versionId === null) ? 'One or more activated Worker version IDs are unavailable' : null,
      fingerprintOrNull('PLANETSCALE_SCHEMA_FINGERPRINT') === null ? 'PlanetScale schema fingerprint is unavailable' : null,
      process.env.PLANETSCALE_GRANTS_VERIFIED === 'true' ? null : 'PlanetScale grant verification is unavailable',
      surfaces.marketing.deploymentId === null || surfaces.web.deploymentId === null || surfaces.admin.deploymentId === null ? 'One or more actual Pages deployment IDs are unavailable' : null,
      Object.values(surfaces.workers).some(({ sourceSha }) => sourceSha !== releaseSha) ? 'One or more Worker source SHA proofs are unavailable or mismatched' : null,
      relationCountOrNull('PLANETSCALE_RELATION_COUNT') === null ? 'PlanetScale relation count is unavailable' : null,
      /^[0-9a-f]{64}$/.test(valueOrNull('PLANETSCALE_MIGRATION_SET_SHA256') ?? '') ? null : 'PlanetScale observed migration-set fingerprint is unavailable',
      process.env.BUDGET_ENFORCEMENT_VERIFIED === 'true' ? null : 'Budget enforcement proof is unavailable',
      process.env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true' ? null : 'Authenticated acceptance proof is unavailable',
    ].filter(Boolean),
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: manifest.status, releaseSha, output: path.relative(root, outputPath) }));
