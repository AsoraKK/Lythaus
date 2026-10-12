import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import pg from 'pg';
import { fixtures } from './fixtures.mjs';
import { CATEGORIES, hash } from './harness.ts';
import { createDatabaseReceiptLedger } from './database-ledger-proposal.ts';
import { simulateTextProbe, PROBE_SELECTION_HASH } from './collector.ts';
import { OPENAI_MODERATION_MODEL } from '../../src/research-config.ts';

const { Client } = pg;
const proposalUrl = new URL('../../../../database/planetscale/proposals/posting_feedback_ledger.sql.proposal', import.meta.url);
const runWithPostgres = process.env.RUN_POSTING_FEEDBACK_PG_TESTS === '1';
const postgresTest = runWithPostgres ? test : test.skip;

function docker(args) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function freeLocalPort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function connectToTemporaryPostgres(port) {
  const deadline = Date.now() + 20_000;
  let lastError;
  while (Date.now() < deadline) {
    const client = new Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres', connectionTimeoutMillis: 500 });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {});
      await delay(100);
    }
  }
  throw lastError ?? new Error('temporary_postgres_unavailable');
}

function runBinding(sourceSha, collectorHash) {
  return { selectionHash: PROBE_SELECTION_HASH, sourceSha, collectorHash };
}

function gate(sourceSha, collectorHash) {
  return {
    reviewedSourceSha: sourceSha, observedSourceSha: sourceSha,
    reviewedCollectorHash: collectorHash, observedCollectorHash: collectorHash,
    existingCredentialAuthorityVerified: true, existingProviderScopeVerified: true,
    includedExecutionAndStorageVerified: true, providerPriceVerifiedUsd: 0, maxIncrementalTotalUsd: 0,
    existingExecutionResource: 'synthetic-postgres-17-test', evidenceReference: 'synthetic-test-only',
    bindingName: 'OPENAI_API_KEY', provider: 'openai', model: OPENAI_MODERATION_MODEL,
    endpoint: 'https://api.openai.com/v1/moderations', privateDataExcluded: true,
    retentionDays: 7, retentionResolved: true,
  };
}

function autocommitClient(client, { afterQuery } = {}) {
  let ambientTransaction = false;
  return {
    async assertAutocommit() {
      if (ambientTransaction) throw new Error('database_ledger_ambient_transaction_forbidden');
    },
    async query(sql, values) {
      const result = await client.query(sql, values);
      await afterQuery?.(sql, result);
      return result;
    },
    setAmbientTransaction(value) { ambientTransaction = value; },
  };
}

function proposalGrantStatements(proposal) {
  const first = proposal.indexOf('-- GRANT USAGE ON SCHEMA evaluation TO __APPROVED_EVALUATION_WRITER_ROLE__;');
  const last = proposal.indexOf('-- Do not grant DELETE on run or attempt claims', first);
  assert.ok(first >= 0 && last > first);
  return proposal.slice(first, last).split('\n')
    .filter((line) => /^-- (?:GRANT |  )/.test(line))
    .map((line) => line.slice(3)).join('\n')
    .split(';').map((statement) => statement.trim()).filter(Boolean);
}

function successBody(model = OPENAI_MODERATION_MODEL, flagged = false) {
  const categories = Object.fromEntries(CATEGORIES.map((category) => [category, false]));
  const categoryScores = Object.fromEntries(CATEGORIES.map((category) => [category, 0.02]));
  const applied = Object.fromEntries(CATEGORIES.map((category) => [category, ['text']]));
  categories.harassment = flagged;
  categoryScores.harassment = 0.85;
  return Response.json({ model, results: [{ flagged, categories, category_scores: categoryScores, category_applied_input_types: applied }] });
}

test('SQL ledger stays disabled and outside the canonical migration set', async () => {
  const source = await readFile(proposalUrl, 'utf8');
  assert.match(source, /^\/\*[\s\S]*\*\/\s*$/);
  assert.match(source, /DISABLED PROPOSAL ONLY — DO NOT EXECUTE OR APPLY/);
  assert.match(source, /__APPROVED_EVALUATION_WRITER_ROLE__/);
  assert.match(source, /__APPROVED_RETENTION_ROLE__/);
  assert.equal(proposalUrl.pathname.includes('/database/planetscale/migrations/'), false);
  assert.match(source, /DELETE FROM evaluation\.posting_feedback_results/);
  assert.match(source, /attempt claim tombstones must remain/);
  assert.match(source, /GRANT USAGE ON SCHEMA evaluation TO __APPROVED_RETENTION_ROLE__/);
  assert.match(source, /GRANT USAGE ON SCHEMA evaluation TO __APPROVED_EVALUATION_READER_ROLE__/);
});

test('adapter requires an autocommit acknowledgement contract', () => {
  assert.throws(() => createDatabaseReceiptLedger({ query: async () => ({ rows: [] }) }), /autocommit_client_required/);
});

postgresTest('PostgreSQL ledger claims once, stores only allowlisted outcomes, and retains tombstones after result expiry', async () => {
  const containerName = `lythaus-ledger-pg17-${process.pid}-${Date.now().toString(36)}`;
  const port = await freeLocalPort();
  docker(['run', '--detach', '--rm', '--name', containerName,
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--publish', `127.0.0.1:${port}:5432`, 'postgres:17']);

  let client;
  let clientA;
  let clientB;
  try {
    client = await connectToTemporaryPostgres(port);
    const { rows: versionRows } = await client.query('SHOW server_version_num');
    assert.ok(Number(versionRows[0].server_version_num) >= 170000 && Number(versionRows[0].server_version_num) < 180000);

    const proposal = await readFile(proposalUrl, 'utf8');
    const sqlStart = proposal.indexOf('\nCREATE SCHEMA IF NOT EXISTS evaluation;');
    const sqlEnd = proposal.lastIndexOf('\n*/');
    assert.ok(sqlStart > 0 && sqlEnd > sqlStart);
    await client.query(proposal.slice(sqlStart + 1, sqlEnd));
    const { rows: manifestRows } = await client.query('SELECT count(*)::integer AS sample_count FROM evaluation.posting_feedback_probe_samples');
    assert.equal(manifestRows[0].sample_count, 20);

    await client.query(`CREATE ROLE posting_feedback_writer_test;
                       CREATE ROLE posting_feedback_reader_test;
                       CREATE ROLE posting_feedback_retention_test`);
    const roleGrants = proposalGrantStatements(proposal);
    assert.ok(roleGrants.length >= 12);
    assert.ok(roleGrants.every((statement) => /^GRANT\s/i.test(statement)));
    for (const grant of roleGrants) {
      await client.query(grant
        .replaceAll('__APPROVED_EVALUATION_WRITER_ROLE__', 'posting_feedback_writer_test')
        .replaceAll('__APPROVED_EVALUATION_READER_ROLE__', 'posting_feedback_reader_test')
        .replaceAll('__APPROVED_RETENTION_ROLE__', 'posting_feedback_retention_test'));
    }

    const ambientDb = autocommitClient(client);
    await client.query('BEGIN');
    ambientDb.setAmbientTransaction(true);
    await assert.rejects(createDatabaseReceiptLedger(ambientDb).claimProbe(runBinding('d'.repeat(40), 'e'.repeat(64))), /ambient_transaction_forbidden/);
    await client.query('ROLLBACK');
    ambientDb.setAmbientTransaction(false);
    const { rows: ambientRows } = await client.query("SELECT count(*)::integer AS count FROM evaluation.posting_feedback_probe_runs WHERE source_sha = $1", ['d'.repeat(40)]);
    assert.equal(ambientRows[0].count, 0);

    const concurrentBinding = runBinding('1'.repeat(40), '2'.repeat(64));
    clientA = await connectToTemporaryPostgres(port);
    clientB = await connectToTemporaryPostgres(port);
    await client.query(`CREATE FUNCTION evaluation.test_delay_claim_insert() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.15); RETURN NEW; END $$;
      CREATE TRIGGER test_delay_run_claim BEFORE INSERT ON evaluation.posting_feedback_probe_runs
        FOR EACH ROW EXECUTE FUNCTION evaluation.test_delay_claim_insert();
      CREATE TRIGGER test_delay_attempt_claim BEFORE INSERT ON evaluation.posting_feedback_attempt_claims
        FOR EACH ROW EXECUTE FUNCTION evaluation.test_delay_claim_insert()`);
    const concurrentA = createDatabaseReceiptLedger(autocommitClient(clientA));
    const concurrentB = createDatabaseReceiptLedger(autocommitClient(clientB));
    const runClaims = await Promise.all([concurrentA.claimProbe(concurrentBinding), concurrentB.claimProbe(concurrentBinding)]);
    assert.deepEqual([...runClaims].sort(), [false, true]);
    const winner = runClaims[0] ? concurrentA : concurrentB;
    const firstFixture = fixtures[0];
    const firstAttempt = { sampleId: firstFixture.id, inputHash: await hash(firstFixture.body), revision: firstFixture.revision };
    assert.equal(await winner.claimAttempt(firstAttempt), true);
    await client.query(`DROP TRIGGER test_delay_run_claim ON evaluation.posting_feedback_probe_runs;
                       DROP TRIGGER test_delay_attempt_claim ON evaluation.posting_feedback_attempt_claims;
                       DROP FUNCTION evaluation.test_delay_claim_insert()`);

    let nextConnection = 0;
    const splitConnection = {
      async assertAutocommit() {},
      query(sql, values) {
        const selected = nextConnection++ % 2 === 0 ? clientA : clientB;
        return selected.query(sql, values);
      },
    };
    const attemptBinding = runBinding('9'.repeat(40), 'a'.repeat(64));
    const attemptRace = createDatabaseReceiptLedger(splitConnection);
    assert.equal(await attemptRace.claimProbe(attemptBinding), true);
    const attemptClaims = await Promise.all([
      attemptRace.claimAttempt(firstAttempt), attemptRace.claimAttempt(firstAttempt),
    ]);
    assert.deepEqual([...attemptClaims].sort(), [false, true]);
    assert.equal(await createDatabaseReceiptLedger(autocommitClient(client)).claimProbe(concurrentBinding), false);
    const { rows: interruptedClaim } = await client.query(`
      SELECT state, receipt_committed_at FROM evaluation.posting_feedback_attempt_claims
       WHERE run_fingerprint = (SELECT run_fingerprint FROM evaluation.posting_feedback_probe_runs WHERE source_sha = $1)
         AND sample_id = $2`, [concurrentBinding.sourceSha, firstFixture.id]);
    assert.equal(interruptedClaim[0].state, 'STARTED_NO_REPLAY');
    assert.equal(interruptedClaim[0].receipt_committed_at, null);
    await assert.rejects(winner.claimAttempt({ ...firstAttempt, revision: firstAttempt.revision + 1 }), /replay|claimed|stale/i);
    const { rows: concurrentRunRows } = await client.query(
      'SELECT run_fingerprint FROM evaluation.posting_feedback_probe_runs WHERE source_sha = $1', [concurrentBinding.sourceSha]);
    await assert.rejects(client.query(`INSERT INTO evaluation.posting_feedback_attempt_claims
      (run_fingerprint, sample_id, input_hash, revision) VALUES ($1, $2, $3, 1)`,
    [concurrentRunRows[0].run_fingerprint, '019a0000-0000-7000-8000-000000000021', '0'.repeat(64)]), { code: '23503' });

    const successBinding = runBinding('3'.repeat(40), '4'.repeat(64));
    const successLedger = createDatabaseReceiptLedger(autocommitClient(client));
    let providerTransportCalls = 0;
    const syntheticReport = await simulateTextProbe({
      fixtures: structuredClone(fixtures.slice(0, 20)),
      ledger: successLedger,
      gate: gate(successBinding.sourceSha, successBinding.collectorHash),
      apiKey: 'synthetic-test-only',
      fetchImpl: async () => { providerTransportCalls += 1; return successBody(); },
    });
    assert.equal(providerTransportCalls, 20);
    assert.equal(syntheticReport.actualProviderRequests, 0);
    assert.equal(syntheticReport.receipts.length, 20);
    assert.equal(syntheticReport.thresholds, 'UNEVALUATED');
    assert.equal(syntheticReport.publicPosting, 'WITHHELD');

    const { rows: totals } = await client.query(`
      SELECT (SELECT count(*)::integer FROM evaluation.posting_feedback_attempt_claims
               WHERE run_fingerprint = (SELECT run_fingerprint FROM evaluation.posting_feedback_probe_runs WHERE source_sha = $1)) AS claims,
             (SELECT count(*)::integer FROM evaluation.posting_feedback_results
               WHERE run_fingerprint = (SELECT run_fingerprint FROM evaluation.posting_feedback_probe_runs WHERE source_sha = $1)) AS results,
             (SELECT count(*)::integer FROM evaluation.posting_feedback_result_categories
               WHERE run_fingerprint = (SELECT run_fingerprint FROM evaluation.posting_feedback_probe_runs WHERE source_sha = $1)) AS categories`,
    [successBinding.sourceSha]);
    assert.equal(totals[0].claims, 20);
    assert.equal(totals[0].results, 20);
    assert.equal(totals[0].categories, 20 * CATEGORIES.length);

    const { rows: stored } = await client.query(`
      SELECT evidence_class, provider_snapshot_known, provider_flagged, adapter_flagged,
             safety_band, score_interpretation, to_jsonb(result.*)::text AS sanitized
        FROM evaluation.posting_feedback_results AS result
       WHERE run_fingerprint = (SELECT run_fingerprint FROM evaluation.posting_feedback_probe_runs WHERE source_sha = $1)
       ORDER BY sample_id LIMIT 1`, [successBinding.sourceSha]);
    assert.equal(stored[0].evidence_class, 'SYNTHETIC_TRANSPORT_TEST_ONLY');
    assert.equal(stored[0].provider_snapshot_known, false);
    assert.equal(stored[0].provider_flagged, false);
    assert.equal(stored[0].adapter_flagged, false);
    assert.equal(stored[0].safety_band, 'ALLOW_EVIDENCE');
    assert.equal(stored[0].score_interpretation, 'UNCALIBRATED_PROVIDER_SCORE');
    assert.equal(stored[0].sanitized.includes(fixtures[0].body), false);
    assert.equal(stored[0].sanitized.includes('publicationEligible'), false);
    await assert.rejects(successLedger.persistReceipt(JSON.parse(JSON.stringify(syntheticReport.receipts[0]))), /untrusted_receipt/);
    await assert.rejects(successLedger.persistReceipt(syntheticReport.receipts[0]), /not_committed/);

    const writerBinding = runBinding('b'.repeat(40), 'c'.repeat(64));
    await client.query('SET ROLE posting_feedback_writer_test');
    const writerLedger = createDatabaseReceiptLedger(autocommitClient(client));
    const writerReport = await simulateTextProbe({
      fixtures: structuredClone(fixtures.slice(0, 20)), ledger: writerLedger,
      gate: gate(writerBinding.sourceSha, writerBinding.collectorHash), apiKey: 'synthetic-test-only',
      fetchImpl: async () => successBody(),
    });
    assert.equal(writerReport.receipts.length, 20);
    await assert.rejects(client.query('DELETE FROM evaluation.posting_feedback_attempt_claims'), { code: '42501' });
    await assert.rejects(client.query('SELECT input_hash FROM evaluation.posting_feedback_probe_samples LIMIT 1'), { code: '42501' });
    await client.query('RESET ROLE');

    await client.query('SET ROLE posting_feedback_reader_test');
    assert.equal((await client.query('SELECT count(*) FROM evaluation.posting_feedback_results')).rows[0].count, '40');
    assert.equal((await client.query('SELECT count(*) FROM evaluation.posting_feedback_result_categories')).rows[0].count, String(40 * CATEGORIES.length));
    await assert.rejects(client.query('SELECT * FROM evaluation.posting_feedback_attempt_claims LIMIT 1'), { code: '42501' });
    await assert.rejects(client.query(`INSERT INTO evaluation.posting_feedback_results
      (run_fingerprint, sample_id, schema_version, evidence_class, input_class, provider,
       requested_model, provider_snapshot_known, adapter_status, adapter_accepted, schema_valid,
       safety_band, delivery_status, transport_calls, actual_provider_requests, execution_ms,
       explanation_code, captured_at, expires_at)
      VALUES ('${'f'.repeat(64)}', '${fixtures[0].id}', 'lythaus-bounded-moderation-receipt-v1',
       'SYNTHETIC_TRANSPORT_TEST_ONLY', 'ARTIFICIAL_AGENT_WRITTEN_NOT_HUMAN_GROUND_TRUTH', 'openai',
       'omni-moderation-latest', false, 'ALLOW', true, true, 'ALLOW_EVIDENCE', 'NOT_SENT', 0, 0,
       0, 'NO_AUTHORITY', statement_timestamp(), statement_timestamp() + interval '7 days')`), { code: '42501' });
    await client.query('RESET ROLE');

    await client.query(`UPDATE evaluation.posting_feedback_results
      SET captured_at = statement_timestamp() - interval '8 days',
          expires_at = statement_timestamp() - interval '1 day'
      WHERE run_fingerprint = (SELECT run_fingerprint FROM evaluation.posting_feedback_probe_runs WHERE source_sha = $1)`,
    [writerBinding.sourceSha]);
    await client.query('SET ROLE posting_feedback_retention_test');
    assert.equal((await client.query('SELECT count(*) FROM evaluation.posting_feedback_results WHERE expires_at <= statement_timestamp()')).rows[0].count, '20');
    await assert.rejects(client.query('SELECT response_hash FROM evaluation.posting_feedback_results LIMIT 1'), { code: '42501' });
    const retentionDelete = await client.query('DELETE FROM evaluation.posting_feedback_results WHERE expires_at <= statement_timestamp()');
    assert.equal(retentionDelete.rowCount, 20);
    await assert.rejects(client.query('DELETE FROM evaluation.posting_feedback_attempt_claims'), { code: '42501' });
    await client.query('RESET ROLE');
    const { rows: retainedWriterClaims } = await client.query(`SELECT count(*)::integer AS count
      FROM evaluation.posting_feedback_attempt_claims
      WHERE run_fingerprint = (SELECT run_fingerprint FROM evaluation.posting_feedback_probe_runs WHERE source_sha = $1)`,
    [writerBinding.sourceSha]);
    assert.equal(retainedWriterClaims[0].count, 20);

    const malformedBinding = runBinding('c'.repeat(40), 'd'.repeat(64));
    const malformedLedger = createDatabaseReceiptLedger(autocommitClient(client));
    const malformedReport = await simulateTextProbe({
      fixtures: structuredClone(fixtures.slice(0, 20)), ledger: malformedLedger,
      gate: gate(malformedBinding.sourceSha, malformedBinding.collectorHash), apiKey: 'synthetic-test-only',
      fetchImpl: async () => Response.json({ model: OPENAI_MODERATION_MODEL, results: [{ flagged: false,
        categories: {}, category_scores: {}, category_applied_input_types: { harassment: [] } }] }),
    });
    assert.equal(malformedReport.receipts.length, 1);
    assert.equal(malformedReport.receipts[0].schemaValid, false);
    const { rows: emptyModalities } = await client.query(`SELECT category, provider_flag, provider_score,
      input_types_observed, applied_input_types FROM evaluation.posting_feedback_result_categories
      WHERE run_fingerprint = (SELECT run_fingerprint FROM evaluation.posting_feedback_probe_runs WHERE source_sha = $1)`,
    [malformedBinding.sourceSha]);
    assert.deepEqual(emptyModalities, [{ category: 'harassment', provider_flag: null, provider_score: null,
      input_types_observed: true, applied_input_types: [] }]);

    const rollbackBinding = runBinding('e'.repeat(40), 'f'.repeat(64));
    await client.query(`CREATE FUNCTION evaluation.test_reject_category_insert() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic_category_insert_failure'; END $$;
      CREATE TRIGGER test_reject_category_insert BEFORE INSERT ON evaluation.posting_feedback_result_categories
        FOR EACH ROW EXECUTE FUNCTION evaluation.test_reject_category_insert()`);
    let rollbackTransportCalls = 0;
    await assert.rejects(simulateTextProbe({
      fixtures: structuredClone(fixtures.slice(0, 20)), ledger: createDatabaseReceiptLedger(autocommitClient(client)),
      gate: gate(rollbackBinding.sourceSha, rollbackBinding.collectorHash), apiKey: 'synthetic-test-only',
      fetchImpl: async () => { rollbackTransportCalls += 1; return successBody(); },
    }), /synthetic_category_insert_failure/);
    await client.query('DROP TRIGGER test_reject_category_insert ON evaluation.posting_feedback_result_categories; DROP FUNCTION evaluation.test_reject_category_insert()');
    assert.equal(rollbackTransportCalls, 1);
    const { rows: rollbackRows } = await client.query(`SELECT claim.state,
      (SELECT count(*)::integer FROM evaluation.posting_feedback_results AS result
        WHERE result.run_fingerprint = claim.run_fingerprint AND result.sample_id = claim.sample_id) AS results
      FROM evaluation.posting_feedback_attempt_claims AS claim
      WHERE claim.run_fingerprint = (SELECT run_fingerprint FROM evaluation.posting_feedback_probe_runs WHERE source_sha = $1)`,
    [rollbackBinding.sourceSha]);
    assert.equal(rollbackRows[0].state, 'STARTED_NO_REPLAY');
    assert.equal(rollbackRows[0].results, 0);
    assert.equal(await createDatabaseReceiptLedger(autocommitClient(client)).claimProbe(rollbackBinding), false);

    const lostRunAckBinding = runBinding('1'.repeat(40), 'a'.repeat(64));
    const lostRunAckDb = autocommitClient(client, { afterQuery: (sql) => {
      if (sql.includes('INSERT INTO evaluation.posting_feedback_probe_runs')) throw new Error('synthetic_run_ack_lost');
    } });
    let lostRunAckTransportCalls = 0;
    await assert.rejects(simulateTextProbe({ fixtures: structuredClone(fixtures.slice(0, 20)),
      ledger: createDatabaseReceiptLedger(lostRunAckDb), gate: gate(lostRunAckBinding.sourceSha, lostRunAckBinding.collectorHash),
      apiKey: 'synthetic-test-only', fetchImpl: async () => { lostRunAckTransportCalls += 1; return successBody(); },
    }), /synthetic_run_ack_lost/);
    assert.equal(lostRunAckTransportCalls, 0);
    assert.equal(await createDatabaseReceiptLedger(autocommitClient(client)).claimProbe(lostRunAckBinding), false);

    const lostAttemptAckBinding = runBinding('2'.repeat(40), 'b'.repeat(64));
    const lostAttemptAckDb = autocommitClient(client, { afterQuery: (sql) => {
      if (sql.includes('INSERT INTO evaluation.posting_feedback_attempt_claims')) throw new Error('synthetic_attempt_ack_lost');
    } });
    let lostAttemptAckTransportCalls = 0;
    await assert.rejects(simulateTextProbe({ fixtures: structuredClone(fixtures.slice(0, 20)),
      ledger: createDatabaseReceiptLedger(lostAttemptAckDb), gate: gate(lostAttemptAckBinding.sourceSha, lostAttemptAckBinding.collectorHash),
      apiKey: 'synthetic-test-only', fetchImpl: async () => { lostAttemptAckTransportCalls += 1; return successBody(); },
    }), /synthetic_attempt_ack_lost/);
    assert.equal(lostAttemptAckTransportCalls, 0);
    const { rows: lostAttemptRows } = await client.query(`SELECT state FROM evaluation.posting_feedback_attempt_claims
      WHERE run_fingerprint = (SELECT run_fingerprint FROM evaluation.posting_feedback_probe_runs WHERE source_sha = $1)`,
    [lostAttemptAckBinding.sourceSha]);
    assert.equal(lostAttemptRows[0].state, 'STARTED_NO_REPLAY');
    assert.equal(await createDatabaseReceiptLedger(autocommitClient(client)).claimProbe(lostAttemptAckBinding), false);

    const lostResultAckBinding = runBinding('6'.repeat(40), 'd'.repeat(64));
    const lostResultAckDb = autocommitClient(client, { afterQuery: (sql) => {
      if (sql.includes('WITH transitioned_claim')) throw new Error('synthetic_result_ack_lost');
    } });
    let lostResultAckTransportCalls = 0;
    await assert.rejects(simulateTextProbe({ fixtures: structuredClone(fixtures.slice(0, 20)),
      ledger: createDatabaseReceiptLedger(lostResultAckDb), gate: gate(lostResultAckBinding.sourceSha, lostResultAckBinding.collectorHash),
      apiKey: 'synthetic-test-only', fetchImpl: async () => { lostResultAckTransportCalls += 1; return successBody(); },
    }), /synthetic_result_ack_lost/);
    assert.equal(lostResultAckTransportCalls, 1);
    const { rows: lostResultRows } = await client.query(`SELECT claim.state,
      (SELECT count(*)::integer FROM evaluation.posting_feedback_results AS result
        WHERE result.run_fingerprint = claim.run_fingerprint AND result.sample_id = claim.sample_id) AS results
      FROM evaluation.posting_feedback_attempt_claims AS claim
      WHERE claim.run_fingerprint = (SELECT run_fingerprint FROM evaluation.posting_feedback_probe_runs WHERE source_sha = $1)`,
    [lostResultAckBinding.sourceSha]);
    assert.equal(lostResultRows[0].state, 'RECEIPT_COMMITTED');
    assert.equal(lostResultRows[0].results, 1);
    assert.equal(await createDatabaseReceiptLedger(autocommitClient(client)).claimProbe(lostResultAckBinding), false);
    assert.equal(lostResultAckTransportCalls, 1);

    const driftBinding = runBinding('5'.repeat(40), '6'.repeat(64));
    const driftLedger = createDatabaseReceiptLedger(autocommitClient(client));
    const driftReport = await simulateTextProbe({
      fixtures: structuredClone(fixtures.slice(0, 20)),
      ledger: driftLedger,
      gate: gate(driftBinding.sourceSha, driftBinding.collectorHash),
      apiKey: 'synthetic-test-only',
      fetchImpl: async () => successBody('omni-moderation-unexpected-version', true),
    });
    assert.equal(driftReport.receipts.length, 1);
    assert.equal(driftReport.receipts[0].actualProviderRequests, 0);
    const { rows: driftRows } = await client.query(`
      SELECT response_model, schema_valid, provider_flagged, adapter_flagged, safety_band, failure_code
        FROM evaluation.posting_feedback_results
       WHERE run_fingerprint = (SELECT run_fingerprint FROM evaluation.posting_feedback_probe_runs WHERE source_sha = $1)`,
    [driftBinding.sourceSha]);
    assert.equal(driftRows[0].response_model, 'omni-moderation-unexpected-version');
    assert.equal(driftRows[0].schema_valid, false);
    assert.equal(driftRows[0].provider_flagged, true);
    assert.equal(driftRows[0].adapter_flagged, null);
    assert.equal(driftRows[0].safety_band, 'ABSTAIN');
    assert.equal(driftRows[0].failure_code, 'UNEXPECTED_SCHEMA');

    const uncertainBinding = runBinding('7'.repeat(40), '8'.repeat(64));
    const uncertainLedger = createDatabaseReceiptLedger(autocommitClient(client));
    let uncertainTransportCalls = 0;
    const uncertainReport = await simulateTextProbe({
      fixtures: structuredClone(fixtures.slice(0, 20)),
      ledger: uncertainLedger,
      gate: gate(uncertainBinding.sourceSha, uncertainBinding.collectorHash),
      apiKey: 'synthetic-test-only',
      fetchImpl: async () => { uncertainTransportCalls += 1; throw new Error('synthetic_disconnect'); },
    });
    assert.equal(uncertainTransportCalls, 1);
    assert.equal(uncertainReport.receipts.length, 1);
    assert.equal(uncertainReport.receipts[0].delivery, 'UNKNOWN_NO_RETRY');
    assert.equal(uncertainReport.receipts[0].actualProviderRequests, 0);
    assert.equal(await createDatabaseReceiptLedger(autocommitClient(client)).claimProbe(uncertainBinding), false);
    assert.equal(uncertainTransportCalls, 1);

    await client.query(`WITH expired_time AS (
                          SELECT statement_timestamp() - interval '8 days' AS captured_at
                        )
                        UPDATE evaluation.posting_feedback_results AS result
                           SET captured_at = expired_time.captured_at,
                               expires_at = expired_time.captured_at + interval '604800 seconds'
                          FROM expired_time
                         WHERE result.run_fingerprint =
                           (SELECT run_fingerprint FROM evaluation.posting_feedback_probe_runs WHERE source_sha = $1)`,
    [successBinding.sourceSha]);
    assert.equal(await successLedger.purgeExpiredResults(), 20);
    const { rows: afterExpiry } = await client.query(`
      SELECT (SELECT count(*)::integer FROM evaluation.posting_feedback_attempt_claims
               WHERE run_fingerprint = (SELECT run_fingerprint FROM evaluation.posting_feedback_probe_runs WHERE source_sha = $1)) AS claims,
             (SELECT count(*)::integer FROM evaluation.posting_feedback_results
               WHERE run_fingerprint = (SELECT run_fingerprint FROM evaluation.posting_feedback_probe_runs WHERE source_sha = $1)) AS results,
             (SELECT count(*)::integer FROM evaluation.posting_feedback_result_categories
               WHERE run_fingerprint = (SELECT run_fingerprint FROM evaluation.posting_feedback_probe_runs WHERE source_sha = $1)) AS categories`,
    [successBinding.sourceSha]);
    assert.equal(afterExpiry[0].claims, 20);
    assert.equal(afterExpiry[0].results, 0);
    assert.equal(afterExpiry[0].categories, 0);
    assert.equal(await createDatabaseReceiptLedger(autocommitClient(client)).claimProbe(successBinding), false);
  } finally {
    await clientA?.end().catch(() => {});
    await clientB?.end().catch(() => {});
    await client?.end().catch(() => {});
    try { docker(['rm', '--force', containerName]); } catch {}
  }
});
