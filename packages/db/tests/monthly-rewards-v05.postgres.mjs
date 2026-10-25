import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import pg from 'pg';
import { uuidv7 } from '@lythaus/security';
import { assembleProspectiveMonthlyRewards } from '../src/monthly-assembly.ts';
import { readOwnRewardsV05Candidate } from '../src/monthly-rewards-v05.ts';
import { recordRewardsV05ReconciliationAttempt } from '../src/monthly-rewards-v05.ts';
import { readMonthlyRewardsV05ForPassport, reconcileMonthlyRewardsV05DataLocations } from '../src/monthly-rewards-v05-privacy.ts';
import { REWARDS_V05_CONFIGURATION, MONTHLY_REWARDS_V05 } from '../../contracts/src/monthly-rewards-v05.ts';
import { PROPOSED_HUMAN_CONTRIBUTION_RULES as PROPOSED_WEEKLY_EARNING_RULES,
  calculateProposedWeeklyEarning } from '../../contracts/src/monthly-earning-policy.ts';
import { proposedClosingSundayWeeks } from '../../contracts/src/monthly-reputation-decisions.ts';
import { recordMonthlyEmailControl } from '../src/monthly-maintenance.ts';
import { PROPOSED_MONTHLY_MAINTENANCE_RULES } from '../../contracts/src/monthly-maintenance-policy.ts';
import { MONTHLY_REPUTATION_POLICY_VERSION, MONTHLY_REPUTATION_CATALOGUE_HASH } from '../../contracts/src/monthly-reputation-policy.ts';
import { handleMonthlyReputationRead } from '../../../apps/lythaus-public-api/src/monthly-reputation-routes.ts';

const target = new URL(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? 'file:///missing');
assert.equal(target.protocol, 'postgresql:');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
assert.ok(target.pathname === '/lythaus_monthly_test' || /^\/lythaus_auth_test_post_monthly_rewards_v05_[a-f0-9]{32}$/.test(target.pathname));
assert.equal(target.search, ''); assert.equal(target.hash, '');

test('prospective monthly candidates use canonical PG17 assembly without snapshot or claim authority', async t => {
  const client = new pg.Client({ connectionString: target.toString(), ssl: false });
  await client.connect();
  await client.query('BEGIN');
  try {
    assert.match((await client.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
    await client.query("SET LOCAL statement_timeout = '10s'");
    for (const name of ['monthly_reputation_shadow', 'monthly_reputation_earning', 'monthly_reputation_maintenance', 'monthly_rewards_v05']) {
      await client.query(readFileSync(new URL(`../../../database/planetscale/proposals/${name}.sql`, import.meta.url), 'utf8'));
    }
    await client.query('BEGIN');
    const sourceMonth = (await client.query("SELECT to_char(date_trunc('month', clock_timestamp() AT TIME ZONE 'UTC') - interval '1 month', 'YYYY-MM') AS month")).rows[0].month;
    const sourceStart = `${sourceMonth}-01T00:00:00.000Z`;
    const owner = uuidv7(), other = uuidv7();
    await client.query("INSERT INTO identity.users (id, display_name, created_at) VALUES ($1, 'Synthetic candidate', $3), ($2, 'Synthetic other', $3)", [owner, other, sourceStart]);
    for (const [table, rules] of [['monthly_earning_rule_sets', PROPOSED_WEEKLY_EARNING_RULES], ['monthly_maintenance_rule_sets', PROPOSED_MONTHLY_MAINTENANCE_RULES]]) {
      const privacyColumn = table === 'monthly_maintenance_rule_sets' ? ', collection_privacy_version' : '';
      const privacyValue = table === 'monthly_maintenance_rule_sets' ? ", 'monthly-privacy-v1'" : '';
      await client.query(`INSERT INTO trust.${table} (version, policy_version, catalogue_hash, mode, collect_from, configuration${privacyColumn})
        VALUES ($1,$2,$3,'shadow',$4::timestamptz - interval '1 month',$5::jsonb${privacyValue})`,
      [rules.version, MONTHLY_REPUTATION_POLICY_VERSION, MONTHLY_REPUTATION_CATALOGUE_HASH, sourceStart, JSON.stringify(rules)]);
    }
    const configuration = { ...REWARDS_V05_CONFIGURATION, prospectiveFrom: sourceStart, firstSourceMonth: sourceMonth,
      weeklyRulesVersion: PROPOSED_WEEKLY_EARNING_RULES.version, maintenanceRulesVersion: PROPOSED_MONTHLY_MAINTENANCE_RULES.version };
    await client.query(`INSERT INTO trust.monthly_rewards_v05_rule_sets (version, policy_version, collection_privacy_version, configuration)
      VALUES ($1,$2,'monthly-privacy-v1',$3::jsonb)`, [configuration.version, MONTHLY_REWARDS_V05, JSON.stringify(configuration)]);
    await client.query('GRANT SELECT ON system.feature_flags TO lythaus_jobs, lythaus_runtime');
    const setFlag = (flag, version, enabled) => client.query(`INSERT INTO system.feature_flags (flag_key, policy_version, enabled)
      VALUES ($1,$2,$3) ON CONFLICT (flag_key) DO UPDATE SET enabled = EXCLUDED.enabled`, [flag, version, enabled]);
    await setFlag('trust.monthly_reputation_shadow', MONTHLY_REPUTATION_POLICY_VERSION, true);
    const assemble = () => assembleProspectiveMonthlyRewards(client, { subjectUserId: owner, sourceMonth, rulesVersion: configuration.version });
    const role = async (name, work) => {
      assert.ok(['lythaus_jobs', 'lythaus_runtime', 'lythaus_privacy'].includes(name));
      await client.query(`SET LOCAL ROLE ${name}`);
      try { return await work(); } finally { await client.query('RESET ROLE'); }
    };
    const rejectsSql = async (sql, values, pattern) => {
      await client.query('SAVEPOINT expected_rejection');
      await assert.rejects(client.query(sql, values), pattern);
      await client.query('ROLLBACK TO SAVEPOINT expected_rejection');
    };
    await t.test('flag defaults off and performs no candidate write', async () => {
      assert.equal(await role('lythaus_jobs', assemble), null);
      assert.equal((await client.query('SELECT count(*)::integer AS count FROM trust.monthly_rewards_v05_candidates')).rows[0].count, 0);
    });
    await setFlag('trust.monthly_rewards_v05_preparation', MONTHLY_REWARDS_V05, true);
    await t.test('jobs role records a provisional candidate and identical replay reuses its revision', async () => {
      const first = await role('lythaus_jobs', assemble);
      assert.equal(first.created, true); assert.equal(first.report.state, 'provisional');
      assert.equal(first.report.redeemable, false); assert.equal(first.report.security.monthlyPoints, 0);
      assert.ok(first.report.finalisationBlockers.includes('suggestion_evidence_producer_unavailable'));
      assert.equal((await role('lythaus_jobs', assemble)).created, false);
      assert.equal((await client.query('SELECT count(*)::integer AS count FROM trust.monthly_rewards_v05_candidates')).rows[0].count, 1);
      assert.equal((await client.query('SELECT count(*)::integer AS count FROM trust.monthly_reputation_sources')).rows[0].count, 0);
    });
    const period = proposedClosingSundayWeeks(sourceMonth)[1], weekId = uuidv7();
    const contributions = Array.from({ length: 3 }, () => ({ id: uuidv7(), workId: uuidv7(), kind: 'post',
      performedAt: new Date(Date.parse(period.startsAt) + 12 * 3_600_000).toISOString(),
      state: 'accepted', creationMode: 'human', declarationValid: true }));
    const appendWeek = async (revision, extra = []) => {
      const calculated = calculateProposedWeeklyEarning({ subjectUserId: owner, startsAt: period.startsAt,
        evaluatedAt: new Date().toISOString(), rules: PROPOSED_WEEKLY_EARNING_RULES,
        contributions: [...contributions, ...extra], reception: [] });
      await client.query(`INSERT INTO trust.monthly_earning_week_revisions
        (id,week_id,subject_user_id,week_start,policy_version,rules_version,revision,state,points,calculation,input_digest)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
      [uuidv7(), weekId, owner, period.startsAt, MONTHLY_REPUTATION_POLICY_VERSION, PROPOSED_WEEKLY_EARNING_RULES.version,
        revision, revision === 1 ? 'locked' : 'corrected', calculated.points, JSON.stringify(calculated), 'a'.repeat(64)]);
      return calculated.points;
    };
    let weeklyPoints;
    await t.test('supported human weekly credit survives unavailable security and canonical email cutover gates', async () => {
      weeklyPoints = await appendWeek(1);
      assert.ok(weeklyPoints > 0);
      const proofId = uuidv7(), eventId = uuidv7();
      await client.query(`INSERT INTO identity.email_credentials
        (user_id,email_ciphertext,email_lookup_hmac,encryption_key_version,hmac_key_version,password_hash,verified_at)
        VALUES ($1,decode('00','hex'),decode(repeat('01',32),'hex'),'v1','v1','{}'::jsonb,$2)`, [owner, sourceStart]);
      await client.query(`INSERT INTO identity.email_verification_tokens (id,user_id,token_hash,created_at,expires_at,consumed_at)
        VALUES ($1,$2,decode(repeat('02',32),'hex'),$3::timestamptz - interval '1 minute',$3::timestamptz + interval '1 hour',$3)`, [proofId, owner, sourceStart]);
      await client.query(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload,created_at)
        VALUES ($1,'identity.email.verified','user',$2,$2,'{}'::jsonb,$3)`, [eventId, owner, sourceStart]);
      assert.equal((await role('lythaus_runtime', () => recordMonthlyEmailControl(client, {
        rulesVersion: PROPOSED_MONTHLY_MAINTENANCE_RULES.version, sourceEventId: eventId, verificationTokenId: proofId,
      }))).recorded, true);
      const result = await role('lythaus_jobs', assemble);
      assert.equal(result.created, true); assert.equal(result.report.weeklyPoints, weeklyPoints);
      assert.equal(result.report.security.monthlyPoints, 0); assert.equal(result.report.emailPoints, 0);
      assert.equal(result.report.inheritance.contributionEligibilityVersion, 'human-contributions-2026-10-v1');
      assert.ok(!result.report.finalisationBlockers.includes('prospective_weekly_eligibility_pending'));
    });
    await t.test('late corrected human week appends a candidate revision and leaves historical source authority untouched', async () => {
      const points = await appendWeek(2, [{ ...contributions[0], id: uuidv7(), workId: uuidv7(), kind: 'other_comment' }]);
      assert.ok(points > weeklyPoints);
      const result = await role('lythaus_jobs', assemble);
      assert.equal(result.created, true); assert.equal(result.report.weeklyPoints, points);
      assert.equal((await role('lythaus_jobs', assemble)).created, false);
      const rows = (await client.query('SELECT report FROM trust.monthly_rewards_v05_candidates ORDER BY revision')).rows;
      assert.equal(rows.length, 3); assert.equal(rows[1].report.weeklyPoints, weeklyPoints);
      assert.equal((await client.query('SELECT count(*)::integer AS count FROM trust.monthly_reputation_sources')).rows[0].count, 0);
    });
    await t.test('rule versions and candidate reports are immutable and cannot be made redeemable', async () => {
      await rejectsSql("UPDATE trust.monthly_rewards_v05_rule_sets SET configuration = jsonb_set(configuration,'{settlementHours}','96')", [], /rules_immutable/);
      await rejectsSql("UPDATE trust.monthly_rewards_v05_candidates SET report = jsonb_set(report,'{redeemable}','true')", [], /immutable/);
      await rejectsSql(`INSERT INTO trust.monthly_rewards_v05_candidates
        (id,subject_user_id,source_month,revision,rules_version,evidence_digest,report)
        SELECT $1,subject_user_id,source_month,2,rules_version,evidence_digest,jsonb_set(report,'{redeemable}','true')
        FROM trust.monthly_rewards_v05_candidates LIMIT 1`, [uuidv7()], /check constraint/);
    });
    await t.test('real private route exposes the principal candidate without selection configuration', async () => {
      const response = await role('lythaus_runtime', () => handleMonthlyReputationRead(new Request(`https://api.lythaus.test/api/rewards/me/monthly?subjectId=${other}`), {
        authenticate: async () => ({ userId: owner }), transaction: work => work(client),
        prospectiveRulesVersion: configuration.version, respond: (body, status) => Response.json(body, { status }),
      }));
      const body = await response.json();
      assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(body.prospective.state, 'provisional'); assert.equal(body.currentLevel, null);
      assert.equal(await role('lythaus_runtime', () => readOwnRewardsV05Candidate(client, { subjectId: other, version: configuration.version })), null);
    });
    await t.test('interrupted new assembly rolls back its candidate revision', async () => {
      const before = (await client.query('SELECT count(*)::integer AS count FROM trust.monthly_rewards_v05_candidates')).rows[0].count;
      await client.query('SAVEPOINT interrupted');
      await client.query('DELETE FROM trust.monthly_rewards_v05_candidates');
      await role('lythaus_jobs', assemble);
      await client.query('ROLLBACK TO SAVEPOINT interrupted');
      assert.equal((await client.query('SELECT count(*)::integer AS count FROM trust.monthly_rewards_v05_candidates')).rows[0].count, before);
    });
    await t.test('Jobs-only attempt writer rejects runtime writes, unknown rules and future months', async () => {
      assert.equal(await role('lythaus_jobs', () => recordRewardsV05ReconciliationAttempt(client, {
        subjectUserId: owner, sourceMonth, rulesVersion: configuration.version,
      })), true);
      await role('lythaus_runtime', () => rejectsSql('SELECT trust.record_monthly_rewards_v05_attempt($1,$2,$3,$4)',
        [uuidv7(), owner, `${sourceMonth}-01`, configuration.version], /permission denied/));
      assert.equal((await client.query("SELECT has_table_privilege('lythaus_runtime','trust.monthly_rewards_v05_reconciliation_attempts','INSERT') AS allowed")).rows[0].allowed, false);
      assert.equal(await role('lythaus_jobs', () => recordRewardsV05ReconciliationAttempt(client, {
        subjectUserId: owner, sourceMonth, rulesVersion: 'unknown',
      })), false);
      const futureMonth = (await client.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM') AS month")).rows[0].month;
      assert.equal(await role('lythaus_jobs', () => recordRewardsV05ReconciliationAttempt(client, {
        subjectUserId: owner, sourceMonth: futureMonth, rulesVersion: configuration.version,
      })), false);
    });
    await t.test('paused candidate-only privacy export includes all revisions and attempts with redacted owner-scoped inventory', async () => {
      await setFlag('trust.monthly_rewards_v05_preparation', MONTHLY_REWARDS_V05, false);
      const exported = await role('lythaus_privacy', () => readMonthlyRewardsV05ForPassport(client, owner));
      assert.equal(exported.state, 'included'); assert.equal(exported.candidates.length, 3);
      assert.equal(exported.reconciliationAttempts.length, 1);
      assert.equal(exported.candidates[1].weeklyPoints, weeklyPoints);
      assert.ok(exported.candidates.every(row => !Object.hasOwn(row, 'security') && row.redeemable === false));
      const otherExport = await role('lythaus_privacy', () => readMonthlyRewardsV05ForPassport(client, other));
      assert.equal(otherExport.candidates.length, 0); assert.equal(otherExport.reconciliationAttempts.length, 0);
      await role('lythaus_privacy', () => reconcileMonthlyRewardsV05DataLocations(client, owner));
      await client.query("UPDATE privacy.subject_data_locations SET deletion_state='retained' WHERE subject_id=$1 AND resource_reference='trust.monthly_rewards_v05_candidates'", [owner]);
      await role('lythaus_privacy', () => reconcileMonthlyRewardsV05DataLocations(client, owner));
      const inventory = (await client.query("SELECT resource_reference,authoritative_or_derived,deletion_state FROM privacy.subject_data_locations WHERE subject_id=$1 AND resource_reference LIKE 'trust.monthly_rewards_v05_%'", [owner])).rows;
      assert.equal(inventory.length, 4); assert.ok(inventory.every(row => row.authoritative_or_derived === 'derived'));
      assert.ok(inventory.filter(row => row.resource_reference.endsWith('candidates')).every(row => row.deletion_state === 'retained'));
      await setFlag('trust.monthly_rewards_v05_preparation', MONTHLY_REWARDS_V05, true);
    });
    await t.test('subject deletion erases the sidecar and cannot be resurrected', async () => {
      await client.query("UPDATE identity.users SET status = 'deleted', deleted_at = clock_timestamp() WHERE id = $1", [owner]);
      assert.equal(await role('lythaus_jobs', assemble), null);
      assert.equal((await client.query('SELECT count(*)::integer AS count FROM trust.monthly_rewards_v05_candidates')).rows[0].count, 0);
      assert.equal((await client.query('SELECT count(*)::integer AS count FROM trust.monthly_rewards_v05_reconciliation_attempts')).rows[0].count, 0);
      await role('lythaus_privacy', () => reconcileMonthlyRewardsV05DataLocations(client, owner));
      assert.equal((await client.query("SELECT count(*)::integer AS count FROM privacy.subject_data_locations WHERE subject_id=$1 AND resource_reference LIKE 'trust.monthly_rewards_v05_%'", [owner])).rows[0].count, 0);
      const exported = await role('lythaus_privacy', () => readMonthlyRewardsV05ForPassport(client, owner));
      assert.equal(exported.candidates.length, 0); assert.equal(exported.reconciliationAttempts.length, 0);
    });
  } finally { await client.query('ROLLBACK'); await client.end(); }
});
