import assert from 'node:assert/strict';
import test from 'node:test';

import { recordReputationSignal, refreshReputationProfile } from '../src/reputation.ts';

const USER_ID = '018f5f2c-7b3a-7cc1-8db3-111111111111';
const CONTENT_ID = '018f5f2c-7b3a-7cc1-8db3-222222222222';

function eventRow(input) {
  return {
    id: input.id,
    subject_user_id: input.subjectUserId,
    content_id: input.contentId ?? null,
    event_type: input.signalType,
    pillar: input.pillar ?? null,
    impact: String(input.impact),
    policy_version: 'reputation-v2.0.0',
    source_event_id: input.sourceEventId,
    moderation_decision_id: input.moderationDecisionId ?? null,
    appeal_id: input.appealId ?? null,
    status: input.status ?? 'effective',
    explanation_code: input.explanationCode ?? input.signalType,
    reversal_reference: input.reversalReference ?? null,
    created_at: input.occurredAt,
    effective_at: input.occurredAt,
  };
}

class FakeClient {
  constructor(options = {}) {
    this.userExists = options.userExists ?? true;
    this.userStatus = options.userStatus ?? 'active';
    this.verified = options.verified ?? true;
    this.declared = options.declared ?? true;
    this.serious = options.serious ?? false;
    this.restricted = options.restricted ?? false;
    this.investigation = options.investigation ?? false;
    this.antiGaming = options.antiGaming ?? true;
    this.createdAt = options.createdAt ?? '2025-01-01T00:00:00.000Z';
    this.profileLevel = options.profileLevel ?? 0;
    this.events = [...(options.events ?? [])];
    this.profileWrites = [];
    this.balanceWrites = [];
  }

  result(rows = [], rowCount = rows.length) {
    return { rows, rowCount };
  }

  aggregate() {
    const effective = this.events.filter((event) => event.status === 'effective');
    const pillar = (name) => effective
      .filter((event) => event.pillar === name)
      .reduce((sum, event) => sum + Number(event.impact), 0);
    const positive = effective.filter((event) => Number(event.impact) > 0);
    const days = new Set(positive.map((event) => event.effective_at.slice(0, 10)));
    const weeks = new Set(positive.map((event) => {
      const date = new Date(event.effective_at);
      const day = (date.getUTCDay() + 6) % 7;
      date.setUTCDate(date.getUTCDate() - day);
      return date.toISOString().slice(0, 10);
    }));
    return {
      total_score: String(effective.reduce((sum, event) => sum + Number(event.impact), 0)),
      accountability: String(pillar('accountability')),
      contribution: String(pillar('contribution')),
      conduct: String(pillar('conduct')),
      sourcing: String(pillar('sourcing')),
      authenticity: String(pillar('authenticity')),
      review_reliability: String(pillar('reviewReliability')),
      active_days: days.size,
      active_weeks: weeks.size,
      qualifying_human_contributions: effective.filter((event) => event.event_type === 'qualifying_human_contribution' && Number(event.impact) > 0).length,
    };
  }

  async query(text, values = []) {
    if (text.includes('SELECT status FROM identity.users') && text.includes('FOR UPDATE')) {
      return this.result(this.userExists ? [{ status: this.userStatus }] : []);
    }
    if (text.includes('FROM trust.reputation_events') && text.includes('source_event_id = $2') && text.includes('event_type = $3')) {
      const row = this.events.find((event) => event.subject_user_id === values[0]
        && event.source_event_id === values[1]
        && event.event_type === values[2]);
      return this.result(row ? [row] : []);
    }
    if (text.includes('SELECT current_level FROM trust.reputation_profiles')) {
      return this.result(this.profileLevel === null ? [] : [{ current_level: this.profileLevel }]);
    }
    if (text.includes('FROM identity.users users')) {
      if (!this.userExists) return this.result([]);
      return this.result([{
        status: this.userStatus,
        created_at: this.createdAt,
        verified_registered_account: this.verified,
        accountability_identity_declared: this.declared,
        unresolved_serious_enforcement: this.serious,
        active_feature_restriction: this.restricted,
        manipulation_investigation: this.investigation,
        anti_gaming_eligible: this.antiGaming,
      }]);
    }
    if (text.includes('COALESCE(sum(impact)') && text.includes('qualifying_human_contributions')) {
      return this.result([this.aggregate()]);
    }
    if (text.includes('INSERT INTO trust.reputation_profiles')) {
      this.profileLevel = values[2];
      this.profileWrites.push(values);
      return this.result([], 1);
    }
    if (text.includes('INSERT INTO trust.reputation_balances')) {
      this.balanceWrites.push(values);
      return this.result([], 1);
    }
    if (text.includes('count(*)::integer AS occurrence_count')) {
      const sameType = this.events.filter((event) => event.subject_user_id === values[0] && event.event_type === values[1]);
      if (values.length === 2) return this.result([{ occurrence_count: sameType.filter((event) => event.status === 'effective').length }]);
      const day = String(values[2]).slice(0, 10);
      return this.result([{ occurrence_count: sameType.filter((event) => event.effective_at.slice(0, 10) === day).length }]);
    }
    if (text.includes('WHERE id = $1 AND subject_user_id = $2') && text.includes('FOR UPDATE')) {
      const row = this.events.find((event) => event.id === values[0] && event.subject_user_id === values[1]);
      return this.result(row ? [row] : []);
    }
    if (text.includes("UPDATE trust.reputation_events SET status = 'reversed'")) {
      const row = this.events.find((event) => event.id === values[0]);
      if (row) row.status = 'reversed';
      return this.result([], row ? 1 : 0);
    }
    if (text.includes('INSERT INTO trust.reputation_events')) {
      const duplicate = this.events.some((event) => event.id === values[0]
        || (event.subject_user_id === values[1] && event.source_event_id === values[7] && event.event_type === values[3]));
      if (duplicate) return this.result([], 0);
      const row = {
        id: values[0],
        subject_user_id: values[1],
        content_id: values[2],
        event_type: values[3],
        pillar: values[4],
        impact: String(values[5]),
        policy_version: values[6],
        source_event_id: values[7],
        moderation_decision_id: values[8],
        appeal_id: values[9],
        status: values[10],
        effective_at: values[11],
        explanation_code: values[12],
        reversal_reference: values[13],
        created_at: values[11],
      };
      this.events.push(row);
      return this.result([row]);
    }
    throw new Error(`Unhandled SQL in fake client: ${text.slice(0, 100)}`);
  }
}

function signal(overrides = {}) {
  return {
    id: '018f5f2c-7b3a-7cc1-8db3-300000000001',
    subjectUserId: USER_ID,
    signalType: 'qualifying_human_contribution',
    sourceEventId: '018f5f2c-7b3a-7cc1-8db3-400000000001',
    contentId: CONTENT_ID,
    occurredAt: '2026-08-10T08:00:00.000Z',
    ...overrides,
  };
}

test('persists an eligible signal and recomputes the authoritative profile', async () => {
  const client = new FakeClient();
  const result = await recordReputationSignal(client, signal());
  assert.equal(result.created, true);
  assert.equal(result.event.impact, 10);
  assert.equal(result.event.pillar, 'contribution');
  assert.equal(result.disposition, 'positive');
  assert.equal(result.profile.pillarScores.accountability, 70);
  assert.equal(result.profile.pillarScores.conduct, 100);
  assert.equal(client.profileWrites.length, 1);
  assert.equal(client.balanceWrites.length, 1);
});

test('replays the canonical event without inserting a second mutation', async () => {
  const input = signal();
  const client = new FakeClient({ events: [eventRow({ ...input, pillar: 'contribution', impact: 10 })] });
  const result = await recordReputationSignal(client, input);
  assert.equal(result.created, false);
  assert.equal(result.event.sourceEventId, input.sourceEventId);
  assert.equal(client.events.length, 1);
});

test('applies diminishing returns and withholds high-frequency farming', async () => {
  const client = new FakeClient();
  const impacts = [];
  for (let index = 0; index < 7; index += 1) {
    const result = await recordReputationSignal(client, signal({
      id: `018f5f2c-7b3a-7cc1-8db3-30000000000${index + 1}`,
      sourceEventId: `018f5f2c-7b3a-7cc1-8db3-40000000000${index + 1}`,
    }));
    impacts.push(result.event.impact);
  }
  assert.deepEqual(impacts, [10, 5, 5, 3, 3, 3, 0]);
  assert.equal(client.events.at(-1).status, 'withheld');
});

test('withholds normal positive earnings while suspended', async () => {
  const client = new FakeClient({ userStatus: 'suspended' });
  const result = await recordReputationSignal(client, signal());
  assert.equal(result.disposition, 'withheld');
  assert.equal(result.event.explanationCode, 'normal_earning_suspended');
  assert.equal(result.profile.status, 'suspended');
});

test('one-time accountability signals cannot be awarded twice while effective', async () => {
  const first = signal({
    signalType: 'email_verified',
    contentId: undefined,
    sourceEventId: '018f5f2c-7b3a-7cc1-8db3-500000000001',
  });
  const client = new FakeClient();
  const awarded = await recordReputationSignal(client, first);
  const withheld = await recordReputationSignal(client, {
    ...first,
    id: '018f5f2c-7b3a-7cc1-8db3-300000000009',
    sourceEventId: '018f5f2c-7b3a-7cc1-8db3-500000000002',
  });
  assert.equal(awarded.event.impact, 5);
  assert.equal(withheld.event.impact, 0);
  assert.equal(withheld.disposition, 'withheld');
});

test('reversal marks the source and compensating event as reversed', async () => {
  const original = eventRow({
    id: '018f5f2c-7b3a-7cc1-8db3-600000000001',
    subjectUserId: USER_ID,
    signalType: 'confirmed_spam',
    sourceEventId: '018f5f2c-7b3a-7cc1-8db3-600000000002',
    contentId: CONTENT_ID,
    pillar: 'conduct',
    impact: -20,
    occurredAt: '2026-08-09T08:00:00.000Z',
  });
  const client = new FakeClient({ events: [original], profileLevel: 2 });
  const result = await recordReputationSignal(client, signal({
    signalType: 'reputation_event_reversal',
    sourceEventId: '018f5f2c-7b3a-7cc1-8db3-600000000003',
    reversalReference: original.id,
    appealId: '018f5f2c-7b3a-7cc1-8db3-600000000004',
  }));
  assert.equal(original.status, 'reversed');
  assert.equal(result.event.status, 'reversed');
  assert.equal(result.event.impact, 20);
  assert.equal(result.event.pillar, 'conduct');
  assert.equal(result.disposition, 'reversed');
});

test('refresh exposes restriction and investigation states deterministically', async () => {
  const restricted = await refreshReputationProfile(new FakeClient({ serious: true, profileLevel: null }), USER_ID);
  assert.equal(restricted.previousLevel, 0);
  assert.equal(restricted.profile.status, 'restricted');
  const investigated = await refreshReputationProfile(new FakeClient({ investigation: true }), USER_ID);
  assert.equal(investigated.profile.status, 'under_investigation');
  const featureRestricted = await refreshReputationProfile(new FakeClient({ restricted: true }), USER_ID);
  assert.equal(featureRestricted.profile.status, 'restricted');
});

test('rejects invalid event identity, time and reversal references', async () => {
  await assert.rejects(() => recordReputationSignal(new FakeClient(), signal({ occurredAt: 'not-a-date' })), /reputation_event_time_invalid/);
  await assert.rejects(() => recordReputationSignal(new FakeClient({ userExists: false }), signal()), /reputation_subject_not_found/);
  await assert.rejects(() => recordReputationSignal(new FakeClient(), signal({ signalType: 'reputation_event_reversal' })), /reputation_reversal_reference_required/);
  await assert.rejects(() => recordReputationSignal(new FakeClient(), signal({
    signalType: 'reputation_event_reversal',
    reversalReference: '018f5f2c-7b3a-7cc1-8db3-999999999999',
  })), /reputation_reversal_reference_invalid/);
});
