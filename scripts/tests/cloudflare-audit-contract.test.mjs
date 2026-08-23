import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('scripts/cloudflare/audit-account.mjs', 'utf8');

test('Cloudflare audit remains read-only and covers scoped integrations and current Builds evidence', () => {
  for (const forbidden of ['method: \'POST\'', 'method: \'PUT\'', 'method: \'PATCH\'', 'method: \'DELETE\'']) {
    if (source.includes(forbidden)) throw new Error(`mutating request found: ${forbidden}`);
  }
  for (const required of ['sourceIntegration', 'triggerType', '/builds/workers/', 'deployHookInventory', 'const integrations', 'resources: resourceCollections', 'classificationPolicy', 'legacyProviderExceptions', 'EXTERNAL / OUT OF SCOPE', 'NITE_OWL_MARKERS']) {
    if (!source.includes(required)) throw new Error(`missing Cloudflare inventory contract: ${required}`);
  }
  for (const forbidden of ['hook.url', 'hook.secret', 'publicAccessValues', 'gh issue create', 'issues: write']) {
    if (source.includes(forbidden)) throw new Error(`sensitive or mutating Cloudflare audit contract found: ${forbidden}`);
  }
});

test('Nite Owl resources are explicitly ignored without per-resource probing', () => {
  if (!source.includes('Ignored after account-level enumeration')) throw new Error('Nite Owl handling is not documented');
  if (!source.includes("classification !== 'EXTERNAL / OUT OF SCOPE'")) throw new Error('external resource filter is missing');
  if (source.includes('/builds/workers/${encodeURIComponent(name)}/deploy_hooks')) throw new Error('obsolete name-based deploy-hook probing remains');
});
