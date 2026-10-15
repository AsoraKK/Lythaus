import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

export function patchedSource(path, patch, source = readFileSync(path, 'utf8')) {
  const relative = 'packages/db/src/' + path.split('/').at(-1);
  patch = patch.split(`diff --git a/${relative} b/${relative}\n`)[1]?.split('\ndiff --git ')[0];
  assert.ok(patch, 'proposal must name the exact source file');
  for (const hunk of patch.split(/^@@[^\n]*\n/m).slice(1)) {
    const lines = hunk.trimEnd().split('\n');
    assert.ok(lines.every(line => /^[ +\-]/.test(line)));
    const original = lines.filter(line => line[0] !== '+').map(line => line.slice(1)).join('\n');
    const changed = lines.filter(line => line[0] !== '-').map(line => line.slice(1)).join('\n');
    assert.equal(source.split(original).length, 2, 'proposal patch must match exactly once');
    source = source.replace(original, changed);
  }
  return { contents: source, loader: 'ts' };
}
// Test-only in-memory candidate. Never edits or imports a patched production file.
export async function loadReputationLockCandidate(version = 2) {
  assert.ok(version === 1 || version === 2);
  const file = version === 2 ? 'reputation_subject_lock.v2.patch.proposal' : 'reputation_subject_lock.patch.proposal';
  const patch = readFileSync(new URL('../../../../database/planetscale/proposals/' + file, import.meta.url), 'utf8');
  const require = createRequire(new URL('../../../../node_modules/wrangler/package.json', import.meta.url));
  const { build } = require('esbuild');
  const bundle = await build({
    entryPoints: [new URL('../../src/reputation.ts', import.meta.url).pathname],
    bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022',
    plugins: [{ name: 'inert-reputation-lock-candidate', setup(builder) {
      builder.onLoad({ filter: /packages\/db\/src\/reputation\.ts$/ }, args => {
        return patchedSource(args.path, patch);
      });
    } }],
  });
  return import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
}

export async function loadReputationQueueCandidate() {
  const base = new URL('../../../../', import.meta.url);
  const proposal = new URL('database/planetscale/proposals/', base);
  const patch = readFileSync(new URL('reputation_subject_lock.v2.patch.proposal', proposal), 'utf8');
  const queue = readFileSync(new URL('reputation_subject_lock.queue.patch.proposal', proposal), 'utf8');
  const added = queue.split('diff --git a/apps/lythaus-jobs/src/reputation-deleted-terminal.ts ')[1];
  assert.ok(added);
  const contents = added.split(/^@@[^\n]*\n/m).slice(1).join('\n').trimEnd()
    .split('\n').map(line => { assert.ok(line.startsWith('+')); return line.slice(1); }).join('\n');
  const require = createRequire(new URL('node_modules/wrangler/package.json', base));
  const { build } = require('esbuild');
  const bundle = await build({ stdin: { contents: contents + "\nexport { ReputationSubjectDeletedError } from '@lythaus/db';",
    resolveDir: base.pathname, loader: 'ts' },
    bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022',
    plugins: [{ name: 'unapplied-queue-candidate', setup(builder) {
      builder.onResolve({ filter: /^@lythaus\/db$/ }, () => ({ path: new URL('packages/db/src/reputation.ts', base).pathname }));
      builder.onLoad({ filter: /packages\/db\/src\/reputation\.ts$/ }, args => patchedSource(args.path, patch));
    } }],
  });
  return import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
}
