import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixtures } from './fixtures.mjs';
import { scriptedResponse } from './harness.ts';
import { collectApprovedTextProbe, simulateTextProbe, assertTrustedCollectedReceipt, PROBE_SELECTION_HASH } from './collector.ts';
import { createLocalReceiptLedger } from './local-ledger.mjs';

const selected = () => structuredClone(fixtures.slice(0,20));
const gate = () => ({ reviewedSourceSha:'a'.repeat(40), observedSourceSha:'a'.repeat(40),
  reviewedCollectorHash:'b'.repeat(64), observedCollectorHash:'b'.repeat(64),
  existingCredentialAuthorityVerified:true, existingProviderScopeVerified:true,
  includedExecutionAndStorageVerified:true, providerPriceVerifiedUsd:0, maxIncrementalTotalUsd:0,
  existingExecutionResource:'synthetic-local-fixture', evidenceReference:'synthetic-test-attestation',
  bindingName:'OPENAI_API_KEY', provider:'openai', model:'omni-moderation-latest',
  endpoint:'https://api.openai.com/v1/moderations', privateDataExcluded:true, retentionDays:7, retentionResolved:true });
const make = async overrides => ({ fixtures:selected(), apiKey:'synthetic-fixture-only', gate:gate(),
  ledger:createLocalReceiptLedger(await mkdtemp(join(tmpdir(),'lythaus-collector-'))), ...overrides });

test('twenty synthetic receipts derive adapter feedback with no ambient network or live evidence claims', async () => {
  const ambient=mock.method(globalThis,'fetch',()=>{throw Error('OUTBOUND_DENIED');});let calls=0;
  try {
    const options=await make({fetchImpl:async(url,init)=>{
      assert.equal(url,'https://api.openai.com/v1/moderations');assert.equal(init.redirect,'manual');
      assert.equal(init.method,'POST');assert.equal(init.headers.authorization,'Bearer synthetic-fixture-only');
      const body=JSON.parse(init.body);assert.deepEqual(Object.keys(body),['model','input']);
      assert.equal(body.input,fixtures[calls++].body);return scriptedResponse({response:'ok'});
    }});
    const report=await simulateTextProbe(options);
    assert.equal(calls,20);assert.equal(ambient.mock.callCount(),0);assert.equal(report.actualProviderRequests,0);
    assert.equal(report.completion,'COMPLETED_UNQUALIFIED_FEEDBACK_COLLECTION');
    assert.equal(report.evidenceClass,'SYNTHETIC_TRANSPORT_TEST_ONLY');
    for(const row of report.receipts){
      assertTrustedCollectedReceipt(row);assert.equal(row.schemaValid,true);
      assert.equal(Object.keys(row.categoryFlags).length,13);assert.match(row.responseHash,/^[a-f0-9]{64}$/);
      assert.equal(row.authorship.band,'ABSTAIN');assert.equal(row.authority.publicationEligible,false);
      assert.equal(row.latencySource,'SYNTHETIC_TEST_CLOCK');assert.throws(()=>{row.flagged=true;},TypeError);
      await assert.rejects(options.ledger.persistReceipt(structuredClone(row)),/untrusted_receipt/);
    }
    const text=JSON.stringify(report);assert.equal(text.includes('synthetic-fixture-only'),false);
    assert.equal(text.includes(fixtures[0].body),false);assert.equal(report.thresholds,'UNEVALUATED');
  }finally{ambient.mock.restore();}
});

test('live preflight rejects unresolved source/authority/cost/data/retention/ledger before any request',async()=>{
  const ambient=mock.method(globalThis,'fetch',()=>{throw Error('OUTBOUND_DENIED');});
  try{
    for(const fields of [{existingCredentialAuthorityVerified:false},{existingProviderScopeVerified:false},
      {includedExecutionAndStorageVerified:false},{providerPriceVerifiedUsd:1},{maxIncrementalTotalUsd:1},
      {observedSourceSha:'c'.repeat(40)},{observedCollectorHash:'c'.repeat(64)},
      {privateDataExcluded:false},{retentionResolved:false},{retentionDays:8},{endpoint:'https://other.invalid'},
      {model:'other'},{bindingName:'NEW_KEY'}]){
      const options=await make();Object.assign(options.gate,fields);
      await assert.rejects(collectApprovedTextProbe(options),/collection_/);
    }
    const missing=await make({apiKey:''});await assert.rejects(collectApprovedTextProbe(missing),/authority_unverified/);
    const ephemeral=await make();ephemeral.ledger.durability='SYNTHETIC_IN_MEMORY';
    await assert.rejects(collectApprovedTextProbe(ephemeral),/durable_ledger_required/);
    assert.equal(ambient.mock.callCount(),0);
  }finally{ambient.mock.restore();}
});

test('changed/private/reordered/incomplete selection cannot transmit; input snapshot resists caller races',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;return scriptedResponse({response:'ok'});};
  for(const mutate of [rows=>rows.pop(),rows=>rows.reverse(),rows=>{rows[0].body='PRIVATE_MUST_NOT_SEND';},rows=>{rows[0].revision++;}]){
    const options=await make({fetchImpl});mutate(options.fixtures);
    await assert.rejects(simulateTextProbe(options),/wrong_sample_count|wrong_selection/);
  }
  assert.equal(calls,0);
  const options=await make({fetchImpl:async(url,init)=>{assert.notEqual(JSON.parse(init.body).input,'MUTATED');return scriptedResponse({response:'ok'});}});
  const claim=options.ledger.claimProbe.bind(options.ledger);
  options.ledger.claimProbe=async binding=>{options.fixtures[0].body='MUTATED';return claim(binding);};
  assert.equal((await simulateTextProbe(options)).attemptedRequests,20);
});

test('401/403/rate/outage/redirect/schema/drift/contradiction stop after one attempt without retry',async()=>{
  for(const response of ['http_429','http_503','redirect','malformed','model_drift','contradictory','missing_categories','nullable',401,403]){
    let calls=0;const report=await simulateTextProbe(await make({fetchImpl:async()=>{calls++;return typeof response==='number'
      ?Response.json({error:{message:'RAW_DIAGNOSTIC'}},{status:response}):scriptedResponse({response});}}));
    assert.equal(calls,1);assert.equal(report.attemptedRequests,1);
    assert.equal(report.completion,'STOPPED_FAILURE_OR_INVALID_EVIDENCE');assert.equal(report.receipts[0].safetyBand,'ABSTAIN');
    assert.equal(JSON.stringify(report).includes('RAW_DIAGNOSTIC'),false);
    if(response==='model_drift'){
      assert.equal(report.receipts[0].adapterAccepted,false);
      assert.equal(report.receipts[0].responseModel,'omni-moderation-unexpected-version');
      assert.equal(report.receipts[0].rawFeedback.categoryScores.harassment,0.02);
      assert.equal(report.receipts[0].rawFeedback.flagged,false);
    }
  }
});

test('live entry forbids synthetic overrides; raw feedback discards arbitrary fields and modality strings',async()=>{
  const options=await make({fetchImpl:async()=>scriptedResponse({response:'ok'})});
  assert.throws(()=>collectApprovedTextProbe(options),/live_override_forbidden/);
  const report=await simulateTextProbe(await make({fetchImpl:async()=>{
    const body=await scriptedResponse({response:'model_drift'}).json();
    body.rawSecret='RAW_MUST_NOT_PERSIST';
    body.results[0].category_applied_input_types.harassment=['text','RAW_MUST_NOT_PERSIST'];
    return Response.json(body);
  }}));
  assert.equal(report.receipts[0].schemaValid,false);
  assert.deepEqual(report.receipts[0].rawFeedback.appliedInputTypes.harassment,['text']);
  assert.equal(JSON.stringify(report).includes('RAW_MUST_NOT_PERSIST'),false);
});

test('lost/timeout/oversized responses remain uncertain without retry',async()=>{
  for(const fetchImpl of [async()=>{throw Error('RAW_NETWORK');},async()=>new Promise(()=>{}),
    async()=>new Response('x'.repeat(262145)),async()=>new Response('small',{headers:{'content-length':'262145'}})]){
    const report=await simulateTextProbe(await make({fetchImpl,requestTimeoutMs:10}));
    assert.equal(report.attemptedRequests,1);assert.equal(report.receipts[0].delivery,'UNKNOWN_NO_RETRY');
    assert.equal(report.receipts[0].responseHash,null);assert.equal(report.receipts[0].schemaValid,false);
    assert.equal(JSON.stringify(report).includes('RAW_NETWORK'),false);
  }
});

test('abort before start makes zero calls; interrupted delivery records uncertainty and stops',async()=>{
  let calls=0;const before=new AbortController();before.abort();
  await assert.rejects(simulateTextProbe(await make({signal:before.signal,fetchImpl:async()=>{calls++;throw Error();}})),/interrupted/);
  assert.equal(calls,0);const during=new AbortController();
  const report=await simulateTextProbe(await make({signal:during.signal,fetchImpl:async()=>{calls++;during.abort();return new Promise(()=>{});}}));
  assert.equal(calls,1);assert.equal(report.receipts.length,1);assert.equal(report.receipts[0].delivery,'UNKNOWN_NO_RETRY');
});

test('durable claims reject concurrent/restarted/replayed probes and persist private-mode receipts',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lythaus-collector-ledger-'));let calls=0;
  const fetchImpl=async()=>{calls++;return scriptedResponse({response:'ok'});};
  const results=await Promise.allSettled([simulateTextProbe(await make({ledger:createLocalReceiptLedger(root),fetchImpl})),
    simulateTextProbe(await make({ledger:createLocalReceiptLedger(root),fetchImpl}))]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(calls,20);
  await assert.rejects(simulateTextProbe(await make({ledger:createLocalReceiptLedger(root),fetchImpl})),/already_claimed/);
  const dir=join(root,PROBE_SELECTION_HASH);const paths=await readdir(dir);
  assert.equal(paths.filter(p=>p.endsWith('.receipt.json')).length,20);
  for(const p of paths){assert.equal((await stat(join(dir,p))).mode&0o777,0o600);
    assert.equal((await readFile(join(dir,p),'utf8')).includes('synthetic-fixture-only'),false);}
});

test('uncertain prior attempt or receipt commit failure cannot resume collection automatically',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lythaus-collector-stop-'));let calls=0;
  const report=await simulateTextProbe(await make({ledger:createLocalReceiptLedger(root),fetchImpl:async()=>{calls++;throw Error();}}));
  assert.equal(report.attemptedRequests,1);
  await assert.rejects(simulateTextProbe(await make({ledger:createLocalReceiptLedger(root),fetchImpl:async()=>{calls++;throw Error();}})),/already_claimed/);
  assert.equal(calls,1);const failed=await make({fetchImpl:async()=>scriptedResponse({response:'ok'})});
  failed.ledger.persistReceipt=async()=>{throw Error('local_commit_failed');};
  await assert.rejects(simulateTextProbe(failed),/local_commit_failed/);
});

test('elapsed window or non-monotonic clock stops without a request',async()=>{
  for(const clock of [[0,600001],[10,9]]){
    let calls=0;const report=await simulateTextProbe(await make({now:()=>clock.shift()??600002,fetchImpl:async()=>{calls++;throw Error();}}));
    assert.equal(calls,0);assert.equal(report.completion,'STOPPED_INTERRUPTED_OR_WINDOW_EXPIRED');
  }
});
