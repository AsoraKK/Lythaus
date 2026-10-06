import fs from 'node:fs';
import { approvedReleaseExpectation } from './product-integrity-schema-contract.mjs';
import { authenticatedAcceptanceFlagForRelease } from './release-readiness-mode.mjs';

const configPaths = [
  'apps/lythaus-public-api/wrangler.jsonc',
  'apps/lythaus-admin-api/wrangler.jsonc',
  'apps/lythaus-jobs/wrangler.jsonc',
  'apps/lythaus-auth-acceptance-coordinator/wrangler.jsonc',
];
const requiredVersion = '0020_auth_recovery_delivery.sql';
const releaseExpectation = approvedReleaseExpectation();
const expectedFingerprint = releaseExpectation.fingerprint;
const expectedRelationCount = String(releaseExpectation.relationCount);
const materialize = process.env.MATERIALIZE_PRODUCT_INTEGRITY_DEPLOY_CONFIGS === 'true';
const ownerTestingDeployment = process.env.OWNER_TESTING_DEPLOYMENT === 'true';
const authenticatedAcceptanceFlag = authenticatedAcceptanceFlagForRelease(ownerTestingDeployment);
const fingerprintPlaceholder = 'REPLACE_WITH_POST_0020_SCHEMA_FINGERPRINT';
const relationCountPlaceholder = 'REPLACE_WITH_POST_0020_RELATION_COUNT';
const accessTeamDomain = process.env.PRODUCT_INTEGRITY_ACCESS_TEAM_DOMAIN ?? '';
const accessAudiences = (process.env.PRODUCT_INTEGRITY_ACCESS_AUDIENCES ?? '')
  .split(',').map((value) => value.trim()).filter(Boolean);
const accessJwksUrl = `https://${accessTeamDomain}/cdn-cgi/access/certs`;
const turnstileSiteKey = process.env.PUBLIC_TURNSTILE_SITE_KEY ?? '';

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

for (const configPath of configPaths) {
  const committedSource = fs.readFileSync(configPath, 'utf8');
  if (productionValue(committedSource, 'EXPECTED_DATABASE_SCHEMA_FINGERPRINT') !== fingerprintPlaceholder) {
    throw new Error(`${configPath} must retain the post-0020 fingerprint placeholder until release materialization`);
  }
  if (productionValue(committedSource, 'EXPECTED_DATABASE_RELATION_COUNT') !== relationCountPlaceholder) {
    throw new Error(`${configPath} must retain the post-0020 relation-count placeholder until release materialization`);
  }
  if (productionValue(committedSource, 'AUTHENTICATED_ACCEPTANCE_PROVEN') !== 'false') {
    throw new Error(`${configPath} must remain fail-closed before production materialization`);
  }
  let source = committedSource
    .replace(`"${fingerprintPlaceholder}"`, `"${expectedFingerprint}"`)
    .replace(`"${relationCountPlaceholder}"`, `"${expectedRelationCount}"`)
    .replace('"AUTHENTICATED_ACCEPTANCE_PROVEN": "false"', `"AUTHENTICATED_ACCEPTANCE_PROVEN": "${authenticatedAcceptanceFlag}"`);
  if (configPath.includes('admin-api') || configPath.includes('auth-acceptance-coordinator')) {
    source = source
      .replace('"REPLACE_WITH_ACCESS_TEAM_DOMAIN"', JSON.stringify(accessTeamDomain))
      .replace('"REPLACE_WITH_ADMIN_UI_ACCESS_AUDIENCE,REPLACE_WITH_ADMIN_API_ACCESS_AUDIENCE"', JSON.stringify(accessAudiences.join(',')))
      .replace('"REPLACE_WITH_ACCESS_JWKS_URL"', JSON.stringify(accessJwksUrl));
  }
  if (configPath.includes('auth-acceptance-coordinator')) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(turnstileSiteKey)) throw new Error('PUBLIC_TURNSTILE_SITE_KEY must resolve the real production Turnstile widget');
    source = source.replace('"REPLACE_WITH_TURNSTILE_SITE_KEY"', JSON.stringify(turnstileSiteKey));
  }
  const version = productionValue(source, 'EXPECTED_DATABASE_SCHEMA_VERSION');
  const budgetLedger = productionValue(source, 'EXPECTED_DATABASE_BUDGET_LEDGER_APPLIED');
  if (productionValue(source, 'EXPECTED_DATABASE_SCHEMA_FINGERPRINT') !== expectedFingerprint) throw new Error(`${configPath} fingerprint materialization failed`);
  if (productionValue(source, 'EXPECTED_DATABASE_RELATION_COUNT') !== expectedRelationCount) throw new Error(`${configPath} relation-count materialization failed`);
  if (version !== requiredVersion) throw new Error(`${configPath} must require ${requiredVersion}`);
  if (budgetLedger !== 'true') throw new Error(`${configPath} must require the budget ledger`);
  if (productionValue(source, 'AUTHENTICATED_ACCEPTANCE_PROVEN') !== authenticatedAcceptanceFlag) {
    throw new Error(`${configPath} acceptance materialization failed for the selected deployment mode`);
  }
  if (/REPLACE_WITH_/.test(source.slice(0, source.indexOf('"env"')))) throw new Error(`${configPath} has an unresolved production placeholder`);
  if (materialize) fs.writeFileSync(configPath, source, 'utf8');
}

if (process.env.GITHUB_ENV) {
  fs.appendFileSync(
    process.env.GITHUB_ENV,
    `EXPECTED_DATABASE_SCHEMA_FINGERPRINT=${expectedFingerprint}\nEXPECTED_DATABASE_RELATION_COUNT=${expectedRelationCount}\n`,
    'utf8',
  );
}

console.log(`${materialize ? 'Materialized' : 'Validated'} canonical post-0020 deployment identity across ${configPaths.length} Worker configs.`);
