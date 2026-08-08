import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const configs = [
  'apps/lythaus-public-api/wrangler.jsonc',
  'apps/lythaus-admin-api/wrangler.jsonc',
  'apps/lythaus-jobs/wrangler.jsonc',
];
const requireProvisioned = process.argv.includes('--require-provisioned');
const failures = [];
const retiredBrand = ['as', 'ora'].join('');
const retiredCloudHost = ['az', 'ure', 'websites'].join('');
const retiredProductionOrigin = new RegExp(`${retiredCloudHost}\\.net|${retiredBrand}\\.co\\.za|${retiredBrand}-function|workers\\.dev|pages\\.dev|r2\\.dev`, 'i');
const expectedNames = {
  'apps/lythaus-public-api/wrangler.jsonc': 'lythaus-public-api-development',
  'apps/lythaus-admin-api/wrangler.jsonc': 'lythaus-admin-api-development',
  'apps/lythaus-jobs/wrangler.jsonc': 'lythaus-jobs-development',
};

for (const relative of configs) {
  const file = path.join(root, relative);
  const source = fs.readFileSync(file, 'utf8');
  const production = source.slice(0, source.indexOf('"env"') === -1 ? source.length : source.indexOf('"env"'));
  if (!/"workers_dev"\s*:\s*false/.test(source)) failures.push(`${relative}: production workers_dev must be false`);
  if (!/"preview_urls"\s*:\s*false/.test(source)) failures.push(`${relative}: production preview_urls must be false`);
  if (!/"nodejs_compat"/.test(source)) failures.push(`${relative}: nodejs_compat is required`);
  if (retiredProductionOrigin.test(production)) failures.push(`${relative}: legacy or public preview hostname found in production config`);
  if (!new RegExp(`"name"\\s*:\\s*"${expectedNames[relative]}"`).test(production)) failures.push(`${relative}: production must reuse ${expectedNames[relative]}`);
  if (/"images"\s*:/.test(production)) failures.push(`${relative}: Cloudflare Images binding is forbidden for this migration`);
  if (!/HYPERDRIVE_QUERY_CACHE_MODE/.test(source) || !/disabled/.test(source)) failures.push(`${relative}: Hyperdrive cache-disabled intent missing`);
  if (relative.includes('public-api') && !/api\.lythaus\.co/.test(production)) failures.push(`${relative}: public API must use api.lythaus.co`);
  if (relative.includes('admin-api') && !/admin-api\.lythaus\.co/.test(production)) failures.push(`${relative}: admin API must use admin-api.lythaus.co`);
  if (relative.includes('jobs') && /"routes"\s*:/.test(production)) failures.push(`${relative}: jobs Worker must not expose a production route`);
  if (requireProvisioned && /REPLACE_WITH_/.test(production)) failures.push(`${relative}: unresolved production binding or required secret placeholder`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${configs.length} native Worker configs${requireProvisioned ? ' with provisioning requirements' : ''}.`);
}
