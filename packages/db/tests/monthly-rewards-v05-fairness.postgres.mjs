import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import pg from 'pg';
import { uuidv7 } from '@lythaus/security';
import { rewardsV05ReconciliationCandidates, recordRewardsV05ReconciliationAttempt, assembleRewardsV05Candidate } from '../src/monthly-rewards-v05.ts';
import { reconcileMonthlyRewardsV05DataLocations } from '../src/monthly-rewards-v05-privacy.ts';
import { REWARDS_V05_CONFIGURATION, MONTHLY_REWARDS_V05 } from '../../contracts/src/monthly-rewards-v05.ts';
import { PROPOSED_HUMAN_CONTRIBUTION_RULES as weekly, PROPOSED_WEEKLY_EARNING_RULES as historical } from '../../contracts/src/monthly-earning-policy.ts';
import { PROPOSED_MONTHLY_MAINTENANCE_RULES as maintenance } from '../../contracts/src/monthly-maintenance-policy.ts';
import { MONTHLY_REPUTATION_POLICY_VERSION as policy, MONTHLY_REPUTATION_CATALOGUE_HASH as hash } from '../../contracts/src/monthly-reputation-policy.ts';
import { proposedClosingSundayWeeks } from '../../contracts/src/monthly-reputation-decisions.ts';

const target = new URL(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? 'file:///missing');
assert.equal(target.protocol, 'postgresql:'); assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
assert.ok(target.pathname === '/lythaus_monthly_test' || /^\/lythaus_auth_test_post_monthly_rewards_v05_fairness_[a-f0-9]{32}$/.test(target.pathname));
assert.equal(target.search, ''); assert.equal(target.hash, '');
const connect = async () => { const client = new pg.Client({ connectionString: target.toString(), ssl: false }); await client.connect(); return client; };
const tx = async (work, role = 'lythaus_jobs') => {
  const client = await connect();
  try {
    await client.query('BEGIN'); await client.query("SET LOCAL statement_timeout='10s'");
    assert.ok(['lythaus_jobs','lythaus_privacy'].includes(role)); await client.query(`SET LOCAL ROLE ${role}`);
    const result = await work(client); await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { await client.end(); }
};
test('PG17 reconciliation progress survives absent candidates, failed assembly, interruption and concurrent retries', async t => {
  const setup = await connect(), subjects = [];
  try {
    assert.match((await setup.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
    for (const name of ['monthly_reputation_shadow','monthly_reputation_earning','monthly_reputation_maintenance','monthly_rewards_v05']) {
      await setup.query(readFileSync(new URL(`../../../database/planetscale/proposals/${name}.sql`, import.meta.url), 'utf8'));
    }
    const clock = (await setup.query(`SELECT to_char(date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')-interval '1 month','YYYY-MM') AS month,
      to_char(date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')-interval '3 months','YYYY-MM') AS first_month`)).rows[0];
    const configuration = { ...REWARDS_V05_CONFIGURATION, firstSourceMonth: clock.first_month,
      prospectiveFrom: `${clock.first_month}-01T00:00:00.000Z`, weeklyRulesVersion: weekly.version, maintenanceRulesVersion: maintenance.version };
    for (const [table, rules] of [['monthly_earning_rule_sets', weekly],['monthly_earning_rule_sets', historical],['monthly_maintenance_rule_sets', maintenance]]) {
      await setup.query(`INSERT INTO trust.${table} (version,policy_version,catalogue_hash,mode,collect_from,configuration${table === 'monthly_maintenance_rule_sets' ? ',collection_privacy_version' : ''})
        VALUES ($1,$2,$3,'shadow',$4::timestamptz - interval '1 month',$5::jsonb${table === 'monthly_maintenance_rule_sets' ? ",'monthly-privacy-v1'" : ''})`,
      [rules.version,policy,hash,`${clock.month}-01`,JSON.stringify(rules)]);
    }
    await setup.query(`INSERT INTO trust.monthly_rewards_v05_rule_sets VALUES ($1,$2,'monthly-privacy-v1',$3::jsonb)`,
      [configuration.version,MONTHLY_REWARDS_V05,JSON.stringify(configuration)]);
    await setup.query(`INSERT INTO system.feature_flags(flag_key,policy_version,enabled) VALUES
      ('trust.monthly_reputation_shadow',$1,true),('trust.monthly_rewards_v05_preparation',$2,true)
      ON CONFLICT(flag_key) DO UPDATE SET enabled=true`, [policy,MONTHLY_REWARDS_V05]);
    const createSubjects = async createdAt => {
      const group = Array.from({ length: 61 }, () => uuidv7()).sort(); subjects.push(...group);
      await setup.query("INSERT INTO identity.users(id,display_name,created_at) SELECT id,'Synthetic fair scheduler',$2 FROM unnest($1::uuid[]) id", [group,createdAt]);
      return group;
    };
    const mark = row => tx(client => recordRewardsV05ReconciliationAttempt(client, { subjectUserId: row.subject_user_id,
      sourceMonth: row.source_month, rulesVersion: configuration.version }));
    const batch = () => tx(client => rewardsV05ReconciliationCandidates(client, configuration));
    const run = async () => {
      const selected = await batch(); let created = 0, absent = 0, failed = 0;
      assert.ok(selected.length <= 50);
      for (const row of selected) {
        assert.equal(await mark(row), true);
        try {
          const result = await tx(client => assembleRewardsV05Candidate(client, {
            subjectUserId: row.subject_user_id, sourceMonth: row.source_month, version: configuration.version,
          }));
          if (!result) absent++; else if (result.created) created++;
        } catch (error) { assert.match(error.message, /week_policy_mismatch/); failed++; }
      }
      return { selected, created, absent, failed };
    };
    await t.test('first 50 pre-collection pairs return null but the next batch reaches eligible pairs', async () => {
      const group = await createSubjects(`${clock.first_month}-01`);
      const first = await run(); assert.equal(first.absent,50); assert.equal(first.created,0);
      const second = await run(); assert.equal(second.created,39); assert.equal(second.absent,11);
      assert.equal(new Set([...first.selected,...second.selected].filter(row => row.source_month === clock.first_month).map(row => row.subject_user_id)).size,61);
      await setup.query('DELETE FROM identity.users WHERE id=ANY($1::uuid[])',[group]);
    });
    await t.test('first 50 policy mismatches roll back without starving later eligible accounts', async () => {
      const group = await createSubjects(`${clock.month}-01`), period = proposedClosingSundayWeeks(clock.month)[1];
      for (const id of group.slice(0,50)) {
        await setup.query(`INSERT INTO trust.monthly_earning_week_revisions
          (id,week_id,subject_user_id,week_start,policy_version,rules_version,revision,state,points,calculation,input_digest)
          VALUES ($1,$2,$3,$4,$5,$6,1,'locked',0,$7::jsonb,$8)`,
        [uuidv7(),uuidv7(),id,period.startsAt,policy,historical.version,JSON.stringify({policyVersion:policy,rulesVersion:historical.version,points:0}),'a'.repeat(64)]);
      }
      const first=await run(); assert.equal(first.failed,50); assert.equal(first.created,0);
      const second=await run(); assert.equal(second.created,11); assert.equal(second.failed,39);
      const count=(await setup.query('SELECT count(*)::integer AS count FROM trust.monthly_rewards_v05_reconciliation_attempts')).rows[0].count;
      assert.equal(count,61);
      await setup.query('DELETE FROM identity.users WHERE id=ANY($1::uuid[])',[group]);
    });
    await t.test('a committed attempt survives interrupted candidate work and concurrent increments keep one stable row', async () => {
      const id=uuidv7(); subjects.push(id);
      await setup.query("INSERT INTO identity.users(id,display_name,created_at) VALUES($1,'Synthetic interrupted scheduler',$2)",[id,`${clock.month}-01`]);
      const row={subject_user_id:id,source_month:clock.month}; assert.equal(await mark(row),true);
      await assert.rejects(tx(async client => {
        assert.equal((await assembleRewardsV05Candidate(client,{subjectUserId:id,sourceMonth:clock.month,version:configuration.version})).created,true);
        throw new Error('synthetic_interruption');
      }),/synthetic_interruption/);
      assert.equal((await setup.query('SELECT count(*)::integer AS count FROM trust.monthly_rewards_v05_candidates WHERE subject_user_id=$1',[id])).rows[0].count,0);
      const before=(await setup.query('SELECT id,attempted_at FROM trust.monthly_rewards_v05_reconciliation_attempts WHERE subject_user_id=$1',[id])).rows[0];
      assert.deepEqual(await Promise.all([mark(row),mark(row)]),[true,true]);
      const after=(await setup.query('SELECT id,attempted_at,attempt_count::text FROM trust.monthly_rewards_v05_reconciliation_attempts WHERE subject_user_id=$1',[id])).rows[0];
      assert.equal(after.id,before.id); assert.equal(after.attempt_count,'3'); assert.ok(after.attempted_at>=before.attempted_at);
      await tx(client=>assembleRewardsV05Candidate(client,{subjectUserId:id,sourceMonth:clock.month,version:configuration.version}));
      await Promise.all([tx(client=>reconcileMonthlyRewardsV05DataLocations(client,id),'lythaus_privacy'),
        tx(client=>reconcileMonthlyRewardsV05DataLocations(client,id),'lythaus_privacy')]);
      assert.equal((await setup.query("SELECT count(*)::integer AS count FROM privacy.subject_data_locations WHERE subject_id=$1 AND resource_reference LIKE 'trust.monthly_rewards_v05_%'",[id])).rows[0].count,2);
    });
  } finally {
    await setup.query("DELETE FROM privacy.subject_data_locations WHERE subject_id=ANY($1::uuid[]) AND resource_reference LIKE 'trust.monthly_rewards_v05_%'",[subjects]);
    await setup.query('DELETE FROM identity.users WHERE id=ANY($1::uuid[])',[subjects]); await setup.end();
  }
});
