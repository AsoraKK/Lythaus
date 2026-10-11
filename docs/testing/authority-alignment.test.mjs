import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const authorityPath = 'docs/policy/current-policy-authority.md';
const activePaths = [
  'AGENTS.md', 'README.md', 'docs/README.md',
  authorityPath, 'docs/architecture/adr-003-lythaus-current-state.md',
  'docs/architecture/email-guest-authentication-adr.md',
  'docs/architecture/runtime.md', 'docs/architecture/monthly-reputation-2026-10.md',
  'docs/runbooks/admin-ops.md', 'docs/runbooks/moderation-ops.md',
  'docs/runbooks/notifications-testing.md', 'docs/runbooks/crash-reporting.md',
  'docs/policy/reputation-policy-v1.md',
  'docs/policy/approved-product-copy.md', 'docs/policy/alpha-ai-authorship-and-moderation.md',
  'docs/product/quiet-trust-feed/state-machines.md',
  'docs/alpha/staged-rollout.md', 'docs/testing/monthly-reputation-acceptance.md',
  'docs/security/firebase-mobile-purpose-inventory.md',
  'docs/security/github-credential-purpose-inventory.md',
  'docs/firebase_fcm_setup.md', 'docs/firebase_ios_setup.md',
];
const documents = new Map(activePaths.map(relative => [relative, fs.readFileSync(path.join(root, relative), 'utf8')]));

function contradictions(relative, source) {
  if (relative === 'docs/policy/reputation-policy-v1.md') {
    return source.startsWith('> **Historical scope:**')
      && source.includes('[current policy authority](current-policy-authority.md)')
      ? [] : [`${relative}: historical scope notice missing`];
  }
  const failures = [];
  const headingStack = [];
  let paragraph = [];
  function inspect() {
    const block = paragraph.join(' ').trim();
    paragraph = [];
    if (!block) return;
    const historical = headingStack.some(heading => /^Historical appeals-v1\.0\.0/i.test(heading.title))
      || /Historical `appeals-v1\.0\.0`|`appeals-v1\.0\.0`.*five.*trained|D08.*Historical/i.test(block);
    if (!historical && /five (?:independently assigned )?trained reviewers|weighted (?:majority|quorum)|at most one trained Level 5|there is no.*timed auto-resolution|standard.{0,35}require.{0,20}trained editorial adjudicator|routine Editorial confirmation is required/i.test(block)) {
      failures.push(`${relative}: unscoped historical appeal instruction`);
    }
    if (!/historical|superseded|earlier|not rolling/i.test(block)
      && /(?:rolling three[- ]calendar[- ]month|valid for three calendar months|quarterly validity.*three calendar months)/i.test(block)) {
      failures.push(`${relative}: stale quarterly validity instruction`);
    }
    if (/Development branch: `development`|use `development` with synthetic|do not delete PlanetScale `development`|main.*currently exposes \d+ relations/i.test(block)) {
      failures.push(`${relative}: stale hosted database instruction`);
    }
    if (/Firebase credentials are present in Function App|https:\/\/<function-host>|processPendingNotifications.*(?:deployed|timer cycle)/i.test(block)) {
      failures.push(`${relative}: retired notification runtime instruction`);
    }
  }
  for (const line of source.split('\n')) {
    const heading = /^(#{1,6})\s+(.+)/.exec(line);
    if (heading) {
      inspect();
      while (headingStack.at(-1)?.level >= heading[1].length) headingStack.pop();
      headingStack.push({ level: heading[1].length, title: heading[2] });
    } else if (!line.trim() || line.startsWith('|')) {
      inspect();
      if (line.startsWith('|')) { paragraph.push(line); inspect(); }
    } else paragraph.push(line);
  }
  inspect();
  return failures;
}

function launchGates(source) {
  const failures = [];
  if (!/email\/password/i.test(source)) failures.push('email/password launch decision missing');
  if (!/public (?:posting|publishing).{0,40}withheld|withhold public (?:posting|publishing)/is.test(source)) failures.push('public publishing hold missing');
  if (!/calendar-quarter[- ]end/i.test(source)) failures.push('quarterly end rule missing');
  if (!/no earlier retroactive credit/i.test(source)) failures.push('no-retroactivity rule missing');
  if (!/no routine Editorial confirmation/i.test(source)) failures.push('standard appeal rule missing');
  if (!/historical.*policy version/is.test(source)) failures.push('historical version preservation missing');
  return failures;
}

test('active entry points contain no known contradictory instructions', () => {
  assert.deepEqual([...documents].flatMap(([relative, source]) => contradictions(relative, source)), []);
});

test('authority and root agent guidance retain the settled launch boundaries', () => {
  for (const relative of [authorityPath, 'AGENTS.md']) {
    assert.deepEqual(launchGates(documents.get(relative)), [], relative);
  }
});

test('relative local Markdown links resolve without provider access', () => {
  for (const [relative, source] of documents) {
    for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || target.startsWith('/') || /^[a-z]+:/i.test(target)) continue;
      assert.equal(fs.existsSync(path.resolve(root, path.dirname(relative), target)), true,
        `${relative}: missing local link ${target}`);
    }
  }
});

test('historical reputation body and signed catalogues retain baseline bytes', () => {
  const preserved = new Map([
    ['docs/policy/reputation-policy-v1.md', 'dbc43e47317a5a24efd294aefcdfe6ea34d3db1bca090acda64e1836f568b72c'],
    ['packages/contracts/policies/Lythaus_Monthly_Rewards_Action_Catalogue_v2.json', 'bc8be9d8f4cae4b0f3ec327e09f308069dd3e6b07e8ff57ccc6a6cc62435f5a2'],
    ['packages/contracts/policies/Lythaus_Monthly_Rewards_Suggestion_Amendment_v1.json', '5feded30f6c12532624f6031fb502230a19f88fd70aa2d059a65c4614aca43a9'],
  ]);
  for (const [relative, expected] of preserved) {
    let bytes = fs.readFileSync(path.join(root, relative));
    if (relative === 'docs/policy/reputation-policy-v1.md') {
      const offset = bytes.indexOf('# Reputation Policy v1\n');
      assert.ok(offset > 0, 'historical body must follow its scope notice');
      bytes = bytes.subarray(offset);
    }
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, relative);
  }
});

test('public community guidelines retain the reviewed baseline bytes', () => {
  const bytes = fs.readFileSync(path.join(root, 'docs/legal/public/community-guidelines.md'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    '75d5b1d3bff0beadd428237ec48faa4ab8363eafc8210d9354284dba081594d0');
});

test('a prospective approved budget is not rejected by a numeric heuristic', () => {
  const hypotheticalApprovedV2 = 'Fixture: version v2 has an explicitly approved ceiling 13,650.';
  assert.deepEqual(contradictions('fixture.md', hypotheticalApprovedV2), []);
});

test('unversioned weighted rules are rejected, scoped historical rules retained', () => {
  const rule = 'Five independently assigned trained reviewers and a weighted majority are required.';
  assert.equal(contradictions('fixture.md', `## Appeals\n\n${rule}`).length, 1);
  assert.deepEqual(contradictions('fixture.md', `## Historical appeals-v1.0.0\n\n${rule}`), []);
  assert.equal(contradictions('fixture.md', `## Historical appeals-v1.0.0\n\n${rule}\n\n## New standard cases\n\n${rule}`).length, 1);
});

test('routine Editorial confirmation cannot become a new standard-case requirement', () => {
  assert.equal(contradictions('fixture.md', 'Standard-risk cases require one trained editorial adjudicator.').length, 1);
  assert.equal(contradictions('fixture.md', 'Routine Editorial confirmation is required.').length, 1);
  assert.deepEqual(contradictions('fixture.md', 'New standard cases require no routine Editorial confirmation.'), []);
});

test('historical scoping cannot hide a later active table row', () => {
  const source = '| Historical | `appeals-v1.0.0` uses five trained reviewers |\n'
    + '| New standard | Five trained reviewers and a weighted majority are required |';
  assert.equal(contradictions('fixture.md', source).length, 1);
});

test('stale rolling validity is rejected while superseded evidence is readable', () => {
  assert.equal(contradictions('fixture.md', 'Quarterly validity is valid for three calendar months.').length, 1);
  assert.deepEqual(contradictions('fixture.md', 'Historical rolling three-calendar-month candidate; superseded prospectively.'), []);
});

test('hosted development and uncertified relation counts cannot return to guidance', () => {
  for (const source of ['Development branch: `development`', 'Use `development` with synthetic data.', 'main currently exposes 82 relations.']) {
    assert.equal(contradictions('AGENTS.md', source).length, 1);
  }
});

test('retired notification setup is rejected', () => {
  for (const source of ['Firebase credentials are present in Function App settings.', 'Use https://<function-host>/api/notifications/devices.']) {
    assert.equal(contradictions('fixture.md', source).length, 1);
  }
});

test('removing settled launch decisions or a publishing hold fails validation', () => {
  const source = documents.get(authorityPath);
  assert.equal(launchGates(source.replaceAll(/email\/password/gi, 'credential')).includes('email/password launch decision missing'), true);
  assert.equal(launchGates(source.replaceAll(/withheld|withhold/gi, 'available')).includes('public publishing hold missing'), true);
  assert.ok(launchGates('').length > 0);
});

test('checks are deterministic across repeated and concurrent read-only evaluation', async () => {
  const inspect = () => [...documents].flatMap(([relative, source]) => contradictions(relative, source));
  const results = await Promise.all([Promise.resolve().then(inspect), Promise.resolve().then(inspect)]);
  assert.deepEqual(results[0], inspect());
  assert.deepEqual(results[1], inspect());
});
