import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import { imageDetectionFixture } from './image-detection-fixture.mjs';
import { BETA_ADVISER, BETA_VERSION, SAFE_CHECKPOINT, SAFE_PREPROCESSING } from '../../../packages/authenticity/src/beta.ts';
import { generateForensicFeatureBundleV1 } from '../../../packages/authenticity/src/forensics.ts';
import { createInsufficientEvidenceRecommendation } from '../../../packages/authenticity/src/judge.ts';

const caseId = '01990000-0000-7000-8000-000000000601';
const ownerId = '01990000-0000-7000-8000-000000000602';
const eventId = '01990000-0000-7000-8000-000000000603';
const png = new Uint8Array(await sharp({ create: { width: 256, height: 256, channels: 3,
  background: { r: 30, g: 80, b: 120 } } }).png().toBuffer());
const jpeg = new Uint8Array(await sharp(png).jpeg({ quality: 85 }).toBuffer());
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const result = rows => ({ rows, rowCount: rows.length });

test('real private image job and adapters in Workerd with zero external provider requests', { timeout: 60_000 }, async t => {
  let state, snapshot, config, scenario;
  const calls = [];
  const matches = values => state.row.case_id === values[0] && state.row.revision === values[1]
    && state.row.lease_token === values[2] && state.row.state === 'analyzing' && !state.row.deleted_at;
  const fixture = await imageDetectionFixture({
    config: () => config,
    database: async input => {
      if (input.action === 'snapshot') return state.row;
      if (input.action === 'begin') { snapshot = structuredClone(state); return {}; }
      if (input.action === 'commit') return {};
      if (input.action === 'rollback') { state = snapshot; return {}; }
      const sql = input.text.replace(/\s+/g, ' ').trim(), values = input.values;
      if (sql.startsWith('SELECT e.id FROM system.outbox_events')) {
        return result(!scenario.forged && values[0] === eventId && values[1] === caseId
          && values[2] === String(state.row.revision) ? [{ id: eventId }] : []);
      }
      if (sql.startsWith('INSERT INTO system.audit_events')) { state.audit.push(values); return result([{}]); }
      if (sql.startsWith('SELECT pg_advisory_xact_lock')) return result([{}]);
      if (sql.startsWith('SELECT case_id FROM moderation.authenticity_beta WHERE lease_until')) return result([]);
      if (sql.startsWith("UPDATE moderation.authenticity_beta SET state='analyzing'")) {
        if (state.row.revision !== values[1] || !['queued', 'analyzing'].includes(state.row.state) || state.row.deleted_at) return result([]);
        Object.assign(state.row, { state: 'analyzing', lease_token: values[2] });
        return result([state.row]);
      }
      if (sql.startsWith('SELECT id FROM system.cost_budget_reservations')) return result(scenario.budgetDenied ? [] : [{ id: 'synthetic-reservation' }]);
      if (sql.startsWith('SELECT count(DISTINCT case_id)')) return result([{ count: '0' }]);
      if (sql.startsWith('SELECT case_id FROM moderation.authenticity_beta')) return result(matches(values) ? [{ case_id: caseId }] : []);
      if (sql.startsWith('SELECT content_type,byte_size FROM media.objects')) {
        return result(values[0] === caseId && values[1] === ownerId && values[2] === state.row.original_key
          && values[3] === state.row.input_hash ? [{ content_type: state.row.content_type, byte_size: String(state.bytes.length) }] : []);
      }
      if (sql.startsWith('SELECT id,state,output,reuse_key')) return result(state.steps.filter(step => step.name === values[1]));
      if (sql.startsWith('INSERT INTO moderation.authenticity_beta_steps')) {
        state.steps.push({ id: values[0], name: values[3], state: 'started', output: null, reuse_key: values[4] });
        return result([{}]);
      }
      if (sql.startsWith("UPDATE moderation.authenticity_beta_steps SET state='completed'")) {
        Object.assign(state.steps.find(step => step.id === values[0]), { state: 'completed', output: JSON.parse(values[1]) });
        return result([{}]);
      }
      if (sql.startsWith("UPDATE moderation.authenticity_beta_steps SET state='ambiguous'")) {
        Object.assign(state.steps.find(step => step.id === values[0]), { state: 'ambiguous' });
        return result([{}]);
      }
      if (sql.startsWith('INSERT INTO moderation.detector_runs')) { state.detectorRuns.push(JSON.parse(values[3])); return result([{}]); }
      if (sql.startsWith('UPDATE moderation.authenticity_beta SET safety=')) {
        if (!matches(values)) return result([]);
        state.safety = JSON.parse(values[3]); return result([{}]);
      }
      if (sql.startsWith('UPDATE moderation.authenticity_beta SET result=')) {
        if (!matches(values)) return result([]);
        state.row.result = JSON.parse(values[3]);
        if (values[4]) Object.assign(state.row, { state: values[5], lease_token: null });
        return result([{}]);
      }
      if (sql.startsWith('UPDATE moderation.authenticity_beta SET state=$4')) {
        if (!matches(values)) return result([]);
        Object.assign(state.row, { state: values[3], failure_code: values[4] ?? null, lease_token: null });
        return result([{}]);
      }
      if (sql.startsWith("UPDATE moderation.authenticity_beta SET state='paused'")) {
        Object.assign(state.row, { state: 'paused', failure_code: values[3], lease_token: null }); return result([{}]);
      }
      if (sql.startsWith('UPDATE system.cost_budget_reservations SET measurement=')) {
        state.measurement = JSON.parse(values[1]); return result([{}]);
      }
      throw new Error('unhandled_synthetic_image_sql');
    },
    safety: async request => {
      const body = await request.json();
      assert.equal(body.model, 'omni-moderation-latest');
      const image = body.input.find(input => input.type === 'image_url');
      assert.ok(image);
      assert.equal(digest(Buffer.from(image.image_url.url.split(',')[1], 'base64')), state.row.input_hash);
      calls.push({ provider: 'safety', inputHash: state.row.input_hash });
      if (scenario.safetyFailure) return Response.json({ error: { message: 'must never escape', code: 'server_error' } }, { status: 503 });
      return Response.json({ model: 'omni-moderation-latest', results: [{ flagged: Boolean(scenario.flagged),
        categories: { violence: Boolean(scenario.flagged) }, category_scores: { violence: scenario.flagged ? 0.9 : 0.01 },
        category_applied_input_types: { violence: ['image'] } }] });
    },
    specialist: async request => {
      const bytes = new Uint8Array(await request.arrayBuffer());
      assert.equal(digest(bytes), state.row.input_hash);
      const binding = JSON.parse(request.headers.get('x-beta-binding'));
      assert.equal(binding.caseId, caseId);
      assert.equal(binding.revision, 1);
      assert.equal(binding.inputHash, state.row.input_hash);
      assert.equal(state.steps.find(step => step.name === 'safe')?.state, 'started', 'attempt is persisted before transport');
      calls.push({ provider: 'specialist', inputHash: digest(bytes) });
      if (scenario.specialistFailure) return new Response(null, { status: 503 });
      const decoded = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
      const forensics = await generateForensicFeatureBundleV1({ caseId, mime: state.row.content_type, bytes,
        decoded: { width: decoded.info.width, height: decoded.info.height, channels: decoded.info.channels, pixels: decoded.data } });
      const safe = { ...binding, schemaVersion: BETA_VERSION, checkpoint: SAFE_CHECKPOINT, preprocessing: SAFE_PREPROCESSING,
        preprocessingHash: config.preprocessingHash, runtimeDigest: config.runtimeDigest,
        status: 'OK', score: scenario.low ? 0.01 : 0.99,
        facts: { mime: state.row.content_type, width: 256, height: 256, mode: 'RGB', frames: 1, sourceHistory: 'DOCUMENTED_LOSSLESS' },
        timings: { decodeMs: 1, inferenceMs: 1, peakRssBytes: 1024 }, forensics };
      if (scenario.forgedRun) safe.runId = '01990000-0000-7000-8000-000000000699';
      if (scenario.withdrawRights) config.rightsApproval = null;
      if (scenario.withdrawHistory) config.sourceHistoryHashes = [];
      if (scenario.staleRevision) Object.assign(state.row, { revision: 2, state: 'queued', lease_token: null });
      return Response.json({ result: safe });
    },
    reasoner: async request => {
      const input = await request.json();
      assert.equal(input.model, BETA_ADVISER);
      assert.equal(input.body.max_tokens, 2400);
      assert.equal(input.options.collectLog, false);
      assert.equal(input.options.gateway.skipCache, true);
      assert.doesNotMatch(JSON.stringify(input.body), /data:image|quarantine\/|synthetic-not-a-secret/);
      calls.push({ provider: 'reasoner' });
      const advice = createInsufficientEvidenceRecommendation('The specialist is positive-only; other evidence families are unavailable.');
      if (scenario.unsafeAdvice) advice.primaryHypothesis = 'SYNTHETIC';
      return Response.json({ response: JSON.stringify(advice), usage: { prompt_tokens: 100, completion_tokens: 80 } });
    },
  });
  async function seed(options = {}) {
    scenario = options; calls.length = 0;
    const bytes = options.jpeg ? jpeg : png;
    state = { bytes, steps: [], detectorRuns: [], audit: [], safety: null, measurement: null,
      row: { case_id: caseId, owner_id: ownerId, revision: 1, state: 'queued', lease_token: null, result: null,
        original_key: `quarantine/${ownerId}/${caseId}`, input_hash: digest(bytes), content_type: options.jpeg ? 'image/jpeg' : 'image/png',
        deleted_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 900000).toISOString() } };
    const stored = await fixture.quarantine.put(state.row.original_key, bytes);
    state.row.original_etag = stored.httpEtag;
    config = { enabled: true, expiresAt: new Date(Date.now() + 3600000).toISOString(), allowlist: [ownerId],
      safeEnabled: true, adviserEnabled: true, rightsApproval: '1'.repeat(64), runtimeApproval: '2'.repeat(64),
      budgetApproval: '3'.repeat(64), budgetEvidenceSha256: '3'.repeat(64),
      budgetObservedAt: new Date().toISOString(), budgetExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      caseReservationUsd: 0.1, adviserReservationUsd: 0.01, observerReservationUsd: null,
      authenticitySubBudgetUsd: 2, authenticityHeadroomUsd: 0.4,
      runtimeDigest: `sha256:${'4'.repeat(64)}`, preprocessingHash: '5'.repeat(64),
      sourceHistoryHashes: options.unknownHistory ? [] : [state.row.input_hash] };
    return { eventId, payload: { caseId, revision: 1 } };
  }
  const providers = () => calls.map(call => call.provider);
  try {
    await t.test('original bytes pass real safety adapter, specialist binding, evidence compiler, adviser and private presentation', async () => {
      const input = await seed();
      const receipt = await fixture.run(input);
      assert.deepEqual(providers(), ['safety', 'specialist', 'reasoner']);
      assert.equal(receipt.evidenceMode, 'SYNTHETIC_TRANSPORT_TEST_ONLY');
      assert.equal(receipt.externalProviderCalls, 0);
      assert.equal(state.row.state, 'complete');
      assert.equal(state.row.result.finding, 'SYNTHETIC_LIKE_EVIDENCE');
      assert.equal(state.row.result.packet.safetyContext.role, 'SAFETY_CONTEXT_ONLY');
      assert.equal(state.row.result.recommendation.primaryHypothesis, 'INSUFFICIENT_EVIDENCE');
      assert.equal(state.row.result.authenticityEnforcementEnabled, false);
      assert.equal(state.detectorRuns.length, 1);
      assert.equal(state.measurement.billedUsd, null);
      assert.equal(receipt.view.detectorExecution, 'completed');
      assert.equal(receipt.view.publicationEligible, false);
      assert.equal(receipt.view.rewardsEligible, false);
      assert.doesNotMatch(JSON.stringify(receipt.view), /inputHash|rawScore|threshold|packet|checkpoint|quarantine\//);
      await fixture.run(input);
      assert.deepEqual(providers(), ['safety', 'specialist', 'reasoner'], 'terminal replay cannot execute another provider call');
    });
    await t.test('low specialist evidence never becomes human authorship or triggers an adviser', async () => {
      const receipt = await fixture.run(await seed({ low: true }));
      assert.deepEqual(providers(), ['safety', 'specialist']);
      assert.equal(receipt.view.finding, 'NO_POSITIVE_SAFE_EVIDENCE');
      assert.match(receipt.view.explanation, /does not establish human authorship/);
      assert.equal(state.row.result.recommendation.primaryHypothesis, 'INSUFFICIENT_EVIDENCE');
    });
    await t.test('unknown source history and JPEG withdraw interpretation even for a high specialist output', async () => {
      for (const options of [{ unknownHistory: true }, { jpeg: true }]) {
        const receipt = await fixture.run(await seed(options));
        assert.deepEqual(providers(), ['safety', 'specialist']);
        assert.equal(receipt.view.finding, 'INCONCLUSIVE');
        assert.equal(receipt.view.publicationEligible, false);
      }
    });
    await t.test('independent safety flags or failures stop authorship analysis', async () => {
      for (const options of [{ flagged: true }, { safetyFailure: true }]) {
        const receipt = await fixture.run(await seed(options));
        assert.deepEqual(providers(), ['safety']);
        assert.equal(state.row.state, 'safety_review');
        assert.equal(state.detectorRuns.length, 0);
        assert.equal(receipt.view.detectorExecution, 'not_recorded');
        assert.equal(receipt.view.finding, 'UNAVAILABLE');
      }
    });
    await t.test('disabled admission, forged event and missing budget make zero provider attempts', async () => {
      for (const options of [{ enabled: false }, { forged: true }, { budgetDenied: true }]) {
        const input = await seed(options);
        await fixture.run({ ...input, enabled: options.enabled });
        assert.deepEqual(providers(), []);
        assert.equal(state.detectorRuns.length, 0);
      }
    });
    await t.test('replaced private original bytes are rejected before any safety or specialist transport', async () => {
      const input = await seed();
      await fixture.quarantine.put(state.row.original_key, jpeg);
      const receipt = await fixture.run(input);
      assert.deepEqual(providers(), []);
      assert.equal(state.row.failure_code, 'beta_original_changed');
      assert.equal(state.detectorRuns.length, 0);
      assert.equal(receipt.view.finding, 'UNAVAILABLE');
    });
    await t.test('forged and unavailable specialist responses consume the attempt without replay or fictional output', async () => {
      for (const options of [{ forgedRun: true }, { specialistFailure: true }]) {
        const input = await seed(options);
        const receipt = await fixture.run(input);
        assert.deepEqual(providers(), ['safety', 'specialist']);
        assert.equal(state.steps.find(step => step.name === 'safe').state, 'ambiguous');
        assert.equal(state.detectorRuns.length, 0);
        assert.equal(receipt.view.detectorExecution, 'not_recorded');
        await fixture.run(input);
        assert.deepEqual(providers(), ['safety', 'specialist']);
      }
    });
    await t.test('rights/history withdrawal and revision changes invalidate late specialist output before persistence or advice', async () => {
      for (const options of [{ withdrawRights: true }, { withdrawHistory: true }, { staleRevision: true }]) {
        const receipt = await fixture.run(await seed(options));
        assert.deepEqual(providers(), ['safety', 'specialist']);
        assert.equal(state.row.result, null);
        assert.equal(state.detectorRuns.length, 0);
        assert.equal(receipt.view.finding, 'UNAVAILABLE');
      }
    });
    await t.test('reasoner overreach is discarded while deterministic uncertainty remains intact', async () => {
      const receipt = await fixture.run(await seed({ unsafeAdvice: true }));
      assert.deepEqual(providers(), ['safety', 'specialist', 'reasoner']);
      assert.equal(state.row.result.advisory.status, 'attempt_consumed');
      assert.equal(state.row.result.recommendation.primaryHypothesis, 'INSUFFICIENT_EVIDENCE');
      assert.equal(receipt.view.publicationEligible, false);
      assert.equal(receipt.view.rewardsEligible, false);
    });
    assert.deepEqual(fixture.outbound, []);
  } finally { await fixture.dispose(); }
});
