import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// PG17 acceptance exercises the committed runtime module against its disposable
// database fixture. The historical SQL approval packet is inspected separately.
export async function loadReputationLockCandidate() {
  return import('../../src/reputation.ts');
}

export async function loadReputationQueueCandidate() {
  const root = new URL('../../../../', import.meta.url);
  const proposal = new URL('database/planetscale/proposals/reputation_subject_lock.queue.patch.proposal', root);
  const queue = readFileSync(proposal, 'utf8');
  const added = queue.split('diff --git a/apps/lythaus-jobs/src/reputation-deleted-terminal.ts ')[1];
  assert.ok(added);
  const contents = added.split(/^@@[^\n]*\n/m).slice(1).join('\n').trimEnd()
    .split('\n').map(line => { assert.ok(line.startsWith('+')); return line.slice(1); }).join('\n');
  const require = createRequire(new URL('node_modules/wrangler/package.json', root));
  const { build } = require('esbuild');
  const bundle = await build({
    stdin: { contents: contents + "\nexport { ReputationSubjectDeletedError } from '@lythaus/db';",
      resolveDir: root.pathname, loader: 'ts' },
    bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022',
    plugins: [{ name: 'historical-v2-queue-control', setup(builder) {
      builder.onResolve({ filter: /^@lythaus\/db$/ }, () => ({ path: new URL('packages/db/src/index.ts', root).pathname }));
      builder.onResolve({ filter: /^pg$/ }, () => ({ path: 'fake-pg', namespace: 'fixture-pg' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture-pg' }, () => ({ contents: 'export class Client {}; export default { Client };' }));
    } }],
  });
  return import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
}
