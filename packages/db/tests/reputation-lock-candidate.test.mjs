import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadReputationLockCandidate } from './helpers/reputation-lock-candidate.mjs';

const candidate = await loadReputationLockCandidate();
const userId = '01999000-0000-7000-8000-000000000001';
const v1 = await loadReputationLockCandidate(1);
for (const method of ['recordReputationSignal', 'refreshReputationProfile']) {
  test(`${method} v1 control continues querying after a deleted subject (mock only)`, async () => {
    let calls = 0;
    const client = { async query() {
      if (++calls === 1) return { rows: [{ status: 'deleted' }] };
      throw new Error('synthetic_query_after_deleted');
    } };
    const input = method === 'refreshReputationProfile' ? userId : {
      id: userId, subjectUserId: userId, sourceEventId: userId,
      signalType: 'email_verified', occurredAt: '2026-10-14T00:00:00Z',
    };
    await assert.rejects(v1[method](client, input), /synthetic_query_after_deleted/);
    assert.equal(calls, 2);
  });
}
for (const method of ['recordReputationSignal', 'refreshReputationProfile']) {
  for (const status of ['deleted', 'missing']) {
    test(`${method} rejects ${status} before any further query (mock only)`, async () => {
      const calls = [];
      const client = { async query(sql, values) {
        calls.push({ sql, values });
        assert.equal(calls.length, 1, 'terminal subject must not read replay/aggregate or write data');
        assert.equal(sql, 'SELECT status FROM trust.lock_reputation_subject($1::pg_catalog.uuid)');
        assert.deepEqual(values, [userId]);
        return { rows: status === 'missing' ? [] : [{ status }] };
      } };
      const input = method === 'refreshReputationProfile' ? userId : {
        id: userId, subjectUserId: userId, sourceEventId: userId,
        signalType: 'email_verified', occurredAt: '2026-10-14T00:00:00Z',
      };
      await assert.rejects(candidate[method](client, input),
        { message: status === 'deleted' ? 'reputation_subject_deleted' : 'reputation_subject_not_found' });
      assert.equal(calls.length, 1);
    });
  }
}
test('v1 proposal bytes remain available at the known hashes', () => {
  for (const [file, expected] of [
    ['reputation_subject_lock.sql.proposal', '71a4fc9a7945cd683bc1b70ad01e958d6d0735a6ab9a37f8c254669244732d62'],
    ['reputation_subject_lock.rollback.sql.proposal', 'b28eacc41c8c5b77311cd0dc3ef14467e7c515aac53e908186080e7c9a56796f'],
    ['reputation_subject_lock.verify.sql.proposal', '35f8fe76fa3bab02c2388fba45a49352aa6918e04e38e2ed4a9be38b133e87fd'],
    ['reputation_subject_lock.patch.proposal', '7739004a2198740908ae99e82682890c18edb00222de3595e137e135ef5835d1'],
  ]) {
    const content = readFileSync(new URL('../../../database/planetscale/proposals/' + file, import.meta.url));
    assert.equal(createHash('sha256').update(content).digest('hex'), expected);
  }
});
test('v2 SQL files are single outer comments with bounded extraction markers', () => {
  for (const [file, marker] of [
    ['reputation_subject_lock.v2.sql.proposal', 'CANDIDATE'],
    ['reputation_subject_lock.v2.verify.sql.proposal', 'SESSION VERIFICATION'],
  ]) {
    const source = readFileSync(new URL('../../../database/planetscale/proposals/' + file, import.meta.url), 'utf8');
    assert.ok(source.startsWith('/*') && source.trimEnd().endsWith('*/'));
    assert.equal(source.split('/*').length, 2);
    assert.equal(source.split('*/').length, 2);
    assert.equal(source.split(`BEGIN REPUTATION LOCK ${marker}\n`).length, 2);
    assert.equal(source.split(`END REPUTATION LOCK ${marker}`).length, 2);
  }
});
