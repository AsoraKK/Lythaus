import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lookupWithFullPartnerRateWindow } from './monthly-reward-partner-rate.fixture.mjs';

const partnerId='01900000-0000-7000-8000-000000000001',operatorId='01900000-0000-7000-8000-000000000002';
const limited=()=>new Error('monthly_partner_rate_limited');
function fixture(steps){
  let current,index=0,seedCalls=0;const observations=[];
  const run=()=>lookupWithFullPartnerRateWindow({partnerId,operatorId,limit:100,onAttempt:row=>observations.push(row),
    sql:async(text,values)=>{
      assert.match(text,/ON CONFLICT \(partner_id,operator_id,starts_at\) DO UPDATE SET requests=EXCLUDED.requests/);
      assert.deepEqual(values,[partnerId,operatorId,100,0]);current=steps[index++];seedCalls++;
      assert.ok(current,'fixture_script_exhausted');return{rows:[{starts_at:current.seeded,requests:100}]};
    },
    tx:work=>work({query:async(text,values)=>{
      if(text.startsWith('INSERT INTO trust.monthly_reward_partner_rate_windows')){
        assert.deepEqual(values,[partnerId,operatorId]);return{rows:[{requests:current.requests}]};
      }
      assert.match(text,/SELECT starts_at,requests,clock_timestamp\(\) AS observed_at/);
      assert.deepEqual(values,[partnerId,operatorId,current.seeded,current.requests]);
      return{rows:[{starts_at:current.consumed,requests:current.requests,
        observed_at:current.observed??new Date(new Date(current.consumed).getTime()+500)}]};
    }}),
    lookup:async client=>{
      await client.query('INSERT INTO trust.monthly_reward_partner_rate_windows synthetic fixture',[partnerId,operatorId]);
      if(current.error)throw current.error;return{state:'unknown'};
    },
  });
  return{run,observations,seedCalls:()=>seedCalls};
}
test('rate fixture preserves the exact production rejection in the seeded bucket',async()=>{
  const at='2026-10-09T12:04:00.000Z',f=fixture([{seeded:at,consumed:at,requests:101,error:limited()}]);
  await assert.rejects(f.run,{message:'monthly_partner_rate_limited'});
  assert.equal(f.seedCalls(),1);assert.equal(f.observations[0].rollover,false);
});
for(const [boundary,seeded,consumed] of [
  ['minute','2026-10-09T12:04:00.000Z','2026-10-09T12:05:00.000Z'],
  ['hour','2026-10-09T12:59:00.000Z','2026-10-09T13:00:00.000Z'],
  ['day','2026-10-09T23:59:00.000Z','2026-10-10T00:00:00.000Z'],
  ['month','2026-10-31T23:59:00.000Z','2026-11-01T00:00:00.000Z'],
  ['year','2026-12-31T23:59:00.000Z','2027-01-01T00:00:00.000Z'],
])test(`rate fixture verifies the fresh bucket at a ${boundary} rollover before reseeding`,async()=>{
  const f=fixture([{seeded,consumed,requests:1},{seeded:consumed,consumed,requests:101,error:limited()}]);
  await assert.rejects(f.run,{message:'monthly_partner_rate_limited'});
  assert.equal(f.seedCalls(),2);assert.deepEqual(f.observations.map(row=>[row.rollover,row.requests]),[[true,1],[false,101]]);
  assert.equal(f.observations[0].consumedAt-f.observations[0].seededAt,60000);
});
test('rate fixture never retries a same-bucket missing rejection',async()=>{
  const at='2026-10-09T12:04:00.000Z',f=fixture([{seeded:at,consumed:at,requests:101}]);
  await assert.rejects(assert.rejects(f.run,{message:'monthly_partner_rate_limited'}),/Missing expected rejection/);
  assert.equal(f.seedCalls(),1);
});
test('rate fixture fails closed for a same-bucket counter regression',async()=>{
  const at='2026-10-09T12:04:00.000Z',f=fixture([{seeded:at,consumed:at,requests:1}]);
  await assert.rejects(f.run,/fixture_seeded_bucket_counter_regressed/);assert.equal(f.seedCalls(),1);
});
test('rate fixture rejects a future bucket without actual server-clock evidence',async()=>{
  const f=fixture([{seeded:'2026-10-09T12:04:00.000Z',consumed:'2026-10-09T12:05:00.000Z',
    observed:'2026-10-09T12:04:59.999Z',requests:1}]);
  await assert.rejects(f.run,/fixture_server_clock_proof_invalid/);assert.equal(f.seedCalls(),1);
});
test('rate fixture cannot turn repeated rollovers into a passing or skipped rejection',async()=>{
  const f=fixture([0,1,2].map(index=>({seeded:new Date(Date.UTC(2026,9,9,12,index)),
    consumed:new Date(Date.UTC(2026,9,9,12,index+1)),requests:1})));
  await assert.rejects(f.run,{message:'fixture_rate_window_rollover_retries_exhausted'});assert.equal(f.seedCalls(),3);
});
