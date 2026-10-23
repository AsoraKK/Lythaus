import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPreparedSuggestionEvidence } from '../src/monthly-suggestion-evidence.ts';

const requestId='019a0000-0000-7000-8000-000000000001';
const subjectUserId='019a0000-0000-7000-8000-000000000002';
const eventId='019a0000-0000-7000-8000-000000000003';
const input=()=>({requestId,subjectUserId,supportPolicyVersion:'historic_support_fixture_v1'});

test('observation loader rejects unbounded or malformed identifiers before reading the database',async()=>{
  let reads=0;
  const client={query:async()=>{reads++;return {rows:[]};}};
  for(const patch of [
    {requestId:'not-a-uuid'},{subjectUserId:'not-a-uuid'},{supportPolicyVersion:''},
    {supportPolicyVersion:'invalid policy'},{supportPolicyVersion:'v'.repeat(129)},
    {deliveredEventIds:null},{deliveredEventIds:{}},{deliveredEventIds:['not-a-uuid']},
    {deliveredEventIds:Array(257).fill(eventId)}
  ])await assert.rejects(loadPreparedSuggestionEvidence(client,{...input(),...patch}),/monthly_suggestion_input_invalid/);
  assert.equal(reads,0);
});

test('a missing or subject-mismatched canonical request yields no evidence',async()=>{
  let reads=0;
  const client={query:async(sql,values)=>{
    reads++;assert.match(sql,/r\.submitter_id=\$2/);assert.match(sql,/account\.deleted_at IS NULL/);
    assert.deepEqual(values,[requestId,subjectUserId]);return {rows:[]};
  }};
  assert.equal(await loadPreparedSuggestionEvidence(client,input()),null);
  assert.equal(reads,1);
});

test('an empty recorded history stays pending, with no earning revisions or award authority',async()=>{
  let reads=0;
  const row={id:requestId,submitter_id:subjectUserId,policy_version:input().supportPolicyVersion,
    state:'submitted',revision:1,performed_at:'2026-10-01T12:00:00.123456Z',decisions:[],evidence:[],events:[],audits:[]};
  const client={query:async()=>{reads++;return {rows:[row]};}};
  const result=await loadPreparedSuggestionEvidence(client,{...input(),deliveredEventIds:[]});
  assert.equal(result.adapterVersion,'support-suggestion-observation-v1');
  assert.equal(result.status,'earning_policy_pending');assert.equal(result.appliedPoints,0);
  assert.equal(result.runtimeActivationAllowed,false);assert.deepEqual(result.earningRevisions,[]);
  assert.deepEqual(result.observations,[]);assert.ok(result.pendingGates.includes('earning_reviewer_authority'));
  assert.ok(result.pendingGates.includes('acceptance_and_reversal_mapping'));
  assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.observations));assert.equal(reads,1);
  await assert.rejects(loadPreparedSuggestionEvidence(client,{...input(),supportPolicyVersion:'rewritten_v2'}),/monthly_suggestion_source_policy_mismatch/);
  await assert.rejects(loadPreparedSuggestionEvidence(client,{...input(),deliveredEventIds:[eventId]}),/monthly_suggestion_canonical_history_required/);
});

test('bounded complete source sets reject overflow rather than silently dropping older decisions',async()=>{
  const base={id:requestId,submitter_id:subjectUserId,policy_version:input().supportPolicyVersion,
    state:'submitted',revision:1,performed_at:'2026-10-01T12:00:00.000000Z',decisions:[],evidence:[],events:[],audits:[]};
  for(const field of ['decisions','evidence','events','audits']){
    const client={query:async()=>({rows:[{...base,[field]:Array(257).fill({})}]})};
    await assert.rejects(loadPreparedSuggestionEvidence(client,input()),/monthly_suggestion_canonical_history_required/);
  }
});
