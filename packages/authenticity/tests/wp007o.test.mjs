import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../../../', import.meta.url);
const text = p => readFileSync(new URL(p, root), 'utf8');

test('O publication preserves methodology without scientific outcome', () => {
  const status = JSON.parse(text('research/wp007o/WP007O_GOAL_AND_COMPLETION_LEDGER.json'));
  assert.deepEqual(status.scientificStatus, ['BLOCKED_DATA', 'BLOCKED_DISCLOSURE']);
  assert.equal(status.fullScientificCompletionClaim, false);
  assert.equal(status.productionAuthorization, 'NO');
  assert.match(text('research/wp007o/README.md'), /Methodology and tooling only; scientific results withheld/);
});

test('O public CLI cannot initiate another experiment', () => {
  const runner = text('scripts/authenticity/wp007o_run.py');
  assert.match(runner, /RESEARCH_STOPPED/);
  assert.doesNotMatch(runner, /argparse|\.fit\(|backward\(/);
  assert.match(runner, /requires_grad_\(False\)/);
});

test('O public scratch namespace does not name the authoritative runtime', () => {
  const source = text('scripts/authenticity/wp007o_core.py');
  assert.match(source, /lythaus-wp007o-methodology-runtime/);
  assert.doesNotMatch(source, /'lythaus-wp007o-runtime'/);
});

test('O source and calibration safeguards remain explicit', () => {
  const core = text('scripts/authenticity/wp007o_core.py');
  for (const reason of ['GROUP_CROSSES_ROLES', 'CALIBRATION_RIGHTS_OR_LABEL', 'RESERVE_PROHIBITED', 'INCOMPLETE_CALIBRATION']) assert.ok(core.includes(reason));
  assert.match(text('scripts/authenticity/wp007o_run.py'), /CALIBRATION_ALREADY_CONSUMED/);
});

test('O cache evidence is bound to model, source and feature identities', () => {
  const source = text('scripts/authenticity/wp007o_run.py');
  for (const reason of ['CACHE_MODEL_IDENTITY', 'CACHE_SOURCE_IDENTITY', 'CACHE_FEATURE_IDENTITY', 'CACHED_FEATURE_CORRUPTION']) assert.ok(source.includes(reason));
});

test('O independent arithmetic has no model or dataset dependencies', () => {
  const source = text('scripts/authenticity/wp007o_numeric_audit.py');
  assert.match(source, /0\.5 \* n/);
  assert.doesNotMatch(source, /import (numpy|torch|sklearn)|read_text|read_bytes|urlopen|requests/);
});

test('O publication directory excludes experiment artifacts', () => {
  const files = readdirSync(new URL('research/wp007o/', root));
  for (const name of files) assert.doesNotMatch(name, /cohort|score|threshold-freeze|confusion|group-metrics|rescue|nuisance|model-card/i);
});

test('O keeps authority and error-counting distinctions', () => {
  assert.match(text('scripts/authenticity/wp007o_run.py'), /RAW_RESEARCH_REFERENCE_NO_AUTHORITY/);
  assert.match(text('scripts/authenticity/wp007o_numeric_audit.py'), /additionalFPSourcesRelativeSAFE/);
  assert.match(text('research/wp007o/README.md'), /Low scores never mean HUMAN/);
});
