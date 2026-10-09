import { MONTHLY_REPUTATION_POLICY_VERSION } from './monthly-reputation-policy.ts';
import { PROSPECTIVE_REPUTATION_BANDS } from './monthly-reputation-prospective.ts';
import { MONTHLY_REWARDS_RESPONSE_PREPARATION } from './monthly-rewards-response-preparation.ts';

type Schema = Record<string, unknown>;
const closed = (properties: Record<string, Schema>): Schema => ({ type: 'object', additionalProperties: false,
  required: Object.keys(properties), properties });
const constant = (value: unknown): Schema => ({ const: value });
const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: 'null' }] });
const integer = (minimum: number, maximum = Number.MAX_SAFE_INTEGER): Schema => ({ type: 'integer', minimum, maximum });
const text: Schema = { type: 'string', minLength: 1, maxLength: 128 };
const reason: Schema = nullable({ type: 'string', pattern: '^[a-z][a-z0-9_]{0,99}$' });
const month: Schema = { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' };
const timestamp: Schema = nullable({ type: 'string', format: 'date-time',
  pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$' });
const digest: Schema = { type: 'string', pattern: '^[0-9a-f]{64}$' };
const list = (items: Schema): Schema => ({ type: 'array', items });
const ref = (name: string): Schema => ({ $ref: `#/definitions/${name}` });
const inherited: Schema = constant(MONTHLY_REPUTATION_POLICY_VERSION);
const metadata = Object.fromEntries(Object.entries(MONTHLY_REWARDS_RESPONSE_PREPARATION).map(([key, value]) => [key, constant(value)]));
const denied = closed({ state: constant('unavailable'), reasonCode: constant('activation_not_approved') });
const qualification = (maximum: 1_000 | 150, actionId: string): Schema => ({ oneOf: [false, true].map(qualifies => closed({
  actionId: constant(actionId), maximumPoints: constant(maximum), points: constant(qualifies ? maximum : 0),
  qualifies: constant(qualifies), reasonCode: reason, validFrom: timestamp, validUntil: timestamp,
  renewalRequired: nullable({ type: 'boolean' }),
})) });
const scored = (properties: Record<string, Schema>, levelKey = 'level'): Schema => ({ ...closed(properties),
  anyOf: PROSPECTIVE_REPUTATION_BANDS.map(band => ({ properties: {
    sourceScore: integer(band.minimum, band.maximum), [levelKey]: constant(band.level),
  } })),
});
const action = closed({ actionId: text, capGroup: nullable(text), allowance: nullable(integer(0, 2_500)),
  remainingInGroup: nullable(integer(0, 2_500)), points: integer(0, 2_500), accepted: nullable(integer(0)),
  pending: nullable(integer(0)), withheld: nullable(integer(0)), state: nullable(text), reasonCode: reason,
  evidenceCount: integer(0), validFrom: timestamp, validUntil: timestamp, policyVersion: inherited, dataVersion: constant(1) });
const week = closed({ startsAt: timestamp, endsAt: timestamp, points: integer(0, 2_500), revision: nullable(integer(1)),
  state: text, selected: { enum: [true, false, null] }, selectionReason: reason,
  earningPolicyVersion: inherited, rulesVersion: text, actions: list(action) });
const total = scored({ weeklyPoints: integer(0, 10_000), monthlyPoints: integer(0, 2_500), emailPoints: { enum: [0, 1_000] },
  suggestionPoints: { enum: [0, 150] }, quarterlyPoints: { enum: [0, 150, 1_000, 1_150] },
  sourceScore: integer(0, 13_650), calculatedLevel: integer(1, 5), maximumSourceMonth: constant(13_650) }, 'calculatedLevel');
const report = closed({ sourceRevision: integer(1), sourceReasonCode: reason, sourceRecordedAt: timestamp,
  assessmentMode: { enum: ['shadow', null] }, sourceDigest: digest, assemblyEvidenceDigest: digest,
  weekly: closed({ maximumPerWeek: constant(2_500), selectedWeekLimit: constant(4), maximumSelectedWeeklyPoints: constant(10_000),
    points: nullable(integer(0, 10_000)), earningPolicyVersion: inherited, rulesVersion: text,
    selectedWeeks: { ...list(week), maxItems: 4 }, omittedWeeks: list(week), missingWeeks: list(week), unassessedWeeks: list(week) }),
  monthly: closed({ maximumPoints: constant(2_500), points: integer(0, 2_500), maintenancePolicyVersion: inherited,
    rulesVersion: text, actions: list(action) }),
  quarterlyEmail: qualification(1_000, 'quarterly.email_control'), quarterlySuggestion: qualification(150, 'quarterly.suggestion'),
  quarterlyTotal: closed({ maximumPoints: constant(1_150), points: { enum: [0, 150, 1_000, 1_150] } }), total: nullable(total) });
const corrections = closed({
  sourceRevisions: list(closed({ sourceRevision: integer(2), reasonCode: reason, recordedAt: timestamp,
    sourceScore: nullable(integer(0, 13_650)), level: nullable(integer(1, 5)) })),
  effectiveSnapshots: list(scored({ revision: integer(2), mode: constant('shadow'), sourceRevision: integer(1),
    recordedAt: timestamp, sourceScore: integer(0, 13_650), level: integer(1, 5) })),
});
const projectionCommon = { reasonCode: reason, effectiveMonth: month };
const projection: Schema = { oneOf: [
  scored({ ...projectionCommon, state: constant('shadow'), sourceMonth: month, sourceScore: integer(0, 13_650),
    level: integer(1, 5), sourceRevision: integer(1), snapshotRevision: integer(1) }),
  closed({ ...projectionCommon, state: { enum: ['pending', 'unavailable'] }, sourceMonth: constant(null), sourceScore: constant(null),
    level: constant(null), sourceRevision: constant(null), snapshotRevision: constant(null) }),
] };

export const MONTHLY_REWARDS_RESPONSE_PREPARATION_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'urn:lythaus:monthly-rewards-response-v2-preparation',
  oneOf: [ref('MonthlyReputationReportResponsePreparation'), ref('MonthlyRewardsResponsePreparation')],
  definitions: {
    MonthlyReputationReportResponsePreparation: closed({ ...metadata, responseKind: constant('monthly_reputation_report'),
      reportState: { enum: ['pending', 'shadow'] }, reasonCode: reason, sourceMonth: month, effectiveMonth: month,
      levelAuthority: closed({ state: constant('unavailable'), reasonCode: constant('activation_not_approved'),
        effectiveMonth: month, sourceMonth: constant(null), sourceScore: constant(null), level: constant(null) }),
      snapshotProjection: projection, corrections, report: nullable(report) }),
    MonthlyRewardsResponsePreparation: closed({ ...metadata, responseKind: constant('monthly_rewards'),
      state: constant('pending'), reasonCode: constant('activation_not_approved'), effectiveMonth: month,
      currentLevel: constant(null), sourceMonth: constant(null), sourceScore: constant(null), snapshot: denied,
      selection: closed({ state: constant('unavailable'), reasonCode: constant('approval_unavailable') }), snapshotProjection: projection }),
  },
} as const;
