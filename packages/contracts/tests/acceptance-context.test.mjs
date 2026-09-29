import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptanceContextToken, requireAcceptanceRejection } from '../src/acceptance-context.ts';

test('email handoff extracts only the random bearer context, never candidate metadata', () => {
  const context='a'.repeat(64);
  assert.equal(acceptanceContextToken(context),context);
  assert.equal(acceptanceContextToken(JSON.stringify({context,releaseSha:'b'.repeat(40),candidateDependencies:{private:'metadata'}})),context);
  for(const value of ['','a'.repeat(63),'G'.repeat(64),'{','{}','{"context":1}','{"context":"short"}','[]']) {
    assert.throws(()=>acceptanceContextToken(value),/acceptance_context_invalid/);
  }
});

test('negative acceptance requires the intended rejection, not outages, rate limits or other errors', () => {
  assert.doesNotThrow(()=>requireAcceptanceRejection({status:400,body:{error:'verification_token_invalid'}},400,['verification_token_invalid']));
  for(const response of [{status:200,body:{error:'verification_token_invalid'}},{status:503,body:{error:'verification_token_invalid'}},
    {status:429,body:{error:'rate_limited'}},{status:400,body:{error:'password_screening_unavailable'}},
    {status:400,body:{error:{code:'verification_token_invalid'}}},{status:400,body:null}]) {
    assert.throws(()=>requireAcceptanceRejection(response,400,['verification_token_invalid']),/candidate_rejection_not_proven/);
  }
});
