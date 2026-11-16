import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildSingleStatementInitialGrants } from '../ci/lythaus-new-core-connector-grants.mjs';

const source = fs.readFileSync(new URL('../../database/planetscale/provisioning/new-core-console-initial-grants.sql', import.meta.url), 'utf8');

test('connector adapter binds exact approved SQL and refuses any source drift', () => {
  for (const changed of [source + '\n', source.replace('GRANT CREATE', 'GRANT ALL'),
    source.replace('lythaus-new-core', 'lythaus-core')]) {
    assert.throws(() => buildSingleStatementInitialGrants(changed), /source_mismatch/);
  }
});

test('single-statement packaging preserves every reviewed role/grant/check statement', () => {
  const sql = buildSingleStatementInitialGrants(source);
  const body = source.slice(source.indexOf('DO $new_core_owner_setup$'), source.indexOf('$new_core_owner_setup$;') + '$new_core_owner_setup$;'.length);
  const actual = sql.slice(sql.indexOf('DO $new_core_owner_setup$')).trimEnd();
  assert.equal(actual.replace('\nBEGIN\n  SET LOCAL ROLE postgres;\n', '\nBEGIN\n'), body);
});
