import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('scripts/cloudflare/audit-account.mjs', 'utf8');

test('Cloudflare audit remains read-only and covers integrations and deploy hooks', () => {
  for (const forbidden of ['method: \'POST\'', 'method: \'PUT\'', 'method: \'PATCH\'', 'method: \'DELETE\'']) {
    if (source.includes(forbidden)) throw new Error(`mutating request found: ${forbidden}`);
  }
  for (const required of ['sourceIntegration', 'triggerType', '/builds/workers/', 'deploy_hooks', 'const integrations', 'resources: { pages, workers, hyperdrives, r2, queues, workflows, kv, access, turnstile, dns, routes, integrations, deployHooks }']) {
    if (!source.includes(required)) throw new Error(`missing Cloudflare inventory contract: ${required}`);
  }
  if (source.includes('hook.url') || source.includes('hook.secret')) throw new Error('deploy hook secret material must not be recorded');
});
