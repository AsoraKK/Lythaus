import assert from 'node:assert/strict';
import test from 'node:test';
import { lockLoginAccount, lockRefreshSession } from '../src/auth-account-transaction.ts';

function clientFor(...results) {
  const calls=[];
  return { calls, query:async(sql,values)=>{ calls.push({sql,values}); return results.shift(); } };
}
test('login locks current account and only issues for the still-current verified credential', async () => {
  for(const rows of [[], [{status:'suspended'}]]) assert.equal(await lockLoginAccount(clientFor({rows}), 'user', {}),undefined);
  const current={rows:[{status:'active',token_version:4}]};
  assert.equal(await lockLoginAccount(clientFor(current,{rowCount:0}), 'user', {}),undefined);
  const client=clientFor(current,{rowCount:1});
  assert.deepEqual(await lockLoginAccount(client,'user',{synthetic:true}),{status:'active',tokenVersion:4});
  assert.match(client.calls[0].sql,/FOR UPDATE/);
  assert.match(client.calls[1].sql,/verified_at IS NOT NULL AND password_hash/);
});
test('refresh re-reads family/account state only after acquiring the user lock', async () => {
  assert.equal(await lockRefreshSession(clientFor({rows:[]}), 'hash'),undefined);
  const owner={rows:[{user_id:'user'}]};
  assert.equal(await lockRefreshSession(clientFor(owner,{rows:[]},{rows:[]}), 'hash'),undefined);
  for(const tokenState of ['active','expired','revoked','family_revoked']) {
    const client=clientFor(owner,{rows:[]},{rows:[{session_id:'session',user_id:'user',family_id:'family',status:'active',token_state:tokenState}]});
    assert.deepEqual(await lockRefreshSession(client,'hash'),{sessionId:'session',userId:'user',familyId:'family',status:'active',tokenState});
    assert.match(client.calls[1].sql,/FOR UPDATE/);
    assert.match(client.calls[2].sql,/f.revoked_at IS NOT NULL/);
  }
});
