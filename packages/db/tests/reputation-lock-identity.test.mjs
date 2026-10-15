import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadReputationQueueCandidate, patchedSource } from './helpers/reputation-lock-candidate.mjs';

const proposal = new URL('../../../database/planetscale/proposals/', import.meta.url);
const fixture = JSON.parse(readFileSync(new URL('fixtures/reputation-lock-identity.json', import.meta.url)));
const encode = fields => fields.map(value => Buffer.byteLength(value) + ':' + value).join('');
const fingerprint = fields => createHash('sha256').update(encode(fields)).digest('hex');
const values = fixture.fields.map(field => field.value);
const files = ['reputation_subject_lock.v2.sql.proposal', 'reputation_subject_lock.v2.verify.sql.proposal', 'reputation_subject_lock.v2.rollback.sql.proposal'];
test('unapplied package barrel exports the typed error and predicate for the Queue import', () => {
  const patch = readFileSync(new URL('reputation_subject_lock.v2.patch.proposal', proposal), 'utf8');
  const candidate = patchedSource(new URL('../src/index.ts', import.meta.url).pathname, patch).contents;
  assert.match(candidate, /export \{\s*ReputationSubjectDeletedError,\s*isReputationSubjectDeletedError,\s*refreshReputationProfile,/);
});
test('expected catalog fingerprint is reproducible from source; this is not PG catalog evidence', () => {
  assert.equal(fingerprint(values), fixture.fingerprint);
  const guards = files.map(file => {
    const sql = readFileSync(new URL(file, proposal), 'utf8');
    assert.ok(sql.startsWith('/*') && sql.trimEnd().endsWith('*/'));
    assert.equal(sql.split('/*').length, 2); assert.equal(sql.split('*/').length, 2);
    const guard = sql.split('DO $identity_guard$')[1].split('$identity_guard$;')[0];
    assert.ok(guard.includes(fixture.fingerprint));
    for (const field of fixture.fields) assert.ok(guard.includes(field.expression), field.name);
    assert.ok(guard.includes('acl.grantor'));
    return guard;
  });
  assert.equal(new Set(guards).size, 1);
  const install = readFileSync(new URL(files[0], proposal), 'utf8');
  assert.equal(install.split('AS $lock$')[1].split('$lock$;')[0], fixture.fields.find(field => field.name === 'body').value);
  const rollback = readFileSync(new URL(files[2], proposal), 'utf8');
  assert.ok(rollback.indexOf('$identity_guard$;') < rollback.indexOf('REVOKE ALL'));
  assert.ok(rollback.indexOf('$identity_guard$;') < rollback.indexOf('DROP FUNCTION'));
});
for (const [index, field] of fixture.fields.entries()) {
  test('static fingerprint mutation control: ' + field.name, () => {
    const changed = [...values]; changed[index] += 'synthetic-drift';
    assert.notEqual(fingerprint(changed), fixture.fingerprint);
  });
}
const queue = await loadReputationQueueCandidate();
test('historical v2 handler control accepts a typed error without wrapper cleanup proof (unsafe)', async () => {
  const order = [];
  const outcome = await queue.runReputationTransaction(async () => {
    try { order.push('begin'); throw new queue.ReputationSubjectDeletedError(); }
    catch (error) { order.push('rollback'); throw error; }
    finally { order.push('release'); }
  });
  assert.equal(outcome, 'deleted'); assert.deepEqual(order, ['begin', 'rollback', 'release']);
});
test('historical v2 handler rejects plain/forged errors but does not establish actual cleanup (mock)', async () => {
  for (const error of [new Error('reputation_subject_deleted'), { code: 'reputation_subject_deleted', name: 'ReputationSubjectDeletedError' },
    Object.assign(new Error('synthetic deadlock'), { code: '40P01' }), new Error('synthetic connection failure')]) {
    await assert.rejects(queue.runReputationTransaction(async () => { throw error; }), actual => actual === error);
  }
  assert.equal(await queue.runReputationTransaction(async () => undefined), 'processed');
});
