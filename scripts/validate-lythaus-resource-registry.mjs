import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'infrastructure', 'lythaus-resource-registry.json');
const registry = JSON.parse(fs.readFileSync(file, 'utf8'));
const failures = [];
const resources = Array.isArray(registry.resources) ? registry.resources : [];
const requiredNames = [
  'lythaus-public-api-development', 'lythaus-admin-api-development', 'lythaus-jobs-development',
  'lythaus-db-app-dev', 'lythaus-db-admin-dev', 'lythaus-db-jobs-dev', 'lythaus-db-privacy-dev', 'lythaus-core-fresh',
  'lythaus-media-quarantine-dev', 'lythaus-media-approved-dev', 'lythaus-private-exports-dev', 'lythaus-audit-archive-dev',
  'lythaus-config-dev', 'lythaus-core', 'main', 'development',
];
const seen = new Set();
const retiredBrand = ['as', 'ora'].join('');
const retiredCloudHost = ['az', 'ure', 'websites'].join('');
const forbidden = new RegExp(`nite[- ]owl|${retiredBrand}\\.co\\.za|${retiredCloudHost}\\.net|password|secret|token`, 'i');
for (const name of requiredNames) if (!resources.some((resource) => resource.resourceName === name)) failures.push(`missing registry resource: ${name}`);
for (const resource of resources) {
  for (const field of ['provider', 'accountOrOrganisationId', 'resourceName', 'sanitisedResourceId', 'environment', 'region', 'purpose', 'authoritativeOwner', 'currentStatus', 'expectedCostClass', 'temporary', 'deletionAllowed', 'replacementPolicy']) {
    if (resource[field] === undefined) failures.push(`${resource.resourceName ?? '<unknown>'}: missing ${field}`);
  }
  const key = `${resource.provider}:${resource.accountOrOrganisationId}:${resource.resourceName}`;
  if (seen.has(key)) failures.push(`duplicate registry resource: ${key}`);
  seen.add(key);
  if (forbidden.test(JSON.stringify(resource))) failures.push(`${resource.resourceName}: forbidden secret or unrelated scope marker`);
  if (resource.provider === 'cloudflare' && resource.accountOrOrganisationId !== registry.policy.cloudflareAccountId) failures.push(`${resource.resourceName}: wrong Cloudflare account`);
}
if (registry.policy.discoverBeforeCreate !== true) failures.push('discover-before-create policy must be true');
if (registry.policy.creationRequiresOwnerApproval !== true) failures.push('creation approval policy must be true');
if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${resources.length} registered existing resources and creation guardrails.`);
}
