import fs from 'node:fs';

const configPaths = [
  'apps/lythaus-public-api/wrangler.jsonc',
  'apps/lythaus-admin-api/wrangler.jsonc',
  'apps/lythaus-jobs/wrangler.jsonc',
];
const requiredVersion = '0012_product_integrity_v2.sql';
const legacyFingerprint = '86ff272e09dbd195f18d262c354449ececdb907663615786c90a0d630b8f8625';
const expectedFingerprint = process.env.PRODUCT_INTEGRITY_DATABASE_SCHEMA_FINGERPRINT ?? '';
const expectedRelationCount = process.env.PRODUCT_INTEGRITY_DATABASE_RELATION_COUNT ?? '';
const materialize = process.env.MATERIALIZE_PRODUCT_INTEGRITY_DEPLOY_CONFIGS === 'true';
const fingerprintPlaceholder = 'REPLACE_WITH_POST_0012_SCHEMA_FINGERPRINT';
const relationCountPlaceholder = 'REPLACE_WITH_POST_0012_RELATION_COUNT';
const accessTeamDomain = process.env.PRODUCT_INTEGRITY_ACCESS_TEAM_DOMAIN ?? '';
const accessAudience = process.env.PRODUCT_INTEGRITY_ACCESS_AUDIENCE ?? '';
const accessJwksUrl = process.env.PRODUCT_INTEGRITY_ACCESS_JWKS_URL ?? '';
const externalBackupHealthcheckUrl = process.env.PRODUCT_INTEGRITY_EXTERNAL_BACKUP_HEALTHCHECK_URL ?? '';

function productionValue(source, key) {
  const production = source.slice(0, source.indexOf('"env"') === -1 ? source.length : source.indexOf('"env"'));
  return production.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`))?.[1] ?? '';
}

if (!/^[0-9a-f]{64}$/.test(expectedFingerprint) || expectedFingerprint === legacyFingerprint) {
  throw new Error('PRODUCT_INTEGRITY_DATABASE_SCHEMA_FINGERPRINT must be the approved post-0012 fingerprint');
}
if (!/^\d+$/.test(expectedRelationCount) || Number(expectedRelationCount) <= 0 || expectedRelationCount === '78') {
  throw new Error('PRODUCT_INTEGRITY_DATABASE_RELATION_COUNT must be the approved post-0012 relation count');
}
if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(accessTeamDomain)) {
  throw new Error('PRODUCT_INTEGRITY_ACCESS_TEAM_DOMAIN must be the approved Cloudflare Access team domain');
}
if (!/^[A-Za-z0-9_-]{8,256}$/.test(accessAudience)) {
  throw new Error('PRODUCT_INTEGRITY_ACCESS_AUDIENCE must be the approved Cloudflare Access audience');
}
if (accessJwksUrl !== `https://${accessTeamDomain}/cdn-cgi/access/certs`) {
  throw new Error('PRODUCT_INTEGRITY_ACCESS_JWKS_URL must be the approved Access certificate URL');
}
try {
  const backupUrl = new URL(externalBackupHealthcheckUrl);
  if (backupUrl.protocol !== 'https:') throw new Error('protocol');
} catch {
  throw new Error('PRODUCT_INTEGRITY_EXTERNAL_BACKUP_HEALTHCHECK_URL must be an approved HTTPS URL');
}

for (const configPath of configPaths) {
  const committedSource = fs.readFileSync(configPath, 'utf8');
  if (productionValue(committedSource, 'EXPECTED_DATABASE_SCHEMA_FINGERPRINT') !== fingerprintPlaceholder) {
    throw new Error(`${configPath} must retain the post-0012 fingerprint placeholder until live approval`);
  }
  if (productionValue(committedSource, 'EXPECTED_DATABASE_RELATION_COUNT') !== relationCountPlaceholder) {
    throw new Error(`${configPath} must retain the post-0012 relation-count placeholder until live approval`);
  }
  if (productionValue(committedSource, 'AUTHENTICATED_ACCEPTANCE_PROVEN') !== 'false') {
    throw new Error(`${configPath} must remain fail-closed before production materialization`);
  }
  let source = committedSource
    .replace(`"${fingerprintPlaceholder}"`, `"${expectedFingerprint}"`)
    .replace(`"${relationCountPlaceholder}"`, `"${expectedRelationCount}"`)
    .replace('"AUTHENTICATED_ACCEPTANCE_PROVEN": "false"', '"AUTHENTICATED_ACCEPTANCE_PROVEN": "true"');
  if (configPath.includes('admin-api')) {
    source = source
      .replace('"REPLACE_WITH_ACCESS_TEAM_DOMAIN"', JSON.stringify(accessTeamDomain))
      .replace('"REPLACE_WITH_ACCESS_AUDIENCE"', JSON.stringify(accessAudience))
      .replace('"REPLACE_WITH_ACCESS_JWKS_URL"', JSON.stringify(accessJwksUrl));
  }
  if (configPath.includes('jobs')) {
    source = source.replace('"REPLACE_WITH_EXTERNAL_BACKUP_HEALTHCHECK_URL"', JSON.stringify(externalBackupHealthcheckUrl));
  }
  const version = productionValue(source, 'EXPECTED_DATABASE_SCHEMA_VERSION');
  const budgetLedger = productionValue(source, 'EXPECTED_DATABASE_BUDGET_LEDGER_APPLIED');
  if (productionValue(source, 'EXPECTED_DATABASE_SCHEMA_FINGERPRINT') !== expectedFingerprint) throw new Error(`${configPath} fingerprint materialization failed`);
  if (productionValue(source, 'EXPECTED_DATABASE_RELATION_COUNT') !== expectedRelationCount) throw new Error(`${configPath} relation-count materialization failed`);
  if (version !== requiredVersion) throw new Error(`${configPath} must require ${requiredVersion}`);
  if (budgetLedger !== 'true') throw new Error(`${configPath} must require the budget ledger`);
  if (productionValue(source, 'AUTHENTICATED_ACCEPTANCE_PROVEN') !== 'true') throw new Error(`${configPath} acceptance materialization failed`);
  if (/REPLACE_WITH_/.test(source.slice(0, source.indexOf('"env"')))) throw new Error(`${configPath} has an unresolved production placeholder`);
  if (materialize) fs.writeFileSync(configPath, source, 'utf8');
}

console.log(`${materialize ? 'Materialized' : 'Validated'} post-0012 deployment identity across ${configPaths.length} Worker configs.`);
