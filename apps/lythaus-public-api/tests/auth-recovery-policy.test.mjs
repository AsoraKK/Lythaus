import assert from 'node:assert/strict';
import test from 'node:test';
import { recoveryPlan, lockRecoveryAccount, findRecoveryUser, claimRegistrationAddress, establishVerifiedCredential, persistRecoveryIntake } from '../src/auth-recovery-policy.ts';

const account = { id: 'synthetic', status: 'active', protected_identity: false, contact_ciphertext: 'encrypted', contact_key_version: 'v1', contact_lookup: 'synthetic-digest', contact_verified: true, credential_lookup: 'synthetic-digest', credential_verified: true };

test('failed recovery is rolled back and durably diagnosed without identifying the account publicly',async()=>{
  const calls=[];
  const client={query:async(sql,values)=>{calls.push({sql,values});return {rows:[],rowCount:1};}};
  assert.equal(await persistRecoveryIntake(client,'synthetic-correlation',async()=>{throw new Error('sensitive provider detail');}),'failed');
  assert.match(calls[1].sql,/ROLLBACK TO SAVEPOINT/);
  assert.deepEqual(calls.at(-1).values.slice(1),['failed','synthetic-correlation']);
  assert.ok(!JSON.stringify(calls).includes('sensitive provider detail'));
  assert.equal(await persistRecoveryIntake(client,'synthetic-correlation',async()=>'queued'),'queued');
  await assert.rejects(persistRecoveryIntake({query:async(sql)=>{if(sql.includes('INSERT'))throw new Error('storage unavailable');}},'synthetic',async()=>'suppressed'),/storage unavailable/);
});
test('recovery keeps credential and account state distinct', () => {
  assert.equal(recoveryPlan(account), 'reset_password');
  assert.equal(recoveryPlan({ ...account, credential_verified: false, contact_verified: false }), 'credential_setup');
  assert.equal(recoveryPlan({ ...account, credential_lookup: null, credential_verified: false, status: 'relink_required' }), 'credential_setup');
  assert.equal(recoveryPlan(undefined), 'suppressed');
  for (const status of ['locked', 'suspended', 'deletion_pending', 'deleted', 'unknown']) assert.equal(recoveryPlan({ ...account, status }), 'suppressed');
});

test('recovery queries require exactly one canonical owner and serialize claims', async () => {
  const calls = [];
  let rows = [];
  const client = { query: async (sql, values) => { calls.push({sql,values}); return {rows,rowCount:rows.length}; } };
  assert.equal(await findRecoveryUser(client, 'fixture'), undefined);
  rows = [{user_id:'first'}, {user_id:'second'}];
  assert.equal(await findRecoveryUser(client, 'fixture'), undefined);
  rows = [{user_id:'first'}];
  assert.equal(await findRecoveryUser(client, 'fixture'), 'first');
  assert.equal(await claimRegistrationAddress(client, 'fixture'), false);
  rows = [];
  assert.equal(await claimRegistrationAddress(client, 'fixture'), true);
  assert.match(calls.at(-2).sql, /pg_advisory_xact_lock/);
  rows = [account];
  assert.deepEqual(await lockRecoveryAccount(client, account.id), account);
  assert.match(calls.at(-3).sql, /pg_advisory_xact_lock/);
  assert.match(calls.at(-2).sql, /FOR UPDATE/);
  rows = [];
  assert.equal(await lockRecoveryAccount(client, account.id), undefined);
});

test('credential establishment preserves the owner and revokes competing authorization', async () => {
  const calls = [];
  let rowCount = 1;
  const client = { query: async (sql, values) => { calls.push({sql,values}); return {rowCount}; } };
  const pending = {...account, credential_verified:false};
  await establishVerifiedCredential(client, pending, {synthetic:'hash'});
  assert.equal(calls.length, 5);
  assert.ok(calls.every(call=>call.values[0]===account.id));
  assert.match(calls[0].sql, /ON CONFLICT\(user_id\)/);
  assert.match(calls[2].sql, /token_version=token_version\+1/);
  assert.match(calls[3].sql, /auth_sessions SET revoked_at/);
  assert.match(calls[4].sql, /refresh_token_families SET revoked_at/);
  await assert.rejects(establishVerifiedCredential(client, account, {}), /verification_token_invalid/);
  rowCount = 0;
  await assert.rejects(establishVerifiedCredential(client, pending, {}), /verification_token_invalid/);
});
test('legacy setup requires trusted linkage and cannot claim protected/conflicting identities', () => {
  for (const override of [{ protected_identity: true }, { credential_lookup: 'conflicting-digest' }, { contact_ciphertext: null }, { contact_key_version: 'unknown' }, { contact_lookup: null }, { credential_lookup: null, contact_verified: false }]) {
    assert.equal(recoveryPlan({ ...account, ...override }), 'support_required');
  }
});
