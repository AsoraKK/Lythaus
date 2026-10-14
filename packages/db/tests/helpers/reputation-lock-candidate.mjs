import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

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
        let source = readFileSync(args.path, 'utf8');
        for (const hunk of patch.split(/^@@[^\n]*\n/m).slice(1)) {
          const lines = hunk.trimEnd().split('\n');
          assert.ok(lines.every(line => /^[ +\-]/.test(line)));
          const original = lines.filter(line => line[0] !== '+').map(line => line.slice(1)).join('\n');
          const changed = lines.filter(line => line[0] !== '-').map(line => line.slice(1)).join('\n');
          assert.equal(source.split(original).length, 2, 'proposal patch must match exactly once');
          source = source.replace(original, changed);
        }
        return { contents: source, loader: 'ts' };
      });
    } }],
  });
  return import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
}
