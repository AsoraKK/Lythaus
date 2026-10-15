import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

export async function loadTransactionCandidate({ proposed, createClient }) {
  const root = new URL('../../../../', import.meta.url);
  const key = 'lythaus_fake_pg_' + randomUUID();
  globalThis[key] = { createClient };
  try {
    const queueSource = proposed ? undefined : historicalQueueSource(root);
    const require = createRequire(new URL('node_modules/wrangler/package.json', root));
    const { build } = require('esbuild');
    const bundle = await build({
      stdin: { contents: `export {
        transaction, ReputationSubjectDeletedError, DatabaseCommitUncertainError,
        transactionWithVerifiedFailureCleanup, verifiedTransactionFailureCause,
        DatabaseTransactionCleanupUncertainError
      } from '@lythaus/db';
      export { runReputationTransaction } from 'fixture:queue';`,
        resolveDir: root.pathname, loader: 'ts' },
      bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022',
      plugins: [{ name: 'actual-wrapper-fake-driver', setup(builder) {
        builder.onResolve({ filter: /^pg$/ }, () => ({ path: 'fake-pg', namespace: 'fake-driver' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake-driver' }, () => ({ contents:
          `export class Client { constructor(config) { const fixture = globalThis[${JSON.stringify(key)}]; if (!fixture) throw new Error('fake_driver_disposed'); return fixture.createClient(config); } } export default { Client };` }));
        builder.onResolve({ filter: /^@lythaus\/db$/ }, () => ({ path: new URL('packages/db/src/index.ts', root).pathname }));
        builder.onResolve({ filter: /^fixture:queue$/ }, () => proposed
          ? ({ path: new URL('apps/lythaus-jobs/src/reputation-deleted-terminal.ts', root).pathname })
          : ({ path: 'queue', namespace: 'historical-v2-queue' }));
        if (!proposed) builder.onLoad({ filter: /.*/, namespace: 'historical-v2-queue' }, () => ({ contents: queueSource, loader: 'ts' }));
      } }],
    });
    const module = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
    return { module, dispose() { delete globalThis[key]; } };
  } catch (error) { delete globalThis[key]; throw error; }
}

function historicalQueueSource(root) {
  const queue = readFileSync(new URL('database/planetscale/proposals/reputation_subject_lock.queue.patch.proposal', root), 'utf8');
  const added = queue.split('diff --git a/apps/lythaus-jobs/src/reputation-deleted-terminal.ts ')[1];
  assert.ok(added);
  return added.split(/^@@[^\n]*\n/m).slice(1).join('\n').trimEnd()
    .split('\n').map(line => { assert.ok(line.startsWith('+')); return line.slice(1); }).join('\n');
}
