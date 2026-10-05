import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import pg from 'pg';
import { uuidv7 } from '@lythaus/security';
import { applyTagSearchProposal } from './tag-search-candidate.mjs';
import { runTagIndexBatch } from '../scripts/tag-search-index-maintenance.mjs';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
  || !(target.pathname.startsWith('/lythaus_content_test')
    || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) {
  throw new Error('Tag-index maintenance tests require explicitly local disposable PostgreSQL');
}

async function connect() {
  const client = new pg.Client({ connectionString, ssl: false });
  await client.connect();
  await client.query("SET statement_timeout='10s'");
  return client;
}

async function finish(client) {
  await client.end();
}

test('bounded backfill and reconciliation resume and repair only disposable index state', async () => {
  const client = await connect();
  const authorId = uuidv7();
  const postIds = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];
  const overLimitBody = Array.from({ length: 17 }, (_, index) => `#maintoverflow${index}`).join(' ');
  try {
    await applyTagSearchProposal(client);
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO identity.users(id,status,display_name)
       VALUES($1,'active','Synthetic tag-index maintenance author')`,
      [authorId],
    );
    await client.query(
      `INSERT INTO content.posts(id,author_id,body,declared_creation_mode,visibility,moderation_state,published_at)
       VALUES($1,$5,'Synthetic #maintenance #café body','human','public','allowed',now()),
             ($2,$5,'Synthetic post without any hashtags','human','public','allowed',now()-interval '1 second'),
             ($3,$5,'Synthetic repeated #maintenance #maintenance body','human','public','allowed',now()-interval '2 seconds'),
             ($4,$5,$6,'human','public','allowed',now()-interval '3 seconds')`,
      [...postIds, authorId, overLimitBody],
    );
    await client.query(
      `INSERT INTO content.content_declarations(post_id,declared_creation_mode,public_label)
       SELECT id,'human','Human-authored' FROM content.posts WHERE author_id=$1`,
      [authorId],
    );
    await client.query('COMMIT');

    await client.query(
      `UPDATE feed.tag_search_index_control
          SET backfill_cursor=NULL, backfill_post_count=0, backfill_restart_count=0,
              legacy_tag_limit_excluded_post_count=0, backfill_complete=false,
              reconciliation_cursor=NULL, reconciliation_post_count=0, reconciliation_restart_count=0,
              reconciliation_mismatch_count=0, reconciliation_complete=false,
              incomplete_post_count=0, search_enabled=false
        WHERE singleton=true`,
    );
    const recordedQueries = [];
    const recordingClient = new Proxy(client, {
      get(target, property) {
        if (property === 'query') return (...args) => {
          recordedQueries.push(args[0]);
          return target.query(...args);
        };
        return Reflect.get(target, property);
      },
    });
    const firstBatch = await runTagIndexBatch(recordingClient, 'backfill', 2);
    assert.equal(firstBatch.complete, false);
    assert.equal(firstBatch.processed, 2);
    assert.ok(firstBatch.cursor);
    assert.equal(recordedQueries.filter((sql) => String(sql).includes('feed.write_post_tag_search_index')).length, 1,
      'a maintenance batch writes all extracted rows in one database round trip');
    await finish(client);

    const resumed = await connect();
    try {
      let backfill = firstBatch;
      for (let batch = 0; !backfill.complete && batch < 100_000; batch += 1) {
        backfill = await runTagIndexBatch(resumed, 'backfill', 500);
        if (backfill.blocked) assert.fail(`backfill blocked: ${backfill.reason}`);
      }
      assert.equal(backfill.complete, true);
      const legacyPostCount = await resumed.query(
        `SELECT count(*)::integer AS count
           FROM content.posts post
           JOIN content.post_tag_search_state state ON state.post_id=post.id
          WHERE post.deleted_at IS NULL AND state.complete
            AND state.excluded_reason='legacy_tag_limit_exceeded'`,
      );
      assert.equal(backfill.excludedLegacyOverflowTotal, legacyPostCount.rows[0].count,
        'backfill reports the exact per-post legacy exclusion total');
      const tagRows = await resumed.query(
        `SELECT count(*)::integer AS count FROM content.post_tag_search_tokens
          WHERE post_id = ANY($1::uuid[]) AND tag_key='maintenance'`,
        [postIds],
      );
      assert.equal(tagRows.rows[0].count, 2, 'duplicate tags produce one side-table token per post');
      const excludedOverflow = await resumed.query(
        `SELECT state.complete, state.observed_distinct_count, state.excluded_reason,
                count(token.tag_key)::integer AS token_count,
                count(token.tag_key) FILTER (WHERE token.searchable)::integer AS searchable_count,
                count(token.tag_key) FILTER (WHERE token.exclusion_reason='legacy_tag_limit_exceeded')::integer AS excluded_count
           FROM content.post_tag_search_state state
           LEFT JOIN content.post_tag_search_tokens token ON token.post_id=state.post_id
          WHERE state.post_id=$1 GROUP BY state.post_id`,
        [postIds[3]],
      );
      assert.deepEqual(excludedOverflow.rows[0], {
        complete: true,
        observed_distinct_count: 17,
        excluded_reason: 'legacy_tag_limit_exceeded',
        token_count: 0,
        searchable_count: 0,
        excluded_count: 0,
      }, 'legacy overflow is explicit per-post metadata, while ordinary feed content is untouched');
      const legacyTally = await resumed.query(
        `SELECT legacy_tag_limit_excluded_post_count, incomplete_post_count
           FROM feed.tag_search_index_control WHERE singleton=true`,
      );
      assert.deepEqual({
        legacy: Number(legacyTally.rows[0].legacy_tag_limit_excluded_post_count),
        incomplete: Number(legacyTally.rows[0].incomplete_post_count),
      }, { legacy: legacyPostCount.rows[0].count, incomplete: 0 });

      await resumed.query(
        `UPDATE feed.tag_search_index_control
            SET reconciliation_cursor=NULL, reconciliation_post_count=0, reconciliation_restart_count=0,
                reconciliation_mismatch_count=0, reconciliation_complete=false
          WHERE singleton=true`,
      );
      let reconciliation = await runTagIndexBatch(resumed, 'reconcile', 2);
      assert.equal(reconciliation.complete, false);
      await finish(resumed);

      const restarted = await connect();
      try {
        for (let batch = 0; !reconciliation.complete && batch < 100_000; batch += 1) {
          reconciliation = await runTagIndexBatch(restarted, 'reconcile', 500);
          if (reconciliation.blocked) assert.fail(`reconciliation blocked: ${reconciliation.reason}`);
        }
        assert.equal(reconciliation.complete, true);
        const cleanReconciliation = await restarted.query(
          `SELECT reconciliation_mismatch_count FROM feed.tag_search_index_control WHERE singleton=true`,
        );
        assert.equal(Number(cleanReconciliation.rows[0].reconciliation_mismatch_count), 0,
          'a clean historical overflow is not a reconciliation mismatch');

        await restarted.query(
          `DELETE FROM content.post_tag_search_tokens
            WHERE post_id=$1::uuid AND tag_key='maintenance'`,
          [postIds[0]],
        );
        await restarted.query(
          `INSERT INTO content.post_tag_search_tokens(post_id,tag_key,indexed_published_at,searchable,exclusion_reason)
           VALUES($1::uuid,'maintoverflow0',NULL,true,NULL)`,
          [postIds[3]],
        );
        await restarted.query(
          `UPDATE feed.tag_search_index_control
              SET reconciliation_cursor=NULL, reconciliation_post_count=0, reconciliation_restart_count=0,
                  reconciliation_mismatch_count=0, reconciliation_complete=false
            WHERE singleton=true`,
        );
        let repaired = await runTagIndexBatch(restarted, 'reconcile', 2);
        for (let batch = 0; !repaired.complete && batch < 100_000; batch += 1) {
          if (repaired.blocked) assert.fail(`reconciliation blocked: ${repaired.reason}`);
          repaired = await runTagIndexBatch(restarted, 'reconcile', 500);
          if (!repaired.complete && repaired.processed === 0 && !repaired.restartSweep) {
            assert.fail('reconciliation repair made no progress');
          }
        }
        assert.equal(repaired.complete, true);
        const restored = await restarted.query(
          `SELECT count(*)::integer AS count FROM content.post_tag_search_tokens
            WHERE post_id=$1::uuid AND tag_key='maintenance'`,
          [postIds[0]],
        );
        assert.equal(restored.rows[0].count, 1);
        const repairedOverflow = await restarted.query(
          `SELECT count(*)::integer AS count FROM content.post_tag_search_tokens
            WHERE post_id=$1::uuid AND tag_key='maintoverflow0'`,
          [postIds[3]],
        );
        assert.deepEqual(repairedOverflow.rows[0], { count: 0 },
          'reconciliation removes stale tag rows from an explicitly excluded legacy post');
        const control = await restarted.query(
          `SELECT search_enabled, reconciliation_mismatch_count, incomplete_post_count
             FROM feed.tag_search_index_control WHERE singleton=true`,
        );
        assert.equal(control.rows[0].search_enabled, false, 'maintenance never activates search');
        assert.ok(Number(control.rows[0].reconciliation_mismatch_count) >= 2,
          'reconciliation separately detects missing ordinary tokens and stale legacy token rows');
        assert.equal(Number(control.rows[0].incomplete_post_count), 0);
      } finally {
        await finish(restarted);
      }
    } finally {
      await finish(resumed);
    }
  } finally {
    await client.query('DELETE FROM content.posts WHERE id=ANY($1::uuid[])', [postIds]).catch(() => undefined);
    await client.end().catch(() => undefined);
  }
});

test('backfill restarts once for behind-cursor state and blocks persistent no-progress', async () => {
  const client = await connect();
  const authorId = uuidv7();
  const postId = uuidv7();
  try {
    await applyTagSearchProposal(client);
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO identity.users(id,status,display_name) VALUES($1,'active','Synthetic cursor author')`,
      [authorId],
    );
    await client.query(
      `INSERT INTO content.posts(id,author_id,body,declared_creation_mode,visibility,moderation_state,published_at)
       VALUES($1,$2,'Synthetic #cursorbeforeedit','human','public','allowed',now())`,
      [postId, authorId],
    );
    await client.query(
      `INSERT INTO content.content_declarations(post_id,declared_creation_mode,public_label)
       VALUES($1,'human','Human-authored')`,
      [postId],
    );
    await client.query(
      `UPDATE feed.tag_search_index_control
          SET backfill_cursor=NULL,backfill_post_count=0,backfill_restart_count=0,
              legacy_tag_limit_excluded_post_count=0,backfill_complete=false,
              reconciliation_cursor=NULL,reconciliation_post_count=0,reconciliation_restart_count=0,
              reconciliation_mismatch_count=0,reconciliation_complete=false,
              incomplete_post_count=0,search_enabled=false WHERE singleton=true`,
    );
    await client.query('COMMIT');

    let initial;
    for (let batch = 0; batch < 100_000; batch += 1) {
      initial = await runTagIndexBatch(client, 'backfill', 500);
      if (initial.blocked) assert.fail(`initial backfill blocked: ${initial.reason}`);
      if (initial.complete) break;
      if (initial.processed === 0 && !initial.restartSweep) assert.fail('initial backfill made no progress');
    }
    assert.equal(initial.complete, true, 'initial sweep reaches a terminal cursor before the post is edited');
    await client.query(
      `UPDATE feed.tag_search_index_control
          SET backfill_cursor=(SELECT id FROM content.posts ORDER BY id DESC LIMIT 1),backfill_complete=false
        WHERE singleton=true`,
    );
    await client.query("UPDATE content.posts SET body='Synthetic #cursorafteredit' WHERE id=$1", [postId]);
    const behindCursor = await runTagIndexBatch(client, 'backfill', 500);
    assert.deepEqual({ processed: behindCursor.processed, restartSweep: behindCursor.restartSweep, incomplete: behindCursor.incomplete }, {
      processed: 0, restartSweep: true, incomplete: 1,
    });
    let repaired;
    for (let batch = 0; batch < 100_000; batch += 1) {
      repaired = await runTagIndexBatch(client, 'backfill', 500);
      if (repaired.blocked) assert.fail(`restart sweep blocked: ${repaired.reason}`);
      if (repaired.complete) break;
      if (repaired.processed === 0 && !repaired.restartSweep) assert.fail('restart sweep made no progress');
    }
    assert.equal(repaired.complete, true, JSON.stringify(repaired));
    const state = await client.query(
      `SELECT state.complete,state.excluded_reason,
              EXISTS (SELECT 1 FROM content.post_tag_search_tokens token
                       WHERE token.post_id=state.post_id AND token.tag_key='cursorafteredit') AS indexed
         FROM content.post_tag_search_state state WHERE state.post_id=$1`,
      [postId],
    );
    assert.deepEqual(state.rows[0], { complete: true, excluded_reason: null, indexed: true });

    await client.query(
      `UPDATE feed.tag_search_index_control
          SET backfill_cursor=(SELECT id FROM content.posts ORDER BY id DESC LIMIT 1),backfill_post_count=1,backfill_restart_count=0,
              legacy_tag_limit_excluded_post_count=0,backfill_complete=false,
              incomplete_post_count=1,search_enabled=false WHERE singleton=true`,
    );
    await client.query('UPDATE content.post_tag_search_state SET complete=false WHERE post_id=$1', [postId]);
    const stalledClient = new Proxy(client, {
      get(target, property) {
        if (property === 'query') return (text, values) => {
          if (String(text).includes('feed.write_post_tag_search_index')) return Promise.resolve({ rows: [], rowCount: 0 });
          return target.query(text, values);
        };
        return Reflect.get(target, property);
      },
    });
    const restart = await runTagIndexBatch(stalledClient, 'backfill', 500);
    assert.equal(restart.restartSweep, true);
    assert.equal(restart.processed, 0);
    let blocked;
    for (let batch = 0; batch < 100_000; batch += 1) {
      blocked = await runTagIndexBatch(stalledClient, 'backfill', 500);
      if (blocked.blocked || blocked.complete) break;
      if (blocked.processed === 0 && !blocked.restartSweep) assert.fail('persistent incomplete sweep made no progress');
    }
    assert.deepEqual({ complete: blocked.complete, blocked: blocked.blocked, reason: blocked.reason }, {
      complete: false, blocked: true, reason: 'post_tag_index_incomplete',
    }, 'one bounded restart is followed by an explicit blocked result rather than an infinite loop');
  } finally {
    await client.query('DELETE FROM content.posts WHERE id=$1', [postId]).catch(() => undefined);
    await client.end().catch(() => undefined);
  }
});

test('cap drift blocks maintenance and reapplied proposal resets readiness before restoring v3', async () => {
  const client = await connect();
  try {
    await applyTagSearchProposal(client);
    await client.query(
      `UPDATE feed.tag_search_index_control
          SET policy_approved=true,backfill_complete=true,reconciliation_complete=true,
              search_enabled=true,block_reason=NULL WHERE singleton=true`,
    );
    await client.query('ALTER TABLE feed.tag_search_index_control DROP CONSTRAINT tag_search_policy_cap_check');
    await client.query('UPDATE feed.tag_search_index_control SET max_distinct_tags_per_post=24 WHERE singleton=true');

    await assert.rejects(
      runTagIndexBatch(client, 'backfill', 1),
      /tag_search_policy_cap_mismatch/,
      'maintenance must not reconcile an index using a different cap from its pinned extractor policy',
    );

    await applyTagSearchProposal(client);
    const reset = await client.query(
      `SELECT policy_version,max_distinct_tags_per_post,policy_approved,
              backfill_complete,reconciliation_complete,search_enabled,block_reason
         FROM feed.tag_search_index_control WHERE singleton=true`,
    );
    assert.deepEqual(reset.rows[0], {
      policy_version: 'exact-token-proposal-v3',
      max_distinct_tags_per_post: 16,
      policy_approved: false,
      backfill_complete: false,
      reconciliation_complete: false,
      search_enabled: false,
      block_reason: 'tag_search_policy_or_cap_changed',
    });
    const constraint = await client.query(
      `SELECT convalidated FROM pg_constraint
        WHERE conrelid='feed.tag_search_index_control'::regclass
          AND conname='tag_search_policy_cap_check'`,
    );
    assert.deepEqual(constraint.rows, [{ convalidated: true }]);
  } finally {
    await applyTagSearchProposal(client).catch(() => undefined);
    await finish(client);
  }
});

test('maintenance refuses remote PostgreSQL targets before connecting', () => {
  const script = new URL('../scripts/tag-search-index-maintenance.mjs', import.meta.url).pathname;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', script, 'backfill', '--once'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PLANETSCALE_PG17_TEST_DATABASE_URL: 'postgresql://synthetic:synthetic@example.invalid/lythaus_content_test',
    },
  });
  assert.equal(result.status, 1);
  assert.match(`${result.stderr}${result.stdout}`, /refuses non-local or non-disposable/);
});
