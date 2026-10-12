import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test, mock } from 'node:test';
import pg from 'pg';
import { fixtures } from './fixtures.mjs';
import { CATEGORIES, hash } from './harness.ts';
import { createDatabaseReceiptLedger } from './database-ledger-proposal.ts';
import { createInactivePostingFeedbackLedger, createInactivePostingFeedbackCollector } from '../../../../apps/lythaus-jobs/src/posting-feedback-runtime.ts';
import { createDedicatedAutocommitClient, DatabaseAutocommitUncertainError, DatabaseAutocommitCleanupError } from '../../../db/src/autocommit.ts';
import { fixtureHost, localFixtureDns, statementResponseProxy } from '../../../db/tests/transaction-socket-fixture.mjs';
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

function hyperdriveFixtureBinding(port, applicationName, role = 'posting_feedback_writer_test') {
  const url = new URL(`postgresql://postgres@${fixtureHost}:${port}/postgres`);
  url.searchParams.set('sslmode', 'disable');
  if (role) url.searchParams.set('options', `-c role=${role}`);
  url.searchParams.set('application_name', applicationName);
  return { connectionString: url.toString() };
}

async function assertNoRuntimeClients(client, applicationName) {
  const { rows } = await client.query(`SELECT count(*)::integer AS count FROM pg_stat_activity
    WHERE application_name = $1`, [applicationName]);
  assert.equal(rows[0].count, 0);
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

function autocommitClient(client) {
  return {
    async queryAutocommit(sql, values) {
      return client.query(sql, values);
    },
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

test('Jobs ledger factory is separate from the production entrypoint', async () => {
  const entrypoint = await readFile(new URL('../../../../apps/lythaus-jobs/src/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(entrypoint, /posting-feedback-runtime/);
  const ledger = createInactivePostingFeedbackLedger(hyperdriveFixtureBinding(1, 'disabled_fixture'));
  assert.equal(Object.isFrozen(ledger), true);
  assert.equal(Object.hasOwn(ledger, 'purgeExpiredResults'), false);
});

test('live callable is hard-disabled before any database or provider work', async () => {
  const network = mock.method(globalThis, 'fetch', () => { throw new Error('OUTBOUND_DENIED'); });
  try {
    const collector = createInactivePostingFeedbackCollector(hyperdriveFixtureBinding(1, 'disabled_fixture'));
    await assert.rejects(collector.collect({ fixtures: fixtures.slice(0, 20),
      gate: gate('1'.repeat(40), '2'.repeat(64)), apiKey: 'synthetic-test-only',
    }), /posting_feedback_live_collection_disabled/);
    assert.equal(network.mock.callCount(), 0);
  } finally { network.mock.restore(); }
});

test('binding DSNs cannot override dedicated statement or query deadlines', () => {
  const original = hyperdriveFixtureBinding(1, 'timeout_override_fixture', null);
  const adversarial = [
    'statement_timeout=0', 'query_timeout=600000', 'query_timeout=0',
    'statement_timeout=', 'statement_timeout=-1', 'statement_timeout=15s',
    'query_timeout=Infinity', 'statement_timeout=15000&statement_timeout=0',
    'query_timeout=16000&query_timeout=600000', '%73tatement_timeout=0',
    'options=-c%20statement_timeout%3D0', 'options=--statement_timeout%3D0',
    'options=--statement-timeout%3D0',
    'options=-c%20statement%5C_timeout%3D0',
    'options=-c%20role%3Dfixture&options=-c%20statement_timeout%3D0',
  ];
  for (const suffix of adversarial)
    assert.throws(() => createDedicatedAutocommitClient({ connectionString: `${original.connectionString}&${suffix}` }),
      /database_autocommit_timeout_override_forbidden/);
  assert.throws(() => createDedicatedAutocommitClient({ connectionString:
    'postgresql://fixture:synthetic@example.invalid/postgres?sslmode=disable&statement_timeout=0' }),
    /hyperdrive_requires_sslmode_verify_full/);
});

test('ledger snapshots and reserves a probe before awaits; uncertain claims cannot reuse its context', async () => {
  let calls = 0;
  const captured = [];
  const ledger = createDatabaseReceiptLedger({ async queryAutocommit(sql, values) {
    calls += 1; captured.push([...values]);
    return { rows: [{}] };
  } });
  const binding = runBinding('1'.repeat(40), '2'.repeat(64));
  const pending = ledger.claimProbe(binding);
  binding.sourceSha = '3'.repeat(40);
  assert.equal(await ledger.claimProbe(runBinding('4'.repeat(40), '5'.repeat(64))), false);
  assert.equal(await pending, true);
  assert.equal(captured[0][2], '1'.repeat(40));
  const attempt = { sampleId: fixtures[0].id, inputHash: await hash(fixtures[0].body), revision: 1 };
  const claim = ledger.claimAttempt(attempt);
  attempt.inputHash = 'f'.repeat(64);
  assert.equal(await ledger.claimAttempt({ ...attempt, inputHash: await hash(fixtures[0].body) }), false);
  assert.equal(await claim, true);
  assert.equal(captured[1][2], await hash(fixtures[0].body));
  assert.equal(calls, 2);

  const uncertain = createDatabaseReceiptLedger({ async queryAutocommit() { throw new DatabaseAutocommitUncertainError(); } });
  await assert.rejects(uncertain.claimProbe(runBinding('6'.repeat(40), '7'.repeat(64))), DatabaseAutocommitUncertainError);
  assert.equal(await uncertain.claimProbe(runBinding('8'.repeat(40), '9'.repeat(64))), false);
});

postgresTest('dedicated PostgreSQL client enforces autocommit and closes every connection path', async (t) => {
  const containerName = `lythaus-autocommit-pg17-${process.pid}-${Date.now().toString(36)}`;
  const port = await freeLocalPort();
  docker(['run', '--detach', '--rm', '--name', containerName,
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--publish', `127.0.0.1:${port}:5432`, 'postgres:17']);
  let observer, restoreDns;
  try {
    observer = await connectToTemporaryPostgres(port);
    assert.match((await observer.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
    restoreDns = localFixtureDns();
    await observer.query('CREATE TABLE public.autocommit_fixture(id text PRIMARY KEY)');
    const applicationName = 'posting_feedback_autocommit_boundary';
    const binding = hyperdriveFixtureBinding(port, applicationName, null);
    const database = createDedicatedAutocommitClient(binding);
    assert.equal(Object.isFrozen(database), true);
    assert.deepEqual(Object.keys(database), ['queryAutocommit']);

    await t.test('concurrent statements own different clients and acknowledge only idle committed sessions', async () => {
      const results = await Promise.all([1, 2].map(() => database.queryAutocommit('SELECT pg_backend_pid() AS pid, pg_sleep(0.05)')));
      assert.notEqual(results[0].rows[0].pid, results[1].rows[0].pid);
      await assertNoRuntimeClients(observer, applicationName);
    });
    await t.test('binding and scalar values are snapshotted; an ambient rollback cannot undo the write', async () => {
      const mutableBinding = { ...binding, query: () => assert.fail('ambient client must never be called') };
      const captured = createDedicatedAutocommitClient(mutableBinding);
      mutableBinding.connectionString = 'unusable-after-factory-snapshot';
      await observer.query('BEGIN');
      const values = ['snapshotted'];
      const pending = captured.queryAutocommit('INSERT INTO public.autocommit_fixture(id) VALUES ($1) RETURNING id', values);
      values[0] = 'mutated';
      assert.equal((await pending).rows[0].id, 'snapshotted');
      assert.equal((await observer.query("SELECT count(*)::integer AS count FROM public.autocommit_fixture WHERE id='snapshotted'")).rows[0].count, 1);
      await observer.query('ROLLBACK');
      assert.equal((await observer.query("SELECT count(*)::integer AS count FROM public.autocommit_fixture WHERE id='snapshotted'")).rows[0].count, 1);
      await assertNoRuntimeClients(observer, applicationName);
    });
    await t.test('transaction control and multi-statement SQL cannot create an ambient transaction', async () => {
      for (const sql of ['BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT fixture', 'CALL fixture()'])
        await assert.rejects(database.queryAutocommit(sql), /data_statement_required/);
      await assert.rejects(database.queryAutocommit('SELECT 1; BEGIN'), { code: '42601' });
      await assert.rejects(database.queryAutocommit('SELECT $1', [{ unsafe: 'object' }]), /scalar_parameters_required/);
      await assert.rejects(database.queryAutocommit('SELECT $1', new Array(1)), /scalar_parameters_required/);
      await assertNoRuntimeClients(observer, applicationName);
    });
    await t.test('server statement errors retain their SQLSTATE and close the client', async () => {
      await assert.rejects(database.queryAutocommit('SELECT 1/0'), { code: '22012' });
      await assertNoRuntimeClients(observer, applicationName);
    });
    await t.test('failed startup closes without submitting a statement', async () => {
      const missing = new URL(binding.connectionString); missing.pathname = '/lythaus_missing_fixture_database';
      const unavailable = createDedicatedAutocommitClient({ connectionString: missing.toString() });
      await assert.rejects(unavailable.queryAutocommit('SELECT 1'), { code: '3D000' });
      await assertNoRuntimeClients(observer, applicationName);
    });
    await t.test('server disconnect before acknowledgement reports uncertainty and closes', async () => {
      const pending = database.queryAutocommit('SELECT pg_sleep(30)');
      const rejected = assert.rejects(pending, error => error instanceof DatabaseAutocommitUncertainError && error.outcome === 'unknown');
      let pid;
      for (let attempts = 0; attempts < 200 && !pid; attempts += 1) {
        pid = (await observer.query('SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND state=$2', [applicationName, 'active'])).rows[0]?.pid;
        if (!pid) await delay(10);
      }
      assert.ok(pid);
      await observer.query('SELECT pg_terminate_backend($1)', [pid]);
      await rejected;
      await assertNoRuntimeClients(observer, applicationName);
    });
    await t.test('server deadline cancels the statement and closes without retry', { timeout: 25_000 }, async () => {
      const declared = new URL(binding.connectionString);
      declared.searchParams.append('statement_timeout', '15000');
      declared.searchParams.append('query_timeout', '16000');
      declared.searchParams.append('options', `-c application_name=${applicationName}`);
      const bounded = createDedicatedAutocommitClient({ connectionString: declared.toString() });
      const settings = await bounded.queryAutocommit("SELECT current_setting('statement_timeout') AS timeout, current_setting('application_name') AS application_name");
      assert.equal(settings.rows[0].timeout, '15s');
      assert.equal(settings.rows[0].application_name, applicationName);
      await assert.rejects(bounded.queryAutocommit('SELECT pg_sleep(30)'), { code: '57014' });
      await assertNoRuntimeClients(observer, applicationName);
    });
    await t.test('conflicting timeout DSNs fail before PostgreSQL receives a connection', async () => {
      for (const [key, value] of [['statement_timeout', '0'], ['query_timeout', '600000'],
        ['options', '-c statement_timeout=0'], ['options', '-c statement\\_timeout=0']]) {
        const override = new URL(binding.connectionString); override.searchParams.append(key, value);
        assert.throws(() => createDedicatedAutocommitClient({ connectionString: override.toString() }),
          /database_autocommit_timeout_override_forbidden/);
      }
      await assertNoRuntimeClients(observer, applicationName);
    });
    await t.test('acknowledged writes fail closed within the cleanup bound when the peer stalls its close', { timeout: 5_000 }, async () => {
      const target = new URL(`postgresql://postgres@127.0.0.1:${port}/postgres`);
      const proxy = await statementResponseProxy(target, 'INSERT INTO public.autocommit_fixture', 'stall_after_acknowledgement');
      const proxied = createDedicatedAutocommitClient(hyperdriveFixtureBinding(proxy.port, applicationName, null));
      let timeout;
      try {
        await Promise.race([
          assert.rejects(proxied.queryAutocommit('INSERT INTO public.autocommit_fixture(id) VALUES ($1)', ['stalled_close']),
            error => error instanceof DatabaseAutocommitCleanupError && error.outcome === 'acknowledged'),
          new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('fixture_close_bound_exceeded')), 3_000); }),
        ]);
        assert.equal(proxy.acknowledged, true);
        assert.equal(proxy.terminationSeen, true);
        assert.equal((await observer.query("SELECT count(*)::integer AS count FROM public.autocommit_fixture WHERE id='stalled_close'")).rows[0].count, 1);
        await assertNoRuntimeClients(observer, applicationName);
      } finally { clearTimeout(timeout); await proxy.close(); }
    });
    for (const mode of ['drop_before_commit', 'drop_committed_response']) await t.test(`missing acknowledgement is unknown for ${mode}`, async () => {
      const target = new URL(`postgresql://postgres@127.0.0.1:${port}/postgres`);
      const proxy = await statementResponseProxy(target, 'INSERT INTO public.autocommit_fixture', mode);
      const proxied = createDedicatedAutocommitClient(hyperdriveFixtureBinding(proxy.port, applicationName, null));
      try {
        await assert.rejects(proxied.queryAutocommit('INSERT INTO public.autocommit_fixture(id) VALUES ($1)', [mode]),
          error => error instanceof DatabaseAutocommitUncertainError && error.outcome === 'unknown');
        assert.equal(proxy.responseDropped, true);
        const count = (await observer.query('SELECT count(*)::integer AS count FROM public.autocommit_fixture WHERE id=$1', [mode])).rows[0].count;
        assert.equal(count, mode === 'drop_committed_response' ? 1 : 0);
        await assertNoRuntimeClients(observer, applicationName);
      } finally { await proxy.close(); }
    });
  } finally {
    restoreDns?.(); await observer?.end().catch(() => {});
    try { docker(['rm', '--force', containerName]); } catch {}
  }
});

postgresTest('PostgreSQL ledger claims once, stores only allowlisted outcomes, and retains tombstones after result expiry', async (t) => {
  const containerName = `lythaus-ledger-pg17-${process.pid}-${Date.now().toString(36)}`;
  const port = await freeLocalPort();
  docker(['run', '--detach', '--rm', '--name', containerName,
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--publish', `127.0.0.1:${port}:5432`, 'postgres:17']);

  let client;
  let restoreFixtureDns;
  const ambientNetwork = mock.method(globalThis, 'fetch', () => { throw new Error('OUTBOUND_DENIED'); });
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

    await client.query(`CREATE ROLE posting_feedback_writer_test LOGIN;
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

    restoreFixtureDns = localFixtureDns();
    const runtimeApplicationName = 'posting_feedback_runtime_test';
    const runtimeBinding = hyperdriveFixtureBinding(port, runtimeApplicationName);
    const concurrentBinding = runBinding('1'.repeat(40), '2'.repeat(64));
    await client.query(`CREATE FUNCTION evaluation.test_delay_claim_insert() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.15); RETURN NEW; END $$;
      CREATE TRIGGER test_delay_run_claim BEFORE INSERT ON evaluation.posting_feedback_probe_runs
        FOR EACH ROW EXECUTE FUNCTION evaluation.test_delay_claim_insert();
      CREATE TRIGGER test_delay_attempt_claim BEFORE INSERT ON evaluation.posting_feedback_attempt_claims
        FOR EACH ROW EXECUTE FUNCTION evaluation.test_delay_claim_insert()`);
    const runtimeLedgers = [createInactivePostingFeedbackLedger(runtimeBinding), createInactivePostingFeedbackLedger(runtimeBinding)];
    const runClaims = await Promise.all(runtimeLedgers.map(ledger => ledger.claimProbe(concurrentBinding)));
    assert.deepEqual([...runClaims].sort(), [false, true]);
    const runtimeRace = runtimeLedgers[runClaims.indexOf(true)];
    const firstFixture = fixtures[0];
    const firstAttempt = { sampleId: firstFixture.id, inputHash: await hash(firstFixture.body), revision: firstFixture.revision };
    const attemptClaims = await Promise.all([runtimeRace.claimAttempt(firstAttempt), runtimeRace.claimAttempt(firstAttempt)]);
    assert.deepEqual([...attemptClaims].sort(), [false, true]);
    await client.query(`DROP TRIGGER test_delay_run_claim ON evaluation.posting_feedback_probe_runs;
                       DROP TRIGGER test_delay_attempt_claim ON evaluation.posting_feedback_attempt_claims;
                       DROP FUNCTION evaluation.test_delay_claim_insert()`);
    assert.equal(await createInactivePostingFeedbackLedger(runtimeBinding).claimProbe(concurrentBinding), false);
    await assertNoRuntimeClients(client, runtimeApplicationName);
    const { rows: interruptedClaim } = await client.query(`
      SELECT state, receipt_committed_at FROM evaluation.posting_feedback_attempt_claims
       WHERE run_fingerprint = (SELECT run_fingerprint FROM evaluation.posting_feedback_probe_runs WHERE source_sha = $1)
         AND sample_id = $2`, [concurrentBinding.sourceSha, firstFixture.id]);
    assert.equal(interruptedClaim[0].state, 'STARTED_NO_REPLAY');
    assert.equal(interruptedClaim[0].receipt_committed_at, null);
    await assert.rejects(runtimeRace.claimAttempt({ ...firstAttempt, revision: firstAttempt.revision + 1 }), /replay|claimed|stale/i);
    const { rows: concurrentRunRows } = await client.query(
      'SELECT run_fingerprint FROM evaluation.posting_feedback_probe_runs WHERE source_sha = $1', [concurrentBinding.sourceSha]);
    await assert.rejects(client.query(`INSERT INTO evaluation.posting_feedback_attempt_claims
      (run_fingerprint, sample_id, input_hash, revision) VALUES ($1, $2, $3, 1)`,
    [concurrentRunRows[0].run_fingerprint, '019a0000-0000-7000-8000-000000000021', '0'.repeat(64)]), { code: '23503' });

    const successBinding = runBinding('3'.repeat(40), '4'.repeat(64));
    const successLedger = createInactivePostingFeedbackLedger(runtimeBinding);
    let providerTransportCalls = 0;
    await client.query('BEGIN');
    const syntheticReport = await simulateTextProbe({
      fixtures: structuredClone(fixtures.slice(0, 20)),
      ledger: successLedger,
      gate: gate(successBinding.sourceSha, successBinding.collectorHash),
      apiKey: 'synthetic-test-only',
      fetchImpl: async () => {
        const fixture = fixtures[providerTransportCalls];
        const { rows } = await client.query(`SELECT claim.state,
          (SELECT count(*)::integer FROM evaluation.posting_feedback_results result
            WHERE result.run_fingerprint = claim.run_fingerprint) AS prior_results
          FROM evaluation.posting_feedback_attempt_claims claim
          JOIN evaluation.posting_feedback_probe_runs run USING (run_fingerprint)
          WHERE run.source_sha = $1 AND claim.sample_id = $2`, [successBinding.sourceSha, fixture.id]);
        assert.equal(rows.length, 1, 'an independent connection sees each committed claim before transport');
        assert.equal(rows[0].state, 'STARTED_NO_REPLAY');
        assert.equal(rows[0].prior_results, providerTransportCalls, 'the prior receipt committed before the next transport');
        await assertNoRuntimeClients(client, runtimeApplicationName);
        providerTransportCalls += 1; return successBody();
      },
    });
    await client.query('ROLLBACK');
    assert.equal(providerTransportCalls, 20);
    assert.equal(syntheticReport.actualProviderRequests, 0);
    assert.equal(syntheticReport.receipts.length, 20);
    assert.equal(syntheticReport.thresholds, 'UNEVALUATED');
    assert.equal(syntheticReport.publicPosting, 'WITHHELD');
    await assertNoRuntimeClients(client, runtimeApplicationName);

    let replayTransportCalls = 0;
    await assert.rejects(simulateTextProbe({ fixtures: structuredClone(fixtures.slice(0, 20)),
      ledger: createInactivePostingFeedbackLedger(runtimeBinding),
      gate: gate(successBinding.sourceSha, successBinding.collectorHash), apiKey: 'synthetic-test-only',
      fetchImpl: async () => { replayTransportCalls += 1; return successBody(); },
    }), /collection_probe_already_claimed/);
    assert.equal(replayTransportCalls, 0);
    await assertNoRuntimeClients(client, runtimeApplicationName);

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

    const target = new URL(`postgresql://postgres@127.0.0.1:${port}/postgres`);
    await t.test('stalled claim cleanup preserves acknowledged state and prevents any provider request', { timeout: 5_000 }, async () => {
      const proxy = await statementResponseProxy(target, 'INSERT INTO evaluation.posting_feedback_probe_runs', 'stall_after_acknowledgement');
      const stalledBinding = runBinding('6'.repeat(40), '1'.repeat(64));
      const stalledLedger = createInactivePostingFeedbackLedger(hyperdriveFixtureBinding(proxy.port, 'posting_feedback_stalled_claim'));
      let timeout, providerCalls = 0;
      try {
        await Promise.race([
          assert.rejects(simulateTextProbe({ fixtures: fixtures.slice(0, 20), ledger: stalledLedger,
            gate: gate(stalledBinding.sourceSha, stalledBinding.collectorHash), apiKey: 'synthetic-test-only',
            fetchImpl: async () => { providerCalls += 1; return successBody(); },
          }), error => error instanceof DatabaseAutocommitCleanupError && error.outcome === 'acknowledged'),
          new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('fixture_close_bound_exceeded')), 3_000); }),
        ]);
        assert.equal(providerCalls, 0);
        assert.equal(proxy.acknowledged, true);
        assert.equal(proxy.terminationSeen, true);
        assert.equal((await client.query('SELECT count(*)::integer AS count FROM evaluation.posting_feedback_probe_runs WHERE source_sha=$1', [stalledBinding.sourceSha])).rows[0].count, 1);
        assert.equal(await createInactivePostingFeedbackLedger(runtimeBinding).claimProbe(stalledBinding), false);
        assert.equal(await stalledLedger.claimProbe(stalledBinding), false);
        await assertNoRuntimeClients(client, 'posting_feedback_stalled_claim');
      } finally { clearTimeout(timeout); await proxy.close(); }
    });
    async function verifyLostAcknowledgement({ label, binding, statement, expectedCalls, expectedClaimState, expectedResults }) {
      const proxy = await statementResponseProxy(target, statement);
      const applicationName = `posting_feedback_lost_${label}`;
      const proxyBinding = hyperdriveFixtureBinding(proxy.port, applicationName);
      let providerCalls = 0;
      const lostLedger = createInactivePostingFeedbackLedger(proxyBinding);
      try {
        await assert.rejects(simulateTextProbe({ fixtures: structuredClone(fixtures.slice(0, 20)),
          ledger: lostLedger,
          gate: gate(binding.sourceSha, binding.collectorHash), apiKey: 'synthetic-test-only',
          fetchImpl: async () => { providerCalls += 1; return successBody(); },
        }), DatabaseAutocommitUncertainError);
        assert.equal(proxy.commitSeen, true);
        assert.equal(proxy.responseDropped, true);
        assert.ok(proxy.commandObserved);
        assert.equal(providerCalls, expectedCalls);
        assert.equal(await lostLedger.claimAttempt({ sampleId: fixtures[1].id,
          inputHash: await hash(fixtures[1].body), revision: 1 }), false, 'a failed acknowledgement poisons this ledger instance');

        const { rows } = await client.query(`SELECT run.run_fingerprint,
          (SELECT count(*)::integer FROM evaluation.posting_feedback_attempt_claims AS claim
            WHERE claim.run_fingerprint = run.run_fingerprint) AS claims,
          (SELECT min(state) FROM evaluation.posting_feedback_attempt_claims AS claim
            WHERE claim.run_fingerprint = run.run_fingerprint) AS claim_state,
          (SELECT count(*)::integer FROM evaluation.posting_feedback_results AS result
            WHERE result.run_fingerprint = run.run_fingerprint) AS results
          FROM evaluation.posting_feedback_probe_runs AS run
          WHERE run.source_sha = $1 AND run.collector_hash = $2`,
        [binding.sourceSha, binding.collectorHash]);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].claims, expectedClaimState ? 1 : 0);
        assert.equal(rows[0].claim_state, expectedClaimState);
        assert.equal(rows[0].results, expectedResults);

        let retryCalls = 0;
        await assert.rejects(simulateTextProbe({ fixtures: structuredClone(fixtures.slice(0, 20)),
          ledger: createInactivePostingFeedbackLedger(runtimeBinding),
          gate: gate(binding.sourceSha, binding.collectorHash), apiKey: 'synthetic-test-only',
          fetchImpl: async () => { retryCalls += 1; return successBody(); },
        }), /collection_probe_already_claimed/);
        assert.equal(retryCalls, 0);
        await assertNoRuntimeClients(client, applicationName);
        await assertNoRuntimeClients(client, runtimeApplicationName);
      } finally {
        await proxy.close();
      }
    }

    await verifyLostAcknowledgement({ label: 'run', binding: runBinding('8'.repeat(40), '9'.repeat(64)),
      statement: 'INSERT INTO evaluation.posting_feedback_probe_runs', expectedCalls: 0,
      expectedClaimState: null, expectedResults: 0 });
    await verifyLostAcknowledgement({ label: 'attempt', binding: runBinding('9'.repeat(40), 'a'.repeat(64)),
      statement: 'INSERT INTO evaluation.posting_feedback_attempt_claims', expectedCalls: 0,
      expectedClaimState: 'STARTED_NO_REPLAY', expectedResults: 0 });
    await verifyLostAcknowledgement({ label: 'result', binding: runBinding('a'.repeat(40), 'b'.repeat(64)),
      statement: 'WITH transitioned_claim', expectedCalls: 1,
      expectedClaimState: 'RECEIPT_COMMITTED', expectedResults: 1 });

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
    assert.equal(await createDatabaseReceiptLedger(autocommitClient(client)).purgeExpiredResults(), 20);
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

    const callable = createInactivePostingFeedbackCollector(runtimeBinding);
    const interrupted = new AbortController();
    let interruptedCalls = 0;
    const interruptedGate = gate('e'.repeat(40), '0'.repeat(64));
    const interruptedReport = await callable.simulate({ fixtures: fixtures.slice(0, 20),
      gate: interruptedGate, apiKey: 'synthetic-test-only', signal: interrupted.signal,
      fetchImpl: async () => { interruptedCalls += 1; interrupted.abort(); throw new Error('synthetic_interruption'); },
    });
    assert.equal(interruptedCalls, 1);
    assert.equal(interruptedReport.receipts.length, 1);
    assert.equal(interruptedReport.receipts[0].delivery, 'UNKNOWN_NO_RETRY');
    assert.equal(interruptedReport.actualProviderRequests, 0);
    let interruptedReplayCalls = 0;
    await assert.rejects(callable.simulate({ fixtures: fixtures.slice(0, 20),
      gate: interruptedGate, apiKey: 'synthetic-test-only',
      fetchImpl: async () => { interruptedReplayCalls += 1; return successBody(); },
    }), /collection_probe_already_claimed/);
    assert.equal(interruptedReplayCalls, 0);

    const beforeStart = new AbortController(); beforeStart.abort();
    let beforeStartCalls = 0;
    await assert.rejects(callable.simulate({ fixtures: fixtures.slice(0, 20),
      gate: gate('f'.repeat(40), '0'.repeat(64)), apiKey: 'synthetic-test-only', signal: beforeStart.signal,
      fetchImpl: async () => { beforeStartCalls += 1; return successBody(); },
    }), /collection_interrupted/);
    assert.equal(beforeStartCalls, 0);
    assert.equal((await client.query('SELECT count(*)::integer AS count FROM evaluation.posting_feedback_probe_runs WHERE source_sha=$1', ['f'.repeat(40)])).rows[0].count, 0);

    let simultaneousCalls = 0;
    const simultaneousOptions = { fixtures: fixtures.slice(0, 20), gate: gate('0'.repeat(40), '1'.repeat(64)),
      apiKey: 'synthetic-test-only', fetchImpl: async () => { simultaneousCalls += 1; return successBody(); } };
    const simultaneous = await Promise.allSettled([callable.simulate(simultaneousOptions), callable.simulate(simultaneousOptions)]);
    assert.equal(simultaneous.filter(value => value.status === 'fulfilled').length, 1);
    assert.equal(simultaneous.filter(value => value.status === 'rejected').length, 1);
    assert.match(simultaneous.find(value => value.status === 'rejected').reason.message, /collection_probe_already_claimed/);
    assert.equal(simultaneousCalls, 20);

    const mutableOptions = { fixtures: structuredClone(fixtures.slice(0, 20)),
      gate: gate('d'.repeat(40), 'a'.repeat(64)), apiKey: 'synthetic-test-only',
      fetchImpl: async () => new Response(null, { status: 503 }) };
    const snapshotted = callable.simulate(mutableOptions);
    mutableOptions.gate.observedSourceSha = 'f'.repeat(40);
    mutableOptions.fixtures[0].body = 'changed after callable entry';
    const snapshotReport = await snapshotted;
    assert.equal(snapshotReport.sourceSha, 'd'.repeat(40));
    assert.equal(snapshotReport.receipts[0].inputHash, await hash(fixtures[0].body));
    assert.equal(snapshotReport.receipts.length, 1);
    await assertNoRuntimeClients(client, runtimeApplicationName);

    await t.test('Workerd callable uses real Hyperdrive PostgreSQL clients and an outbound-denied provider fixture', { timeout: 60_000 }, async () => {
      const require = createRequire(new URL('../../../../node_modules/wrangler/package.json', import.meta.url));
      const { build } = require('esbuild');
      const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
      const root = fileURLToPath(new URL('../../../../', import.meta.url));
      const workerdGate = gate('2'.repeat(40), '3'.repeat(64));
      const bundle = await build({ absWorkingDir: root, bundle: true, write: false,
        format: 'esm', platform: 'node', target: 'es2022', conditions: ['workerd'],
        external: ['node:*', 'cloudflare:*', 'pg-native'],
        banner: { js: "import { createRequire } from 'node:module'; const require = createRequire('file:///posting-feedback-fixture.mjs');" },
        stdin: { resolveDir: root, contents: `
          import { createInactivePostingFeedbackCollector } from './apps/lythaus-jobs/src/posting-feedback-runtime.ts';
          import { fixtures } from './packages/authenticity/evaluation/posting-feedback/fixtures.mjs';
          export default { async fetch(request, env) {
            const collector = createInactivePostingFeedbackCollector(env.DB_JOBS_FRESH);
            const options = { fixtures: fixtures.slice(0, 20), gate: env.GATE, apiKey: 'synthetic-test-only' };
            try {
              if (new URL(request.url).pathname === '/live') return Response.json(await collector.collect(options));
              return Response.json(await collector.simulate({ ...options,
                fetchImpl: (input, init) => env.PROVIDER_FIXTURE.fetch(input, init) }));
            } catch (error) { return Response.json({ error: error.message }, { status: 409 }); }
          }};
        ` },
      });
      let workerdCalls = 0, outboundCalls = 0;
      const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [{
        name: 'posting-feedback-runtime-fixture', modules: true, script: bundle.outputFiles[0].text,
        compatibilityDate: '2026-07-27', compatibilityFlags: ['nodejs_compat'],
        hyperdrives: { DB_JOBS_FRESH: `postgresql://posting_feedback_writer_test:synthetic-fixture-only@127.0.0.1:${port}/postgres` },
        bindings: { GATE: workerdGate },
        outboundService: () => { outboundCalls += 1; throw new Error('OUTBOUND_DENIED'); },
        serviceBindings: { PROVIDER_FIXTURE: async request => {
          assert.equal(request.url, 'https://api.openai.com/v1/moderations');
          const payload = await request.json();
          assert.equal(payload.input, fixtures[workerdCalls].body);
          const { rows } = await client.query(`SELECT claim.state,
            (SELECT count(*)::integer FROM evaluation.posting_feedback_results result
              WHERE result.run_fingerprint=claim.run_fingerprint) AS prior_results
            FROM evaluation.posting_feedback_attempt_claims claim
            JOIN evaluation.posting_feedback_probe_runs run USING(run_fingerprint)
            WHERE run.source_sha=$1 AND claim.sample_id=$2`, [workerdGate.observedSourceSha, fixtures[workerdCalls].id]);
          assert.equal(rows[0]?.state, 'STARTED_NO_REPLAY');
          assert.equal(rows[0]?.prior_results, workerdCalls);
          workerdCalls += 1; return successBody();
        } },
      }] }));
      try {
        const disabled = await runtime.dispatchFetch('https://posting-feedback-fixture.test/live');
        assert.equal(disabled.status, 409);
        assert.equal((await disabled.json()).error, 'posting_feedback_live_collection_disabled');
        assert.equal(workerdCalls, 0);
        const response = await runtime.dispatchFetch('https://posting-feedback-fixture.test/simulate');
        assert.equal(response.status, 200, await response.clone().text());
        const report = await response.json();
        assert.equal(report.receipts.length, 20);
        assert.equal(report.actualProviderRequests, 0);
        assert.equal(report.publicPosting, 'WITHHELD');
        assert.equal(workerdCalls, 20);
        const replay = await runtime.dispatchFetch('https://posting-feedback-fixture.test/simulate');
        assert.equal(replay.status, 409);
        assert.equal((await replay.json()).error, 'collection_probe_already_claimed');
        assert.equal(workerdCalls, 20);
        assert.equal(outboundCalls, 0);
      } finally { await runtime.dispose(); }
    });
    assert.equal(ambientNetwork.mock.callCount(), 0);
  } finally {
    ambientNetwork.mock.restore();
    restoreFixtureDns?.();
    await client?.end().catch(() => {});
    try { docker(['rm', '--force', containerName]); } catch {}
  }
});
