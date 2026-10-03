import assert from 'node:assert/strict';
import { randomBytes,createHash } from 'node:crypto';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { uuidv7,encryptField,hmacLookup } from '@lythaus/security';
import { inviteMonthlyPartnerLink,consentToMonthlyPartnerLink,revokeMonthlyPartnerConsent,lookupMonthlyPartnerEligibility,
  MONTHLY_REWARD_PARTNER_FLAG as flag } from '../../../packages/db/src/monthly-reward-partner-links.ts';

const version='synthetic-partner-links-v1';
const keys={encryptionKey:randomBytes(32).toString('base64'),hmacKey:randomBytes(32).toString('base64'),keyVersion:'synthetic-partner-v1',syntheticFixture:true};
export function registerPartnerLinkCases(f){
  const {tx,sql,person,snapshot,select,offer,policy}=f;
  let operator,member,partner,variant,invitation,consent,otherPartner,otherOperator,otherVariant,consentKey;
  const address='synthetic-linked@example.invalid',customer='CaseSensitiveCustomerA';
  const invite=(patch={})=>tx(client=>inviteMonthlyPartnerLink(client,{partnerId:partner,operatorId:operator,variantId:variant.id,email:address,
    customerReference:customer,idempotencyKey:uuidv7(),rulesVersion:version,keys,...patch}));
  const accept=(patch={})=>tx(client=>consentToMonthlyPartnerLink(client,{subjectId:member,invitationToken:invitation.token,
    termsVersion:'synthetic-terms-v1',expectedRevision:0,idempotencyKey:uuidv7(),rulesVersion:version,keys,...patch}));
  const lookup=(patch={})=>tx(client=>lookupMonthlyPartnerEligibility(client,{partnerId:partner,operatorId:operator,variantId:variant.id,email:address,
    customerReference:customer,rulesVersion:version,keys,...patch}));
  const revoke=(patch={})=>tx(client=>revokeMonthlyPartnerConsent(client,{subjectId:member,consentId:consent.id,idempotencyKey:uuidv7(),...patch}));
  async function credential(userId,email,verifiedAt='2026-07-01T00:00:00.000123Z'){
    const encrypted=await encryptField(email,keys.encryptionKey,keys.keyVersion);
    await sql(`INSERT INTO identity.email_credentials
      (user_id,email_ciphertext,email_lookup_hmac,encryption_key_version,hmac_key_version,password_hash,verified_at)
      VALUES ($1,convert_to($2,'utf8'),decode($3,'base64'),$4,$4,'{}'::jsonb,$5)
      ON CONFLICT (user_id) DO UPDATE SET email_ciphertext=excluded.email_ciphertext,email_lookup_hmac=excluded.email_lookup_hmac,
        encryption_key_version=excluded.encryption_key_version,hmac_key_version=excluded.hmac_key_version,verified_at=excluded.verified_at`,
      [userId,encrypted.ciphertext,hmacLookup(email,keys.hmacKey),keys.keyVersion,verifiedAt]);
  }
  test('PAR-05/09/10: partner adapter is disabled without explicit synthetic fixture, keys and privacy-ready approval',async()=>{
    partner=uuidv7();operator=await person();member=await person('free',false);await credential(member,address);await snapshot(member);
    variant=await offer(3,{partner});await select(member,variant);
    assert.equal((await invite({rulesVersion:undefined})).state,'pending');assert.equal((await invite({keys:undefined})).state,'pending');
    assert.equal((await invite()).state,'pending');
    await sql('INSERT INTO system.feature_flags (flag_key,enabled,policy_version) VALUES ($1,true,$2)',[flag,policy]);
    for(const [rules,mode,privacy] of [[version,'synthetic_fixture','monthly-privacy-v1'],['synthetic-disabled','disabled','monthly-privacy-v1'],['synthetic-no-privacy','synthetic_fixture',null]])
      await sql(`INSERT INTO trust.monthly_reward_partner_rule_sets
        (version,policy_version,selection_rules_version,status,adapter_mode,invitation_seconds,lookup_per_minute,collection_privacy_version,approved_by,approved_at,approval_reference)
        VALUES ($1,$2,$3,'pending_owner_approval',$4,900,100,$5,$6,'2026-07-01','synthetic-only')`,[rules,policy,f.selectionRules,mode,privacy,f.reviewer()]);
    await sql("INSERT INTO trust.monthly_reward_partner_operators (partner_id,user_id,active,scopes) VALUES ($1,$2,true,ARRAY['link:invite','eligibility:read'])",[partner,operator]);
    assert.equal((await invite({rulesVersion:'synthetic-disabled'})).state,'pending');
    assert.equal((await invite({rulesVersion:'synthetic-no-privacy'})).state,'pending');
    assert.equal((await invite({keys:{...keys,syntheticFixture:false}})).state,'pending');
    await assert.rejects(invite({keys:{...keys,encryptionKey:'invalid'}}),/keys_unavailable/);
  });
  test('PAR-05/06: merchant invitation and private member consent yield only linked email, reward level and technical metadata',async()=>{
    const key=uuidv7();const [left,right]=await Promise.all([invite({idempotencyKey:key}),invite({idempotencyKey:key})]);
    invitation=left.created?left:right;assert.equal(Number(left.created)+Number(right.created),1);assert.equal(left.token,right.token);
    await assert.rejects(invite({idempotencyKey:key,email:'changed@example.invalid'}),/idempotency_reused/);
    const stored=(await sql('SELECT request_digest,token_ciphertext,token_hmac FROM trust.monthly_reward_link_invitations WHERE id=$1',[invitation.id])).rows[0];
    assert.notEqual(stored.request_digest,createHash('sha256').update(JSON.stringify([partner,variant.id,address,customer,version])).digest('hex'));
    assert.ok(!stored.token_ciphertext.toString('utf8').includes(invitation.token));assert.notEqual(stored.token_hmac.toString('utf8'),invitation.token);
    assert.deepEqual(await lookup(),{state:'unknown'});
    consentKey=uuidv7();const results=await Promise.all([accept({idempotencyKey:consentKey}),accept({idempotencyKey:consentKey})]);
    consent=results.find(item=>item.created);assert.equal(results.filter(item=>item.created).length,1);
    assert.equal(results[0].id,results[1].id);
    const result=await lookup();assert.equal(result.state,'eligible');assert.equal(result.linkedEmail,address);assert.equal(result.effectiveRewardLevel,3);
    assert.deepEqual(Object.keys(result).sort(),['effectiveMonth','effectiveRewardLevel','linkedEmail','offerVersionId','state']);
    assert.equal((await sql('SELECT to_char(verified_at AT TIME ZONE \'UTC\',\'YYYY-MM-DD"T"HH24:MI:SS.US"Z"\') AS verified FROM trust.monthly_reward_partner_consents WHERE id=$1',[consent.id])).rows[0].verified,'2026-07-01T00:00:00.000123Z');
  });
  test('PAR-05/07: other users, partners, customers, terms and differently cased opaque customer IDs cannot inherit a link',async()=>{
    const other=await person('free',false);await credential(other,'synthetic-other@example.invalid');
    await assert.rejects(accept({subjectId:other}),/invitation_unavailable/);
    await assert.rejects(accept({termsVersion:'wrong'}),/invitation_unavailable/);
    await assert.rejects(accept({invitationToken:invitation.token.toUpperCase()}),/invitation_unavailable/);
    assert.deepEqual(await lookup({email:'unknown@example.invalid'}),{state:'unknown'});
    assert.deepEqual(await lookup({customerReference:'different-customer'}),{state:'unknown'});
    assert.deepEqual(await lookup({customerReference:customer.toLowerCase()}),{state:'unknown'});
    await assert.rejects(lookup({email:'*@example.invalid'}),/address_invalid/);
    await assert.rejects(lookup({operatorId:other}),/operator_not_allowed/);
    otherPartner=uuidv7();otherOperator=await person();otherVariant=await offer(3,{partner:otherPartner});
    await sql("INSERT INTO trust.monthly_reward_partner_operators (partner_id,user_id,active,scopes) VALUES ($1,$2,true,ARRAY['link:invite','eligibility:read'])",[otherPartner,otherOperator]);
    assert.deepEqual(await lookup({partnerId:otherPartner,operatorId:otherOperator,variantId:otherVariant.id}),{state:'unknown'});
    await assert.rejects(invite({partnerId:otherPartner}),/operator_not_allowed/);
    await assert.rejects(invite({variantId:otherVariant.id}),/offer_unavailable/);
    await assert.rejects(accept({idempotencyKey:consentKey,expectedRevision:1}),/idempotency_reused/);
  });
  test('PAR-07/REL-01: canonical recovery remains invalid after actual account-event retention purge',async()=>{
    await sql("INSERT INTO identity.account_events (id,user_id,event_type,created_at) VALUES ($1,$2,'password_reset_completed','2020-01-01')",[uuidv7(),member]);
    assert.deepEqual(await lookup(),{state:'unknown'});
    assert.equal((await accept({idempotencyKey:consentKey})).state,'pending');
    const removed=await sql(`DELETE FROM identity.account_events account_event WHERE account_event.created_at < now()-$1::interval
      AND account_event.user_id=$2 AND NOT EXISTS (SELECT 1 FROM privacy.legal_holds hold WHERE hold.subject_id=account_event.user_id AND hold.active)
      RETURNING account_event.id`,['1 day',member]);assert.equal(removed.rowCount,1);
    assert.deepEqual(await lookup(),{state:'unknown'});
    const next=await invite();const renewed=await accept({invitationToken:next.token,expectedRevision:1});assert.equal(renewed.revision,2);
    assert.equal((await lookup()).state,'eligible');assert.equal((await accept({idempotencyKey:consentKey})).state,'superseded');consent=renewed;
  });
  test('PAR-07: a one-microsecond verification change invalidates old permission without an email-address change',async()=>{
    await sql("UPDATE identity.email_credentials SET verified_at='2026-07-01T00:00:00.000124Z' WHERE user_id=$1",[member]);
    assert.deepEqual(await lookup(),{state:'unknown'});
    const next=await invite();consent=await accept({invitationToken:next.token,expectedRevision:2});assert.equal((await lookup()).state,'eligible');
  });
  test('PAR-07/REL-01: consent withdrawal works while configuration is paused and encryption keys are absent',async()=>{
    await sql('UPDATE system.feature_flags SET enabled=false WHERE flag_key=$1',[flag]);
    assert.equal((await lookup()).state,'pending');
    const key=uuidv7();assert.equal((await revoke({idempotencyKey:key})).state,'revoked');assert.equal((await revoke({idempotencyKey:key})).created,false);
    await sql('UPDATE system.feature_flags SET enabled=true WHERE flag_key=$1',[flag]);assert.deepEqual(await lookup(),{state:'unknown'});
    await assert.rejects(revoke({subjectId:operator}),/consent_unavailable/);
    const next=await invite();const renewed=await accept({invitationToken:next.token,expectedRevision:3});
    await assert.rejects(revoke({consentId:renewed.id,idempotencyKey:key}),/idempotency_reused/);consent=renewed;
    assert.equal((await lookup()).state,'eligible');
  });
  test('PAR-07: email changes and recycled addresses require new consent and cannot inherit an existing customer binding',async()=>{
    await credential(member,'synthetic-new-email@example.invalid');assert.deepEqual(await lookup(),{state:'unknown'});
    const recycled=await person('free',false);await credential(recycled,address);await snapshot(recycled);await select(recycled,variant);
    const attempted=await invite();await assert.rejects(accept({subjectId:recycled,invitationToken:attempted.token,expectedRevision:4}),/invitation_unavailable/);
    const next=await invite({email:'synthetic-new-email@example.invalid'});consent=await accept({invitationToken:next.token,expectedRevision:4});
    assert.equal((await lookup({email:'synthetic-new-email@example.invalid'})).state,'eligible');
    assert.deepEqual(await lookup(),{state:'unknown'});
  });
  test('PAR-09/10: missing adapters, keys and paused offers return pending or unknown without zeroing authority or exposing a directory',async()=>{
    assert.equal((await lookup({keys:undefined})).state,'pending');assert.equal((await lookup({keys:{...keys,syntheticFixture:false}})).state,'pending');
    await sql("UPDATE trust.monthly_reward_offer_availability SET state='paused' WHERE offer_version_id=$1",[variant.id]);
    assert.deepEqual(await lookup({email:'synthetic-new-email@example.invalid'}),{state:'unknown'});
    await sql("UPDATE trust.monthly_reward_offer_availability SET state='active' WHERE offer_version_id=$1",[variant.id]);
    await sql('UPDATE trust.monthly_reward_partner_operators SET active=false WHERE partner_id=$1 AND user_id=$2',[partner,operator]);
    await assert.rejects(lookup(),/operator_not_allowed/);await assert.rejects(invite({idempotencyKey:uuidv7()}),/operator_not_allowed/);
    await sql('UPDATE trust.monthly_reward_partner_operators SET active=true WHERE partner_id=$1 AND user_id=$2',[partner,operator]);
  });
  test('PAR-05/REL-02: unknown and linked lookups share a bounded persisted partner/operator rate allowance',async()=>{
    await sql("UPDATE trust.monthly_reward_partner_rate_windows SET requests=100 WHERE partner_id=$1 AND operator_id=$2 AND starts_at=date_trunc('minute',clock_timestamp())",[partner,operator]);
    await assert.rejects(lookup({email:'unknown@example.invalid'}),/rate_limited/);
    await sql('DELETE FROM trust.monthly_reward_partner_rate_windows WHERE partner_id=$1 AND operator_id=$2',[partner,operator]);
    assert.equal((await lookup({email:'synthetic-new-email@example.invalid'})).state,'eligible');
  });
  test('REL-01/02: consent revoked between scoped candidate read and authorization cannot yield stale eligibility',async()=>{
    let reached,resume;const barrier=new Promise(resolve=>{reached=resolve;}),released=new Promise(resolve=>{resume=resolve;});
    const pending=tx(client=>lookupMonthlyPartnerEligibility({query:async(text,values)=>{
      if(text==='SELECT trust.lock_monthly_reward_link_members($1::uuid[])'){reached();await released;}
      return client.query(text,values);
    }},{partnerId:partner,operatorId:operator,variantId:variant.id,email:'synthetic-new-email@example.invalid',customerReference:customer,rulesVersion:version,keys}));
    await barrier;try{await revoke();}finally{resume();}
    assert.deepEqual(await pending,{state:'unknown'});
    const next=await invite({email:'synthetic-new-email@example.invalid'});consent=await accept({invitationToken:next.token,expectedRevision:5});
  });
  test('REL-02: interrupted consent insertion rolls back customer binding and retry records one scoped permission',async()=>{
    const user=await person('free',false),email='synthetic-interrupted@example.invalid';await credential(user,email);
    const next=await invite({email,customerReference:'InterruptedCustomer'}),key=uuidv7();
    await sql(`CREATE FUNCTION trust.fail_partner_consent_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'synthetic partner consent interrupted';END $$;
      CREATE TRIGGER fail_partner_consent_fixture BEFORE INSERT ON trust.monthly_reward_partner_consents FOR EACH ROW EXECUTE FUNCTION trust.fail_partner_consent_fixture()`);
    try{await assert.rejects(accept({subjectId:user,invitationToken:next.token,idempotencyKey:key}),/consent interrupted/);
      assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_customer_bindings WHERE subject_user_id=$1',[user])).rowCount,0);
    }finally{await sql('DROP TRIGGER fail_partner_consent_fixture ON trust.monthly_reward_partner_consents');await sql('DROP FUNCTION trust.fail_partner_consent_fixture()');}
    assert.equal((await accept({subjectId:user,invitationToken:next.token,idempotencyKey:key})).created,true);
    assert.equal((await accept({subjectId:user,invitationToken:next.token,idempotencyKey:key})).created,false);
    assert.equal((await lookup({email,customerReference:'InterruptedCustomer'})).state,'pending');
    await sql("UPDATE identity.users SET status='suspended' WHERE id=$1",[user]);
    assert.deepEqual(await lookup({email,customerReference:'InterruptedCustomer'}),{state:'unknown'});
  });
  test('PAR-07/REL-01: invalidated consent is unknown even without monthly authority, including revocation during the lock wait',async()=>{
    const user=await person('free',false),email='synthetic-pending-authority@example.invalid',customerReference='PendingAuthorityCustomer';
    await credential(user,email);
    const first=await invite({email,customerReference});
    await accept({subjectId:user,invitationToken:first.token});
    assert.equal((await lookup({email,customerReference})).state,'pending');
    await sql("INSERT INTO identity.account_events (id,user_id,event_type) VALUES ($1,$2,'password_reset_completed')",[uuidv7(),user]);
    assert.deepEqual(await lookup({email,customerReference}),{state:'unknown'});
    const next=await invite({email,customerReference});const renewed=await accept({subjectId:user,invitationToken:next.token,expectedRevision:1});
    let reached,resume;const barrier=new Promise(resolve=>{reached=resolve;}),released=new Promise(resolve=>{resume=resolve;});
    const pending=tx(client=>lookupMonthlyPartnerEligibility({query:async(text,values)=>{
      if(text==='SELECT trust.lock_monthly_reward_link_members($1::uuid[])'){reached();await released;}
      return client.query(text,values);
    }},{partnerId:partner,operatorId:operator,variantId:variant.id,email,customerReference,rulesVersion:version,keys}));
    await barrier;try{await revoke({subjectId:user,consentId:renewed.id});}finally{resume();}
    assert.deepEqual(await pending,{state:'unknown'});
    assert.deepEqual(await lookup({email,customerReference}),{state:'unknown'});
  });
  test('REL-01/02: lookup, renewed consent and queued deletion use member locks before identity and complete without a deadlock',async()=>{
    const user=await person('free',false),email='synthetic-staged@example.invalid';await credential(user,email);await snapshot(user);await select(user,variant);
    const first=await invite({email,customerReference:'StagedCustomer'});await accept({subjectId:user,invitationToken:first.token});
    const next=await invite({email,customerReference:'StagedCustomer'});
    let reached,resume,waiting,consentPid;
    const barrier=new Promise(resolve=>{reached=resolve;}),released=new Promise(resolve=>{resume=resolve;}),waitStarted=new Promise(resolve=>{waiting=resolve;});
    const pending=tx(client=>lookupMonthlyPartnerEligibility({query:async(text,values)=>{
      const result=await client.query(text,values);
      if(text==='SELECT trust.lock_monthly_reward_link_members($1::uuid[])'){reached();await released;}
      return result;
    }},{partnerId:partner,operatorId:operator,variantId:variant.id,email,customerReference:'StagedCustomer',rulesVersion:version,keys}));
    await barrier;
    const renewal=tx(async client=>{
      consentPid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      return consentToMonthlyPartnerLink({query:async(text,values)=>{
        if(text==='SELECT trust.lock_monthly_reward_link_members($1::uuid[])')waiting();return client.query(text,values);
      }},{subjectId:user,invitationToken:next.token,termsVersion:'synthetic-terms-v1',expectedRevision:1,idempotencyKey:uuidv7(),rulesVersion:version,keys});
    });
    const renewed=assert.rejects(renewal,/member_unavailable|invitation_unavailable/);
    await waitStarted;
    try{
      const deadline=Date.now()+3000;let blocked=false;
      while(Date.now()<deadline){blocked=(await sql('SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted) AS blocked',[consentPid])).rows[0].blocked;
        if(blocked)break;await delay(10);}
      assert.equal(blocked,true);
      await sql("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1",[user]);
    }finally{resume();}
    assert.deepEqual(await pending,{state:'unknown'});await renewed;
    assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_partner_consents WHERE subject_user_id=$1',[user])).rowCount,0);
  });
  test('REL-01/02: invitation expiration during a consent lock wait is rechecked at the final SQL insert',async()=>{
    const short='synthetic-short-link-invitation';
    await sql(`INSERT INTO trust.monthly_reward_partner_rule_sets
      (version,policy_version,selection_rules_version,status,adapter_mode,invitation_seconds,lookup_per_minute,collection_privacy_version,approved_by,approved_at,approval_reference)
      VALUES ($1,$2,$3,'pending_owner_approval','synthetic_fixture',2,100,'monthly-privacy-v1',$4,'2026-07-01','synthetic-only')`,[short,policy,f.selectionRules,f.reviewer()]);
    const user=await person('free',false),email='synthetic-expired@example.invalid';await credential(user,email);
    const next=await invite({email,customerReference:'ExpiredCustomer',rulesVersion:short});
    await assert.rejects(tx(client=>consentToMonthlyPartnerLink({query:async(text,values)=>{
      if(text.startsWith('INSERT INTO trust.monthly_reward_partner_consents'))await delay(2300);
      return client.query(text,values);
    }},{subjectId:user,invitationToken:next.token,termsVersion:'synthetic-terms-v1',expectedRevision:0,idempotencyKey:uuidv7(),rulesVersion:short,keys})),/invitation_unavailable/);
    assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_customer_bindings WHERE subject_user_id=$1',[user])).rowCount,0);
  });
  test('SEC-01/REL-02: direct runtime writes cannot change partner approvals, recovery generation or forged consent scope',async()=>{
    await assert.rejects(tx(client=>client.query('UPDATE trust.monthly_reward_partner_operators SET active=false WHERE partner_id=$1',[partner])),/permission denied/);
    await assert.rejects(tx(client=>client.query('UPDATE trust.monthly_reward_recovery_generations SET generation=0 WHERE subject_user_id=$1',[member])),/permission denied/);
    const before=(await sql('SELECT * FROM trust.monthly_reward_partner_consents WHERE id=$1',[consent.id])).rows[0];
    const next=await invite({email:'synthetic-new-email@example.invalid'});
    await assert.rejects(tx(client=>client.query(`INSERT INTO trust.monthly_reward_partner_consents
      (id,binding_id,subject_user_id,revision,supersedes_id,invitation_id,offer_version_id,terms_version,email_partner_hmac,
        email_binding_digest,verified_at,recovery_generation,rules_version,idempotency_key,request_digest)
      SELECT $1,binding_id,subject_user_id,revision+1,id,$2,offer_version_id,terms_version,email_partner_hmac,
        email_binding_digest,verified_at,0,rules_version,$3,request_digest FROM trust.monthly_reward_partner_consents WHERE id=$4`,
      [uuidv7(),next.id,uuidv7(),consent.id])),/scope_invalid/);
    await assert.rejects(tx(client=>client.query(`INSERT INTO trust.monthly_reward_consent_revocations (consent_id,subject_user_id,idempotency_key)
      VALUES ($1,$2,$3)`,[consent.id,operator,uuidv7()])),/consent_unavailable/);
    assert.equal((await sql('SELECT revision FROM trust.monthly_reward_partner_consents WHERE id=$1',[consent.id])).rows[0].revision,before.revision);
  });
  test('SEC-01/PAR-05: direct binding and consent inserts cannot copy a valid invitation to a different canonical email',async()=>{
    const other=await person('free',false),email='synthetic-forged-recipient@example.invalid';await credential(other,email);
    const next=await invite({email:'synthetic-new-email@example.invalid',customerReference:'UnreservedCustomer'});
    await assert.rejects(tx(client=>client.query(`INSERT INTO trust.monthly_reward_customer_bindings
      (id,subject_user_id,partner_id,family_id,invitation_id,customer_partner_hmac)
      SELECT $1,$2,invitation.partner_id,offer.family_id,invitation.id,invitation.customer_partner_hmac
      FROM trust.monthly_reward_link_invitations invitation JOIN trust.monthly_reward_offer_versions offer ON offer.id=invitation.offer_version_id
      WHERE invitation.id=$3`,[uuidv7(),other,next.id])),/binding_scope_invalid/);
    assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_customer_bindings WHERE invitation_id=$1',[next.id])).rowCount,0);
    assert.equal((await accept({invitationToken:next.token,expectedRevision:0})).state,'linked');
    const wrong=await invite({email});
    await assert.rejects(tx(client=>client.query(`INSERT INTO trust.monthly_reward_partner_consents
      (id,binding_id,subject_user_id,revision,supersedes_id,invitation_id,offer_version_id,terms_version,email_partner_hmac,
        email_binding_digest,verified_at,recovery_generation,rules_version,idempotency_key,request_digest)
      SELECT $1,previous.binding_id,previous.subject_user_id,previous.revision+1,previous.id,invitation.id,
        invitation.offer_version_id,previous.terms_version,invitation.email_partner_hmac,who.binding_digest,
        who.verified_at_text::timestamptz,who.recovery_generation,previous.rules_version,$2,previous.request_digest
      FROM trust.monthly_reward_partner_consents previous JOIN trust.monthly_reward_link_invitations invitation ON invitation.id=$3
      CROSS JOIN trust.lock_monthly_reward_link_identity(previous.subject_user_id) who WHERE previous.id=$4`,
      [uuidv7(),uuidv7(),wrong.id,consent.id])),/consent_scope_invalid/);
  });
  test('RPT-04/PAR-07: erasure removes unused invitations for the canonical recipient without deleting another recipient',async()=>{
    const user=await person('free',false),email='synthetic-unused-invite@example.invalid';await credential(user,email);
    const unused=await invite({email,customerReference:'UnusedCustomer'});
    const independent=await invite({email:'synthetic-independent@example.invalid',customerReference:'IndependentCustomer'});
    await sql("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1",[user]);
    assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_link_invitations WHERE id=$1',[unused.id])).rowCount,0);
    assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_link_invitations WHERE id=$1',[independent.id])).rowCount,1);
    await assert.rejects(accept({subjectId:user,invitationToken:unused.token}),/invitation_unavailable/);
  });
  test('RPT-04/REL-02: subject erasure removes consent, revocations, binding, recovery generation and consumed invitation secrets',async()=>{
    const used=(await sql('SELECT invitation_id FROM trust.monthly_reward_partner_consents WHERE subject_user_id=$1',[member])).rows.map(row=>row.invitation_id);
    await sql("UPDATE identity.users SET status='deleted',deleted_at=now() WHERE id=$1",[member]);
    for(const table of ['monthly_reward_partner_consents','monthly_reward_consent_revocations','monthly_reward_customer_bindings','monthly_reward_recovery_generations'])
      assert.equal((await sql(`SELECT 1 FROM trust.${table} WHERE subject_user_id=$1`,[member])).rowCount,0);
    assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_link_invitations WHERE id=ANY($1::uuid[])',[used])).rowCount,0);
    assert.deepEqual(await lookup({email:'synthetic-new-email@example.invalid'}),{state:'unknown'});
    await sql("INSERT INTO identity.account_events (id,user_id,event_type) VALUES ($1,$2,'password_reset_completed')",[uuidv7(),member]);
    assert.equal((await sql('SELECT 1 FROM trust.monthly_reward_recovery_generations WHERE subject_user_id=$1',[member])).rowCount,0);
    await sql('DELETE FROM identity.account_events WHERE user_id=$1',[member]);
  });
  return {keys,partnerRules:version};
}

export async function cleanupPartnerLinkCases({sql}){
  await sql('DROP TRIGGER IF EXISTS fail_partner_consent_fixture ON trust.monthly_reward_partner_consents');await sql('DROP FUNCTION IF EXISTS trust.fail_partner_consent_fixture()');
  await sql('DROP TRIGGER monthly_reputation_reward_partner_subject_erasure ON identity.users');
  await sql('DROP TRIGGER monthly_reward_partner_flag_preserved ON system.feature_flags');
  await sql('DROP TRIGGER monthly_reward_recovery_capture ON identity.account_events');
  await sql(`DROP TABLE trust.monthly_reward_consent_revocations,trust.monthly_reward_partner_consents,
    trust.monthly_reward_customer_bindings,trust.monthly_reward_link_invitations,trust.monthly_reward_partner_operators,
    trust.monthly_reward_partner_rate_windows,trust.monthly_reward_recovery_generations,trust.monthly_reward_partner_rule_sets`);
  await sql(`DROP FUNCTION trust.lock_monthly_reward_partner_operator(uuid,uuid,text),trust.check_monthly_reward_partner_operator(uuid,uuid,text),
    trust.lock_monthly_reward_partner_configuration(),trust.lock_monthly_reward_link_members(uuid[]),trust.lock_monthly_reward_link_identity(uuid),
    trust.require_monthly_reward_link_invitation(),trust.require_monthly_reward_customer_binding(),trust.require_monthly_reward_partner_consent(),trust.require_monthly_reward_consent_revocation(),
    trust.erase_monthly_reward_partner_subject(),trust.preserve_monthly_reward_partner_flag(),trust.capture_monthly_reward_recovery()`);
  await sql('DELETE FROM system.feature_flags WHERE flag_key=$1',[flag]);
}
