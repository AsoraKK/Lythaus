import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { patchedSource } from './reputation-lock-candidate.mjs';

// Bundles the actual complete DB entry module. Only pg's driver is replaced;
// transaction logic is neither extracted nor reimplemented in the fixture.
export async function loadTransactionCandidate({ proposed, createClient }) {
  const root = new URL('../../../../', import.meta.url);
  const proposal = new URL('database/planetscale/proposals/', root);
  const key = 'lythaus_fake_pg_' + randomUUID();
  globalThis[key] = { createClient };
  try {
    const dbPatch = readFileSync(new URL('reputation_subject_lock.v2.patch.proposal', proposal), 'utf8');
    const transactionPatch = readFileSync(new URL('reputation_subject_lock.transaction.v3.patch.proposal', proposal), 'utf8');
    const queuePatch = readFileSync(new URL(proposed ? 'reputation_subject_lock.queue.v3.patch.proposal' : 'reputation_subject_lock.queue.patch.proposal', proposal), 'utf8');
    const added = queuePatch.split('diff --git a/apps/lythaus-jobs/src/reputation-deleted-terminal.ts ')[1];
    assert.ok(added);
    const queueSource = added.split(/^@@[^\n]*\n/m).slice(1).join('\n').trimEnd().split('\n')
      .map(line => { assert.ok(line.startsWith('+')); return line.slice(1); }).join('\n');
    const require = createRequire(new URL('node_modules/wrangler/package.json', root));
    const { build } = require('esbuild');
    const exports = ['transaction', 'ReputationSubjectDeletedError', 'DatabaseCommitUncertainError'];
    if (proposed) exports.push('transactionWithVerifiedFailureCleanup', 'verifiedTransactionFailureCause', 'DatabaseTransactionCleanupUncertainError');
    const bundle = await build({
      stdin: { contents: `export { ${exports.join(',')} } from '@lythaus/db'; export { runReputationTransaction } from 'inert:queue';`,
        resolveDir: root.pathname, loader: 'ts' },
      bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022',
      plugins: [{ name: 'actual-transaction-fake-driver', setup(builder) {
        builder.onResolve({ filter: /^pg$/ }, () => ({ path: 'fake-pg', namespace: 'fake-driver' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake-driver' }, () => ({ contents:
          `export class Client { constructor(config) { const fixture = globalThis[${JSON.stringify(key)}]; if (!fixture) throw new Error('fake_driver_disposed'); return fixture.createClient(config); } } export default { Client };` }));
        builder.onResolve({ filter: /^@lythaus\/db$/ }, () => ({ path: new URL('packages/db/src/index.ts', root).pathname }));
        builder.onResolve({ filter: /^inert:queue$/ }, () => ({ path: 'queue', namespace: 'queue-proposal' }));
        builder.onLoad({ filter: /.*/, namespace: 'queue-proposal' }, () => ({ contents: queueSource, loader: 'ts' }));
        builder.onLoad({ filter: /packages\/db\/src\/(index|reputation)\.ts$/ }, args => {
          let result = patchedSource(args.path, dbPatch);
          if (proposed && args.path.endsWith('/index.ts')) result = patchedSource(args.path, transactionPatch, result.contents);
          return result;
        });
      } }],
    });
    const module = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
    return { module, dispose() { delete globalThis[key]; } };
  } catch (error) { delete globalThis[key]; throw error; }
}
