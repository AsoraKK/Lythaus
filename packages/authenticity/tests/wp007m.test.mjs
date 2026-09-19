import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../../../', import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const text = path => readFileSync(new URL(path, root), 'utf8');
const co = json('research/wp007m/cohort-freeze.json');
const decision = json('research/wp007m/decision-freeze.json');

test('WP007M SAFE-A identity and production boundary remain frozen', () => {
  const a = json('research/wp007m/current-state-audit.json');
  assert.equal(a.safe.threshold, 0.5864923000335693);
  assert.equal(a.safe.checkpoint, 'b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e');
  assert.equal(a.productionAuthorization, 'NO');
  assert.equal(a.reserves.access, 0);
});
test('all membership is unique and descendants cannot cross source roles', () => {
  assert.equal(new Set(co.rows.map(r => r.sampleId)).size, co.rows.length);
  assert.equal(new Set(co.rows.map(r => r.sha256)).size, co.rows.length);
  for (const key of ['sourceFamilyId', 'splitGroup']) {
    const roles = new Map();
    for (const r of co.rows) {
      if (roles.has(r[key])) assert.equal(roles.get(r[key]), r.role);
      roles.set(r[key], r.role);
    }
  }
});
test('rights, historical exposure, and no training are explicit', () => {
  assert.equal(co.trainingAllowed, false);
  for (const r of co.rows) {
    assert.ok(r.rights);
    assert.equal(r.use, 'PRIVATE_EVALUATION_NO_TRAINING');
    assert.equal(r.historicalExposure, 'CONSUMED_BEFORE_WP007M');
    assert.doesNotMatch(r.relativePath, /flux[_.-]?2|reserve|sealed/i);
  }
});
test('fixed candidate and cutoff are not selected by synthetic outcomes', () => {
  assert.equal(decision.training, false);
  assert.equal(decision.choices.features.key, 'dependencyDecay');
  assert.equal(decision.choices.features.absolute, true);
  assert.equal(decision.choices.features.threshold, 0.3487158244046029);
  assert.equal(decision.choices.features.comparison, 'STRICT_GREATER');
  assert.equal(decision.choices.features.missing, 'NO_EVIDENCE');
  assert.equal(decision.choices.features.selection, 'PRESELECTED_NO_SYNTHETIC_LABEL_SELECTION');
});
test('protocol was frozen and no label/semantic model enters measurement', () => {
  assert.equal(createHash('sha256').update(readFileSync(new URL('research/wp007m/experiment-plan.md', root))).digest('hex'), co.planHash);
  const source = text('scripts/authenticity/wp007m_probe.py');
  const measure = source.split('def measure(rgb):')[1].split('def wilson')[0];
  assert.doesNotMatch(measure, /safeScore|label|generator|Moondream|GPT|Safety|metadata/);
  assert.match(source, /RESERVE_ACCESS_DENIED/);
  assert.match(source, /CONFIRM_RULE_IMMUTABLE/);
});
test('low and missing measurements do not become human conclusions', () => {
  const source = text('scripts/authenticity/wp007m_probe.py');
  assert.doesNotMatch(source, /return ["']HUMAN["']/);
  assert.match(text('scripts/authenticity/wp007m_low_memory.py'), /UNAVAILABLE_RESOURCE_GUARD_NOT_NEGATIVE/);
  assert.match(text('scripts/authenticity/wp007m_integrity.py'), /SUPPLEMENT_HASH_MISMATCH/);
});
