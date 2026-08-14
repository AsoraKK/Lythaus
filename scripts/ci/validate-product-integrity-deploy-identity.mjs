import fs from 'node:fs';
import { approvedPost0013Expectation } from './product-integrity-schema-contract.mjs';

const configPaths = [
  'apps/lythaus-public-api/wrangler.jsonc',
  'apps/lythaus-admin-api/wrangler.jsonc',
  'apps/lythaus-jobs/wrangler.jsonc',
];
const requiredVersion = '0013_marketing_waitlist.sql';
const post0013Expectation = approvedPost0013Expectation(
  process.env.PRODUCT_INTEGRITY_DATABASE_SCHEMA_FINGERPRINT ?? '',
  process.env.PRODUCT_INTEGRITY_DATABASE_RELATION_COUNT ?? '',
);
const expectedFingerprint = post0013Expectation.fingerprint;
const expectedRelationCount = String(post0013Expectation.relationCount);
const materialize = process.env.MATERIALIZE_PRODUCT_INTEGRITY_DEPLOY_CONFIGS === 'true';
const fingerprintPlaceholder = 'REPLACE_WITH_POST_0013_SCHEMA_FINGERPRINT';
const relationCountPlaceholder = 'REPLACE_WITH_POST_0013_RELATION_COUNT';
const accessTeamDomain = process.env.PRODUCT_INTEGRITY_ACCESS_TEAM_DOMAIN ?? '';
const accessAudiences = (process.env.PRODUCT_INTEGRITY_ACCESS_AUDIENCES ?? '')
  .split(',').map((value) => value.trim()).filter(Boolean);
const accessJwksUrl = process.env.PRODUCT_INTEGRITY_ACCESS_JWKS_URL ?? '';
const externalBackupHealthcheckUrl = process.env.PRODUCT_INTEGRITY_EXTERNAL_BACKUP_HEALTHCHECK_URL ?? '';

function productionValue(source, key) {
  const production = source.slice(0, source.indexOf('"env"') === -1 ? source.length : source.indexOf('"env"'));
  return production.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`))?.[1] ?? '';
}

if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(accessTeamDomain)) {
  throw new Error('PRODUCT_INTEGRITY_ACCESS_TEAM_DOMAIN must be the approved Cloudflare Access team domain');
}
if (accessAudiences.length !== 2 || new Set(accessAudiences).size !== 2
  || accessAudiences.some((value) => !/^[A-Za-z0-9_-]{8,256}$/.test(value))) {
  throw new Error('PRODUCT_INTEGRITY_ACCESS_AUDIENCES must contain the two approved Cloudflare Access audiences');
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
    throw new Error(`${configPath} must retain the post-0013 fingerprint placeholder until release materialization`);
  }
  if (productionValue(committedSource, 'EXPECTED_DATABASE_RELATION_COUNT') !== relationCountPlaceholder) {
    throw new Error(`${configPath} must retain the post-0013 relation-count placeholder until release materialization`);
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
      .replace('"REPLACE_WITH_ADMIN_UI_ACCESS_AUDIENCE,REPLACE_WITH_ADMIN_API_ACCESS_AUDIENCE"', JSON.stringify(accessAudiences.join(',')))
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

console.log(`${materialize ? 'Materialized' : 'Validated'} canonical post-0013 deployment identity across ${configPaths.length} Worker configs.`);
