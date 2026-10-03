import assert from 'node:assert/strict';
import { randomBytes,createHash } from 'node:crypto';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { uuidv7,encryptField,hmacLookup } from '@lythaus/security';
import { inviteMonthlyPartnerLink,consentToMonthlyPartnerLink,revokeMonthlyPartnerConsent } from '../../../packages/db/src/monthly-reward-partner-links.ts';
import { issueMonthlyRewardQr,fulfilMonthlyReward } from '../../../packages/db/src/monthly-reward-claims.ts';
import { approveMonthlyRewardSnapshotCorrection,applyMonthlyRewardSnapshotCorrection } from '../../../packages/db/src/monthly-reward-snapshots.ts';

const version='synthetic-claims-v1',short='synthetic-short-qr-v1';
export function registerRewardClaimCases(f){
  const {tx,sql,keys}=f;
  async function fixture(patch={}){
    const partner=patch.partner??uuidv7(),operator=patch.operator??await f.person(),user=await f.person(patch.tier??'free',false);
    const address=`synthetic-claim-${user}@example.invalid`,customerReference=`customer-${user}`;
    const encrypted=await encryptField(address,keys.encryptionKey,keys.keyVersion);
    await sql(`INSERT INTO identity.email_credentials (user_id,email_ciphertext,email_lookup_hmac,encryption_key_version,hmac_key_version,password_hash,verified_at)
      VALUES ($1,convert_to($2,'utf8'),decode($3,'base64'),$4,$4,'{}'::jsonb,'2026-07-01T00:00:00.000123Z')`,[user,encrypted.ciphertext,hmacLookup(address,keys.hmacKey),keys.keyVersion]);
    if(!patch.noSnapshot)await f.snapshot(user);
    await sql(`INSERT INTO trust.monthly_reward_partner_operators (partner_id,user_id,active,scopes)
      VALUES ($1,$2,true,ARRAY['link:invite','eligibility:read','claim:consume']) ON CONFLICT DO NOTHING`,[partner,operator]);
    const variant=patch.variant??await f.offer(patch.level??3,{partner});
    if(!patch.noSnapshot&&patch.tier!=='black')await f.select(user,variant);
    if(!patch.variant){
      await sql(`INSERT INTO trust.monthly_reward_fulfilment_terms
        (offer_version_id,usage_period,usage_limit,signed_usage_reference,approved_by,approved_at)
        VALUES ($1,'entitlement_month',$2,'synthetic signed usage only',$3,'2026-07-01')`,[variant.id,patch.limit??1,f.reviewer()]);
      await sql('INSERT INTO trust.monthly_reward_inventory (offer_version_id,available_units) VALUES ($1,$2)',[variant.id,patch.stock??1]);
    }
    const invitation=await tx(client=>inviteMonthlyPartnerLink(client,{partnerId:partner,operatorId:operator,variantId:variant.id,email:address,customerReference,
      idempotencyKey:uuidv7(),rulesVersion:f.partnerRules,keys}));
    const consent=await tx(client=>consentToMonthlyPartnerLink(client,{subjectId:user,invitationToken:invitation.token,termsVersion:'synthetic-terms-v1',
      expectedRevision:0,idempotencyKey:uuidv7(),rulesVersion:f.partnerRules,keys}));
    return {partner,operator,user,variant,consent,address,customerReference};
  }
  const issue=(m,patch={})=>tx(client=>issueMonthlyRewardQr(client,{subjectId:m.user,consentId:m.consent.id,variantId:m.variant.id,
    idempotencyKey:uuidv7(),rulesVersion:version,keys,...patch}));
  const consume=(m,patch={})=>tx(client=>fulfilMonthlyReward(client,{partnerId:m.partner,operatorId:m.operator,variantId:m.variant.id,
    idempotencyKey:uuidv7(),rulesVersion:version,keys,...patch}));
  const stock=m=>sql('SELECT available_units FROM trust.monthly_reward_inventory WHERE offer_version_id=$1',[m.variant.id]).then(result=>result.rows[0].available_units);
  async function invoice(m,patch={}){
    const id=uuidv7();
    await tx(client=>client.query(`INSERT INTO trust.monthly_reward_invoice_evidence
      (id,subject_user_id,consent_id,offer_version_id,invoice_period_hmac,period_starts_at,period_ends_at,renewal_at,verification_reference,adapter_mode,rules_version)
      VALUES ($1,$2,$3,$4,$5,date_trunc('month',coalesce($6::timestamptz,clock_timestamp()) AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
        (date_trunc('month',coalesce($6::timestamptz,clock_timestamp()) AT TIME ZONE 'UTC')+interval '1 month') AT TIME ZONE 'UTC',coalesce($6::timestamptz,clock_timestamp()),
        'synthetic trusted invoice proof only','synthetic_fixture',$7)`,[id,m.user,patch.consentId??m.consent.id,m.variant.id,patch.period??randomBytes(32),patch.renewalAt??null,version]),'lythaus_jobs');
    return id;
  }
  test('PAR-08/09/REL-03: claim adapters and QR validity are explicit approved fixtures, disabled without privacy or keys',async()=>{
    for(const [rules,mode,privacy,validity] of [[version,'synthetic_fixture','monthly-privacy-v1',300],[short,'synthetic_fixture','monthly-privacy-v1',1],['synthetic-claims-disabled','disabled','monthly-privacy-v1',300],['synthetic-claims-no-privacy','synthetic_fixture',null,300]])
      await sql(`INSERT INTO trust.monthly_reward_claim_rule_sets
        (version,partner_rules_version,status,adapter_mode,qr_validity_seconds,collection_privacy_version,approved_by,approved_at,approval_reference)
        VALUES ($1,$2,'pending_owner_approval',$3,$4,$5,$6,'2026-07-01','synthetic-only pending D12')`,[rules,f.partnerRules,mode,validity,privacy,f.reviewer()]);
    const m=await fixture();
    for(const patch of [{rulesVersion:undefined},{keys:undefined},{keys:{...keys,syntheticFixture:false}},{rulesVersion:'synthetic-claims-disabled'},{rulesVersion:'synthetic-claims-no-privacy'}])assert.equal((await issue(m,patch)).state,'pending');
    assert.equal((await consume(m,{rulesVersion:undefined})).state,'pending');
    await assert.rejects(issue(m,{keys:{...keys,encryptionKey:'invalid'}}),/keys_unavailable/);
  });
  test('PAR-03/08: opaque QR issue and online consume are durable, single use and atomically decrement stock once',async()=>{
    const m=await fixture(),key=uuidv7();const issued=await Promise.all([issue(m,{idempotencyKey:key}),issue(m,{idempotencyKey:key})]);
    assert.equal(issued.filter(item=>item.created).length,1);assert.equal(issued[0].token,issued[1].token);
    const reservation=(await sql('SELECT token_ciphertext FROM trust.monthly_reward_qr_reservations WHERE id=$1',[issued[0].id])).rows[0];assert.ok(!reservation.token_ciphertext.toString('utf8').includes(issued[0].token));
    assert.deepEqual(await consume(m,{qrToken:issued[0].token.toUpperCase()}),{state:'unknown'});
    const results=await Promise.all([consume(m,{qrToken:issued[0].token}),consume(m,{qrToken:issued[0].token})]);
    assert.equal(results.filter(item=>item.created).length,1);assert.equal(results[0].id,results[1].id);assert.equal(await stock(m),0);
    assert.equal((await issue(m,{idempotencyKey:key})).state,'consumed');
    assert.deepEqual(Object.keys(results[0]).sort(),['created','effectiveMonth','effectiveRewardLevel','id','offerVersionId','state']);
  });
  test('PAR-03: simultaneous different members cannot consume the final inventory unit twice',async()=>{
    const first=await fixture({stock:1,limit:2}),second=await fixture({partner:first.partner,variant:first.variant});
    const q1=await issue(first),q2=await issue(second);
    const outcomes=await Promise.allSettled([consume(first,{qrToken:q1.token}),consume(second,{qrToken:q2.token})]);
    assert.equal(outcomes.filter(item=>item.status==='fulfilled'&&item.value.created).length,1);
    assert.match(outcomes.find(item=>item.status==='rejected').reason.message,/stock_unavailable/);assert.equal(await stock(first),0);
  });
  test('PAR-03/08: QR and recurring invoices share the signed usage limit without spending reputation',async()=>{
    const m=await fixture({stock:2}),q=await issue(m),before=(await sql('SELECT source_score FROM trust.monthly_reward_snapshots WHERE subject_user_id=$1',[m.user])).rows[0].source_score;
    await consume(m,{qrToken:q.token});const proof=await invoice(m);
    await assert.rejects(consume(m,{invoiceEvidenceId:proof}),/usage_exhausted/);assert.equal(await stock(m),1);
    assert.equal((await sql('SELECT source_score FROM trust.monthly_reward_snapshots WHERE subject_user_id=$1',[m.user])).rows[0].source_score,before);
  });
  test('PAR-08/REL-02: invoice-period retries with different provider proof IDs retain the original authority',async()=>{
    const m=await fixture({stock:3,limit:3}),period=randomBytes(32),first=await invoice(m,{period}),second=await invoice(m,{period}),key=uuidv7();
    const results=await Promise.all([consume(m,{invoiceEvidenceId:first,idempotencyKey:key}),consume(m,{invoiceEvidenceId:second})]);
    assert.equal(results.filter(item=>item.created).length,1);assert.equal(results[0].id,results[1].id);assert.equal(await stock(m),2);
    assert.equal((await consume(m,{invoiceEvidenceId:first,idempotencyKey:key})).created,false);
    assert.equal((await consume(m,{invoiceEvidenceId:second,idempotencyKey:key})).created,false);
    const differentPeriod=await invoice(m);await assert.rejects(consume(m,{invoiceEvidenceId:differentPeriod,idempotencyKey:key}),/idempotency_reused/);
    await sql("UPDATE trust.monthly_reward_offer_availability SET state='paused' WHERE offer_version_id=$1",[m.variant.id]);
    const historical=await consume(m,{invoiceEvidenceId:second});assert.equal(historical.id,results[0].id);assert.equal(historical.created,false);assert.equal(await stock(m),2);
  });
  test('PAR-07/08/REL-02: a same-period invoice under a renewed current consent returns the original fulfilment once',async()=>{
    const m=await fixture({stock:3,limit:3}),period=randomBytes(32),firstProof=await invoice(m,{period});
    const original=await consume(m,{invoiceEvidenceId:firstProof});assert.equal(original.created,true);
    const invitation=await tx(client=>inviteMonthlyPartnerLink(client,{partnerId:m.partner,operatorId:m.operator,variantId:m.variant.id,
      email:m.address,customerReference:m.customerReference,idempotencyKey:uuidv7(),rulesVersion:f.partnerRules,keys}));
    const renewed=await tx(client=>consentToMonthlyPartnerLink(client,{subjectId:m.user,invitationToken:invitation.token,termsVersion:'synthetic-terms-v1',
      expectedRevision:m.consent.revision,idempotencyKey:uuidv7(),rulesVersion:f.partnerRules,keys}));
    const renewedProof=await invoice(m,{period,consentId:renewed.id});
    const replay=await consume(m,{invoiceEvidenceId:renewedProof});
    assert.equal(replay.id,original.id);assert.equal(replay.created,false);assert.equal(await stock(m),2);
    const linked=(await sql(`SELECT command.fulfilment_id,invoice.consent_id,fulfilled.consent_id AS original_consent_id
      FROM trust.monthly_reward_fulfilment_commands command JOIN trust.monthly_reward_invoice_evidence invoice ON invoice.id=command.invoice_evidence_id
      JOIN trust.monthly_reward_fulfilments fulfilled ON fulfilled.id=command.fulfilment_id WHERE invoice.id=$1`,[renewedProof])).rows[0];
    assert.equal(linked.fulfilment_id,original.id);assert.equal(linked.consent_id,renewed.id);assert.equal(linked.original_consent_id,m.consent.id);
  });
  test('PAR-07/SEC-01: superseded invoice consent cannot create a fresh command for the old period receipt',async()=>{
    const m=await fixture({stock:3,limit:3}),period=randomBytes(32);
    const original=await consume(m,{invoiceEvidenceId:await invoice(m,{period})});assert.equal(original.created,true);
    const invitation=await tx(client=>inviteMonthlyPartnerLink(client,{partnerId:m.partner,operatorId:m.operator,variantId:m.variant.id,
      email:m.address,customerReference:m.customerReference,idempotencyKey:uuidv7(),rulesVersion:f.partnerRules,keys}));
    const renewed=await tx(client=>consentToMonthlyPartnerLink(client,{subjectId:m.user,invitationToken:invitation.token,termsVersion:'synthetic-terms-v1',
      expectedRevision:m.consent.revision,idempotencyKey:uuidv7(),rulesVersion:f.partnerRules,keys}));
    const proof=await invoice(m,{period,consentId:renewed.id});
    const replacement=await tx(client=>inviteMonthlyPartnerLink(client,{partnerId:m.partner,operatorId:m.operator,variantId:m.variant.id,
      email:m.address,customerReference:m.customerReference,idempotencyKey:uuidv7(),rulesVersion:f.partnerRules,keys}));
    await tx(client=>consentToMonthlyPartnerLink(client,{subjectId:m.user,invitationToken:replacement.token,termsVersion:'synthetic-terms-v1',
      expectedRevision:renewed.revision,idempotencyKey:uuidv7(),rulesVersion:f.partnerRules,keys}));
    await assert.rejects(consume(m,{invoiceEvidenceId:proof}),/command_source_invalid/);assert.equal(await stock(m),2);
    assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_fulfilment_commands WHERE invoice_evidence_id=$1',[proof])).rowCount,0);
  });
  test('SEC-01/REL-02: a shared invoice-period fingerprint cannot replay another member’s fulfilment',async()=>{
    const first=await fixture({stock:3,limit:3}),second=await fixture({partner:first.partner,operator:first.operator,variant:first.variant}),period=randomBytes(32),key=uuidv7();
    const invoiceA=await invoice(first,{period}),invoiceB=await invoice(second,{period});
    const fulfilled=await consume(first,{invoiceEvidenceId:invoiceA,idempotencyKey:key});assert.equal(fulfilled.created,true);
    await assert.rejects(consume(second,{invoiceEvidenceId:invoiceB,idempotencyKey:key}),/idempotency_reused/);
    assert.equal((await consume(second,{invoiceEvidenceId:invoiceB})).created,true);assert.equal(await stock(first),1);
    const rows=(await sql(`SELECT fulfilled.subject_user_id FROM trust.monthly_reward_fulfilment_commands command
      JOIN trust.monthly_reward_fulfilments fulfilled ON fulfilled.id=command.fulfilment_id
      WHERE command.partner_id=$1 AND command.operator_id=$2 AND command.idempotency_key=$3`,[first.partner,first.operator,key])).rows;
    assert.deepEqual(rows.map(row=>row.subject_user_id),[first.user]);
  });
  test('PAR-05/07/08: wrong partner, unscoped operator and revoked or recovered consent cannot consume a QR',async()=>{
    const m=await fixture(),q=await issue(m),other=await fixture();
    assert.deepEqual(await consume(other,{qrToken:q.token}),{state:'unknown'});
    await assert.rejects(consume(m,{operatorId:f.reviewer(),qrToken:q.token}),/operator_not_allowed/);
    await tx(client=>revokeMonthlyPartnerConsent(client,{subjectId:m.user,consentId:m.consent.id,idempotencyKey:uuidv7()}));
    assert.deepEqual(await consume(m,{qrToken:q.token}),{state:'unknown'});assert.equal(await stock(m),1);
    const recovered=await fixture(),qr=await issue(recovered);
    await sql("INSERT INTO identity.account_events (id,user_id,event_type) VALUES ($1,$2,'password_reset_completed')",[uuidv7(),recovered.user]);
    assert.deepEqual(await consume(recovered,{qrToken:qr.token}),{state:'unknown'});assert.equal(await stock(recovered),1);
  });
  test('PAR-07/REL-01: invoice evidence rejects revoked, superseded and recovery-invalid consent at insertion',async()=>{
    const revoked=await fixture();await tx(client=>revokeMonthlyPartnerConsent(client,{subjectId:revoked.user,consentId:revoked.consent.id,idempotencyKey:uuidv7()}));
    await assert.rejects(invoice(revoked),/invoice_scope_invalid/);
    const superseded=await fixture(),next=await tx(client=>inviteMonthlyPartnerLink(client,{partnerId:superseded.partner,operatorId:superseded.operator,
      variantId:superseded.variant.id,email:superseded.address,customerReference:superseded.customerReference,idempotencyKey:uuidv7(),rulesVersion:f.partnerRules,keys}));
    const renewed=await tx(client=>consentToMonthlyPartnerLink(client,{subjectId:superseded.user,invitationToken:next.token,termsVersion:'synthetic-terms-v1',
      expectedRevision:1,idempotencyKey:uuidv7(),rulesVersion:f.partnerRules,keys}));
    await assert.rejects(invoice(superseded),/invoice_scope_invalid/);
    superseded.consent=renewed;assert.equal(typeof await invoice(superseded),'string');
    const recovered=await fixture();await sql("INSERT INTO identity.account_events (id,user_id,event_type) VALUES ($1,$2,'password_reset_completed')",[uuidv7(),recovered.user]);
    await assert.rejects(invoice(recovered),/invoice_scope_invalid/);
  });
  test('REL-01/02: revocation committed between QR candidate read and locks prevents stale fulfilment',async()=>{
    const m=await fixture(),q=await issue(m);let reached,resume;
    const barrier=new Promise(resolve=>{reached=resolve;}),released=new Promise(resolve=>{resume=resolve;});
    const pending=tx(client=>fulfilMonthlyReward({query:async(text,values)=>{
      if(text==='SELECT trust.lock_monthly_reward_link_members($1::uuid[])'){reached();await released;}return client.query(text,values);
    }},{partnerId:m.partner,operatorId:m.operator,variantId:m.variant.id,qrToken:q.token,idempotencyKey:uuidv7(),rulesVersion:version,keys}));
    await barrier;try{await tx(client=>revokeMonthlyPartnerConsent(client,{subjectId:m.user,consentId:m.consent.id,idempotencyKey:uuidv7()}));}finally{resume();}
    assert.deepEqual(await pending,{state:'unknown'});assert.equal(await stock(m),1);
  });
  test('PAR-04/REL-01: independently approved current-month level reduction invalidates an earlier L3 QR',async()=>{
    const m=await fixture(),q=await issue(m),previous=(await sql('SELECT id,revision,rules_version FROM trust.monthly_reward_snapshots WHERE subject_user_id=$1',[m.user])).rows[0];
    const changed=await f.snapshot(m.user,1000);
    const correction=await tx(client=>approveMonthlyRewardSnapshotCorrection(client,{actorId:f.reviewer(),subjectId:m.user,snapshotId:previous.id,assessmentId:changed.assessmentId,
      rulesVersion:previous.rules_version,expectedSnapshotRevision:previous.revision,reasonCode:'synthetic_independent_invalidation',evidenceReference:'synthetic evidence',idempotencyKey:uuidv7()}),'lythaus_admin');
    await tx(client=>applyMonthlyRewardSnapshotCorrection(client,{eventId:correction.sourceEventId,rulesVersion:previous.rules_version}),'lythaus_jobs');
    assert.deepEqual(await consume(m,{qrToken:q.token}),{state:'unknown'});assert.equal(await stock(m),1);
  });
  test('PAR-08/REL-02: expiration after QR authorization is rechecked before stock changes and expired issuance retries expose no token',async()=>{
    const m=await fixture(),key=uuidv7(),q=await issue(m,{rulesVersion:short,idempotencyKey:key});
    await assert.rejects(tx(client=>fulfilMonthlyReward({query:async(text,values)=>{
      if(text.startsWith('INSERT INTO trust.monthly_reward_fulfilments'))await delay(1200);return client.query(text,values);
    }},{partnerId:m.partner,operatorId:m.operator,variantId:m.variant.id,qrToken:q.token,idempotencyKey:uuidv7(),rulesVersion:short,keys})),/qr_unavailable/);
    assert.equal(await stock(m),1);assert.equal((await issue(m,{rulesVersion:short,idempotencyKey:key})).state,'expired');
    assert.deepEqual(await consume(m,{qrToken:q.token,rulesVersion:short}),{state:'unknown'});
  });
  test('PAR-08/REL-01: an inventory lock wait cannot extend QR validity or leave partial consumption',async()=>{
    const m=await fixture(),q=await issue(m,{rulesVersion:short});let reached,resume,pid;
    const barrier=new Promise(resolve=>{reached=resolve;}),released=new Promise(resolve=>{resume=resolve;});
    const held=tx(async client=>{await client.query('SELECT available_units FROM trust.monthly_reward_inventory WHERE offer_version_id=$1 FOR UPDATE',[m.variant.id]);reached();await released;},null);
    await barrier;
    const pending=tx(async client=>{
      pid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      return fulfilMonthlyReward(client,{partnerId:m.partner,operatorId:m.operator,variantId:m.variant.id,qrToken:q.token,idempotencyKey:uuidv7(),rulesVersion:short,keys});
    });
    const failed=assert.rejects(pending,/qr_unavailable/);
    try{
      const deadline=Date.now()+3000;let blocked=false;
      while(Date.now()<deadline){if(pid)blocked=(await sql('SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted) AS blocked',[pid])).rows[0].blocked;
        if(blocked)break;await delay(10);}
      assert.equal(blocked,true);await delay(1100);
    }finally{resume();await held;}
    await failed;assert.equal(await stock(m),1);
    assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_fulfilments WHERE subject_user_id=$1',[m.user])).rowCount,0);
    assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_fulfilment_commands WHERE partner_id=$1',[m.partner])).rowCount,0);
    assert.equal((await sql("SELECT 1 FROM system.outbox_events WHERE actor_id=$1 AND event_type='trust.monthly_reward_fulfilled'",[m.user])).rowCount,0);
  });
  test('REL-02: conflict-skipping direct runtime retries cannot decrement stock without inserting a fulfilment',async()=>{
    const m=await fixture({stock:3,limit:3}),q=await issue(m),fulfilled=await consume(m,{qrToken:q.token});
    const replay=await tx(client=>client.query(`INSERT INTO trust.monthly_reward_fulfilments
      (id,subject_user_id,partner_id,operator_id,binding_id,consent_id,family_id,offer_version_id,terms_version,snapshot_id,effective_month,
        effective_reward_level,qr_reservation_id,rules_version)
      SELECT $1,subject_user_id,partner_id,operator_id,binding_id,consent_id,family_id,offer_version_id,terms_version,snapshot_id,effective_month,
        effective_reward_level,qr_reservation_id,rules_version FROM trust.monthly_reward_fulfilments WHERE id=$2
      ON CONFLICT (qr_reservation_id) DO NOTHING RETURNING id`,[uuidv7(),fulfilled.id]));
    assert.equal(replay.rowCount,0);assert.equal(await stock(m),2);
    assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_fulfilments WHERE subject_user_id=$1',[m.user])).rowCount,1);
  });
  test('REL-02: interruption after stock decrement rolls back reservation consumption, invoice command and outbox atomically',async()=>{
    const m=await fixture(),q=await issue(m),key=uuidv7();
    await sql(`CREATE FUNCTION system.fail_claim_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.event_type='trust.monthly_reward_fulfilled' THEN RAISE EXCEPTION 'synthetic claim interruption';END IF;RETURN NEW;END $$;
      CREATE TRIGGER fail_claim_fixture BEFORE INSERT ON system.outbox_events FOR EACH ROW EXECUTE FUNCTION system.fail_claim_fixture()`);
    try{await assert.rejects(consume(m,{qrToken:q.token,idempotencyKey:key}),/claim interruption/);
      assert.equal(await stock(m),1);assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_fulfilments WHERE subject_user_id=$1',[m.user])).rowCount,0);
    }finally{await sql('DROP TRIGGER fail_claim_fixture ON system.outbox_events');await sql('DROP FUNCTION system.fail_claim_fixture()');}
    assert.equal((await consume(m,{qrToken:q.token,idempotencyKey:key})).created,true);assert.equal(await stock(m),0);
  });
  test('PAR-09/REL-03: genuine missing authority is pending; disabled providers and paused offers never fabricate successful fulfilment',async()=>{
    const unassessed=await fixture({noSnapshot:true});assert.equal((await issue(unassessed)).state,'pending');
    const proof=await invoice(unassessed);assert.equal((await consume(unassessed,{invoiceEvidenceId:proof})).state,'pending');
    const m=await fixture(),q=await issue(m);assert.equal((await consume(m,{qrToken:q.token,keys:undefined})).state,'pending');
    await sql("UPDATE trust.monthly_reward_offer_availability SET state='paused' WHERE offer_version_id=$1",[m.variant.id]);
    assert.deepEqual(await consume(m,{qrToken:q.token}),{state:'unknown'});assert.equal(await stock(m),1);
  });
  test('CAL-01/05/PAR-08: only the actual current UTC renewal month can create a new invoice fulfilment',async()=>{
    const m=await fixture({stock:3,limit:3}),now=new Date(),previous=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,15)),future=new Date(now.getTime()+86400000);
    const old=await invoice(m,{renewalAt:previous.toISOString()}),later=await invoice(m,{renewalAt:future.toISOString()});
    assert.deepEqual(await consume(m,{invoiceEvidenceId:old}),{state:'unknown'});
    assert.deepEqual(await consume(m,{invoiceEvidenceId:later}),{state:'unknown'});assert.equal(await stock(m),3);
    const current=await invoice(m);const fulfilled=await tx(async client=>{
      await client.query("SET LOCAL TIME ZONE 'Pacific/Kiritimati'");
      return fulfilMonthlyReward(client,{partnerId:m.partner,operatorId:m.operator,variantId:m.variant.id,invoiceEvidenceId:current,idempotencyKey:uuidv7(),rulesVersion:version,keys});
    });
    assert.equal(fulfilled.effectiveMonth,now.toISOString().slice(0,7));assert.equal(fulfilled.created,true);assert.equal(await stock(m),2);
  });
  test('SEC-01/PAR-08: runtime cannot fabricate provider invoices, update stock, forge claim authority or cross-source command receipts',async()=>{
    const m=await fixture({stock:3,limit:3}),q=await issue(m);
    await assert.rejects(tx(client=>client.query('UPDATE trust.monthly_reward_inventory SET available_units=100 WHERE offer_version_id=$1',[m.variant.id])),/permission denied/);
    await assert.rejects(tx(client=>client.query(`INSERT INTO trust.monthly_reward_invoice_evidence
      (id,subject_user_id,consent_id,offer_version_id,invoice_period_hmac,period_starts_at,period_ends_at,renewal_at,verification_reference,adapter_mode,rules_version)
      VALUES ($1,$2,$3,$4,$5,now(),now()+interval '1 month',now(),'forged','synthetic_fixture',$6)`,[uuidv7(),m.user,m.consent.id,m.variant.id,randomBytes(32),version])),/permission denied/);
    const other=await fixture();
    await assert.rejects(tx(client=>client.query(`INSERT INTO trust.monthly_reward_qr_reservations
      (id,subject_user_id,consent_id,offer_version_id,snapshot_id,token_hmac,token_ciphertext,encryption_key_version,rules_version,idempotency_key,request_digest,expires_at)
      SELECT $1,$2,consent_id,offer_version_id,snapshot_id,$3,token_ciphertext,encryption_key_version,rules_version,$4,request_digest,expires_at
      FROM trust.monthly_reward_qr_reservations WHERE id=$5`,[uuidv7(),other.user,randomBytes(32),uuidv7(),q.id])),/authority_unavailable/);
    const fulfilled=await consume(m,{qrToken:q.token});
    await assert.rejects(tx(client=>client.query(`INSERT INTO trust.monthly_reward_fulfilments
      (id,subject_user_id,partner_id,operator_id,binding_id,consent_id,family_id,offer_version_id,terms_version,snapshot_id,effective_month,effective_reward_level,qr_reservation_id,rules_version)
      SELECT $1,subject_user_id,partner_id,operator_id,binding_id,consent_id,family_id,offer_version_id,terms_version,snapshot_id,effective_month,5,qr_reservation_id,rules_version
      FROM trust.monthly_reward_fulfilments WHERE id=$2`,[uuidv7(),fulfilled.id])),/authority_unavailable/);
    await assert.rejects(tx(client=>client.query(`INSERT INTO trust.monthly_reward_fulfilment_commands
      (partner_id,operator_id,idempotency_key,qr_reservation_id,request_digest,fulfilment_id) VALUES ($1,$2,$3,$4,$5,$6)`,
      [other.partner,other.operator,uuidv7(),q.id,'a'.repeat(64),fulfilled.id])),/command_scope_invalid/);
    const unrelated=await fixture({partner:m.partner,variant:m.variant}),unrelatedQr=await issue(unrelated),key=uuidv7();
    const fingerprint=(await sql('SELECT encode(token_hmac,\'hex\') AS fingerprint FROM trust.monthly_reward_qr_reservations WHERE id=$1',[unrelatedQr.id])).rows[0].fingerprint;
    const matchingDigest=createHash('sha256').update(JSON.stringify([m.variant.id,fingerprint,version,m.user,m.consent.id,'qr'])).digest('hex');
    await assert.rejects(tx(client=>client.query(`INSERT INTO trust.monthly_reward_fulfilment_commands
      (partner_id,operator_id,idempotency_key,qr_reservation_id,request_digest,fulfilment_id) VALUES ($1,$2,$3,$4,$5,$6)`,
      [m.partner,m.operator,key,unrelatedQr.id,matchingDigest,fulfilled.id])),/command_source_invalid/);
    const recovered=await consume(unrelated,{qrToken:unrelatedQr.token,idempotencyKey:key});assert.equal(recovered.created,true);
    await assert.rejects(consume(m,{}),/source_invalid/);await assert.rejects(consume(m,{qrToken:q.token,invoiceEvidenceId:uuidv7()}),/source_invalid/);
    await assert.rejects(consume(m,{qrToken:'short'}),/source_invalid/);await assert.rejects(issue(m,{idempotencyKey:'invalid'}),/id_invalid/);
  });
  test('RPT-04/REL-02: deletion erases claim secrets, invoice proofs, command receipts and notices before consent/snapshots',async()=>{
    const m=await fixture({stock:2,limit:2}),q=await issue(m),proof=await invoice(m);await consume(m,{invoiceEvidenceId:proof});
    await sql("UPDATE system.feature_flags SET enabled=false WHERE flag_key='trust.monthly_reward_partners'");
    await sql("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1",[m.user]);
    for(const table of ['monthly_reward_qr_reservations','monthly_reward_invoice_evidence','monthly_reward_fulfilments'])assert.equal((await sql(`SELECT 1 FROM trust.${table} WHERE subject_user_id=$1`,[m.user])).rowCount,0);
    assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_fulfilment_commands WHERE partner_id=$1',[m.partner])).rowCount,0);
    assert.equal((await sql("SELECT 1 FROM system.outbox_events WHERE actor_id=$1 AND event_type='trust.monthly_reward_fulfilled'",[m.user])).rowCount,0);
    await sql("UPDATE system.feature_flags SET enabled=true WHERE flag_key='trust.monthly_reward_partners'");
    assert.deepEqual(await consume(m,{qrToken:q.token}),{state:'unknown'});
    await assert.rejects(invoice(m),/invoice_scope_invalid/);
  });
}
export async function cleanupRewardClaimCases({sql}){
  await sql('DROP TRIGGER IF EXISTS fail_claim_fixture ON system.outbox_events');await sql('DROP FUNCTION IF EXISTS system.fail_claim_fixture()');
  await sql('DROP TRIGGER monthly_reputation_reward_claim_subject_erasure ON identity.users');
  await sql(`DROP TABLE trust.monthly_reward_fulfilment_commands,trust.monthly_reward_fulfilments,trust.monthly_reward_qr_reservations,
    trust.monthly_reward_invoice_evidence,trust.monthly_reward_inventory,trust.monthly_reward_fulfilment_terms,trust.monthly_reward_claim_rule_sets`);
  await sql(`DROP FUNCTION trust.authorize_monthly_reward_claim(uuid,uuid,uuid,uuid,text),trust.require_monthly_reward_qr(),trust.require_monthly_reward_invoice_evidence(),
    trust.require_monthly_reward_fulfilment(),trust.commit_monthly_reward_stock(),trust.require_monthly_reward_fulfilment_command(),trust.erase_monthly_reward_claim_subject()`);
}
