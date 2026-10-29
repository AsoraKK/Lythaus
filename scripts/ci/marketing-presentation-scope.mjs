import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// These are the reviewed before/after bytes of the opening correction. A new
// presentation change requires its own review and an updated policy.
const PRESENTATION = Object.freeze({
  'apps/marketing-site/src/components/OpeningWordmark.astro': ['6e15db293c2c5b8b29ee7390aaf876e2bb5da005d08aa731b4681015c404f254', '447925dfdab28a24159de096af635c823f54ac8a022d12a35b559b98e45e51ce'],
  'apps/marketing-site/src/pages/index.astro': ['14f14fa6fb1e261ca4a069afee4b51426c8b14fd011060118133511742ed7085', '39dac5e56a1bbd1e6868fabb9784dd059ec00006959d9382e43e9ef9819152bd'],
  'apps/marketing-site/src/scripts/home-opening.js': ['cfe89352da44b0a5d23827b17e00e5bb54a545ac49b3ee72c287a3a17f9c47c8', 'b780d09c79146b6361a9cb124bf26792c26bb9e570e96d0fdf18f8874da0c9da'],
  'apps/marketing-site/src/styles/home-opening.css': ['6018d8dcf0f1df04627919361be846f385db84b2191f6abb0b5078cef3175b0c', '6d20a78cff287acfed4b23263c8fd84cc6fb4249501b43c9b519effd37a840ab'],
  'apps/marketing-site/src/styles/home-polish.css': ['ae846e1e2a5912251813d468097b228532bdf99c14e427e3b0e03461315509e6', '645408b00e4fc70aad271525d91997fd85f172495245481cfb587872aad98aed'],
});
const REVIEWED_NON_BUILD = Object.freeze({
  'apps/marketing-site/tests/home-opening-raster.test.mjs': 'A',
  'apps/marketing-site/tests/home-opening-state.test.mjs': 'A',
  'apps/marketing-site/tests/home-opening.browser.mjs': 'M',
  'apps/marketing-site/tests/homepage-protection.test.mjs': 'M',
  'apps/marketing-site/tests/homepage-waitlist.test.mjs': 'M',
  'docs/design-system/four-colour-contract.md': 'M',
  '.github/workflows/ci.yml': 'M',
  '.github/workflows/deploy-marketing-presentation.yml': 'A',
  'scripts/ci/marketing-presentation-scope.mjs': 'A',
  'scripts/ci/marketing-presentation-deployment.mjs': 'A',
  'scripts/ci/marketing-presentation-evidence.mjs': 'A',
  'scripts/tests/marketing-presentation-release.test.mjs': 'A',
  'scripts/tests/marketing-presentation-live.browser.mjs': 'A',
});
const sha = value => /^[a-f0-9]{40}$/.test(value ?? '');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { maxBuffer: 8 * 1024 * 1024 });

export function parseRawChanges(bytes) {
  const entries = bytes.toString('utf8').split('\0');
  if (entries.pop() !== '' || entries.length % 2) throw new Error('marketing_diff_incomplete');
  const changes = [];
  for (let i = 0; i < entries.length; i += 2) {
    const match = /^:(\d{6}) (\d{6}) ([a-f0-9]{40}) ([a-f0-9]{40}) ([A-Z])$/.exec(entries[i]);
    const name = entries[i + 1];
    if (!match || !/^[A-Za-z0-9._/-]+$/.test(name) || name.includes('..')) throw new Error('marketing_diff_invalid');
    changes.push({ oldMode: match[1], newMode: match[2], oldId: match[3], newId: match[4], status: match[5], name });
  }
  if (new Set(changes.map(row => row.name)).size !== changes.length) throw new Error('marketing_diff_duplicate');
  return changes;
}

export function classifyPresentationChanges(changes, readBlob) {
  if (!Array.isArray(changes) || new Set(changes.map(row => row.name)).size !== changes.length)
    throw new Error('marketing_diff_duplicate');
  const found = new Set();
  for (const row of changes) {
    const approved = PRESENTATION[row.name];
    const expectedStatus = approved ? 'M' : REVIEWED_NON_BUILD[row.name];
    if (!expectedStatus || row.status !== expectedStatus
      || row.newMode !== '100644' || row.oldMode !== (row.status === 'A' ? '000000' : '100644')) {
      throw new Error(`marketing_scope_unapproved:${row.name}`);
    }
    if (approved) {
      if (hash(readBlob('base', row.name)) !== approved[0] || hash(readBlob('candidate', row.name)) !== approved[1])
        throw new Error(`marketing_presentation_bytes_changed:${row.name}`);
      found.add(row.name);
    }
    if (row.name === '.github/workflows/ci.yml') {
      const old = readBlob('base', row.name).toString('utf8');
      const current = readBlob('candidate', row.name).toString('utf8');
      const anchor = '      - name: Reject retired provider dependencies\n        run: node scripts/validate-no-retired-provider-dependencies.mjs\n';
      const addition = '      - name: Validate marketing presentation release boundary\n        run: node --test scripts/tests/marketing-presentation-release.test.mjs\n';
      if (old.split(anchor).length !== 2 || current !== old.replace(anchor, anchor + addition))
        throw new Error('marketing_ci_change_unapproved');
    }
  }
  if (found.size !== Object.keys(PRESENTATION).length) throw new Error('marketing_reviewed_presentation_incomplete');
  return Object.freeze({ status: 'PRESENTATION_ONLY', recovery: 'NOT_APPLICABLE', changes: changes.map(row => row.name).sort() });
}

export function verifyPresentationScope(baseSha, candidateSha) {
  if (!sha(baseSha) || !sha(candidateSha) || baseSha === candidateSha) throw new Error('marketing_commit_identity_invalid');
  try { git('merge-base', '--is-ancestor', baseSha, candidateSha); }
  catch { throw new Error('marketing_deployed_commit_not_ancestor'); }
  const changes = parseRawChanges(git('diff', '--no-ext-diff', '--no-renames', '--no-abbrev', '--raw', '-z', baseSha, candidateSha, '--'));
  const classified = classifyPresentationChanges(changes, (side, name) => git('show', `${side === 'base' ? baseSha : candidateSha}:${name}`));
  return { schemaVersion: 1, baseSha, candidateSha, ...classified };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(verifyPresentationScope(process.argv[2], process.argv[3]))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
