import assert from 'node:assert/strict';

const rateInsert='INSERT INTO trust.monthly_reward_partner_rate_windows';
const minute=60000;
function instant(value){
  const result=new Date(value).getTime();assert.ok(Number.isFinite(result),'fixture_invalid_server_instant');return result;
}
export async function seedFullPartnerRateWindow(sql,{partnerId,operatorId,limit},previousMinute=false){
  assert.ok(Number.isSafeInteger(limit)&&limit>0,'fixture_invalid_rate_limit');
  const result=await sql(`WITH bucket AS MATERIALIZED (
    SELECT date_trunc('minute',clock_timestamp())-($4::integer*interval '1 minute') AS starts_at)
    INSERT INTO trust.monthly_reward_partner_rate_windows (partner_id,operator_id,starts_at,requests)
    SELECT $1,$2,starts_at,$3 FROM bucket
    ON CONFLICT (partner_id,operator_id,starts_at) DO UPDATE SET requests=EXCLUDED.requests
    RETURNING starts_at,requests`,[partnerId,operatorId,limit,previousMinute?1:0]);
  assert.equal(result.rows.length,1,'fixture_seed_bucket_missing');
  assert.equal(result.rows[0].requests,limit,'fixture_seed_bucket_not_full');
  assert.equal(instant(result.rows[0].starts_at)%minute,0,'fixture_seed_bucket_not_aligned');
  return result.rows[0];
}
export async function lookupWithFullPartnerRateWindow({sql,tx,lookup,partnerId,operatorId,limit,
  seedWindow=input=>seedFullPartnerRateWindow(sql,input),onAttempt=()=>{}}){
  for(let attempt=0;attempt<3;attempt++){
    const seeded=await seedWindow({partnerId,operatorId,limit});
    assert.equal(seeded.requests,limit,'fixture_seed_bucket_not_full');
    const seededAt=instant(seeded.starts_at);assert.equal(seededAt%minute,0,'fixture_seed_bucket_not_aligned');
    let observed,value,error;
    try{
      value=await tx(client=>lookup({query:async(text,values)=>{
        const result=await client.query(text,values);
        if(text.startsWith(rateInsert)){
          assert.equal(observed,undefined,'fixture_duplicate_rate_insert');
          assert.deepEqual(values,[partnerId,operatorId],'fixture_rate_scope_changed');
          assert.equal(result.rows.length,1,'fixture_rate_result_missing');
          const requests=result.rows[0].requests;
          assert.ok(Number.isSafeInteger(requests)&&requests>0,'fixture_invalid_rate_counter');
          const rows=(await client.query(`SELECT starts_at,requests,clock_timestamp() AS observed_at
            FROM trust.monthly_reward_partner_rate_windows
            WHERE partner_id=$1 AND operator_id=$2 AND starts_at >= $3 AND requests=$4`,
          [partnerId,operatorId,seeded.starts_at,requests])).rows;
          assert.equal(rows.length,1,'fixture_actual_rate_bucket_ambiguous');
          assert.equal(rows[0].requests,requests,'fixture_actual_rate_counter_changed');
          observed={...rows[0],requests};
        }
        return result;
      }}));
    }catch(caught){error=caught;}
    assert.ok(observed,'fixture_actual_rate_bucket_missing');
    const consumedAt=instant(observed.starts_at),observedAt=instant(observed.observed_at);
    assert.equal(consumedAt%minute,0,'fixture_actual_rate_bucket_not_aligned');
    assert.ok(consumedAt>=seededAt&&consumedAt<=Math.floor(observedAt/minute)*minute,'fixture_server_clock_proof_invalid');
    const rollover=consumedAt>seededAt;
    onAttempt({attempt,seededAt,consumedAt,requests:observed.requests,rollover});
    if(!rollover){
      assert.equal(observed.requests,limit+1,'fixture_seeded_bucket_counter_regressed');
      if(error)throw error;
      return value;
    }
    assert.equal(observed.requests,1,'fixture_rolled_bucket_not_fresh');
    assert.equal(error,undefined,'fixture_rolled_bucket_lookup_failed');
  }
  throw new Error('fixture_rate_window_rollover_retries_exhausted');
}
