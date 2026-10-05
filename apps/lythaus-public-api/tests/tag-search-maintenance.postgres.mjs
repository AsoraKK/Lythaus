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
  const postIds = [uuidv7(), uuidv7(), uuidv7()];
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
       VALUES($1,$4,'Synthetic #maintenance #café body','human','public','allowed',now()),
             ($2,$4,'Synthetic post without any hashtags','human','public','allowed',now()-interval '1 second'),
             ($3,$4,'Synthetic repeated #maintenance #maintenance body','human','public','allowed',now()-interval '2 seconds')`,
      [...postIds, authorId],
    );
    await client.query(
      `INSERT INTO content.content_declarations(post_id,declared_creation_mode,public_label)
       SELECT id,'human','Human-authored' FROM content.posts WHERE author_id=$1`,
      [authorId],
    );
    await client.query('COMMIT');

    await client.query(
      `UPDATE feed.tag_search_index_control
          SET backfill_cursor=NULL, backfill_post_count=0, backfill_complete=false,
              reconciliation_cursor=NULL, reconciliation_post_count=0,
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
      for (let batch = 0; !backfill.complete && batch < 10; batch += 1) {
        backfill = await runTagIndexBatch(resumed, 'backfill', 2);
      }
      assert.equal(backfill.complete, true);
      const tagRows = await resumed.query(
        `SELECT count(*)::integer AS count FROM content.post_tag_search_tokens
          WHERE post_id = ANY($1::uuid[]) AND tag_key='maintenance'`,
        [postIds],
      );
      assert.equal(tagRows.rows[0].count, 2, 'duplicate tags produce one side-table token per post');

      await resumed.query(
        `UPDATE feed.tag_search_index_control
            SET reconciliation_cursor=NULL, reconciliation_post_count=0,
                reconciliation_mismatch_count=0, reconciliation_complete=false
          WHERE singleton=true`,
      );
      let reconciliation = await runTagIndexBatch(resumed, 'reconcile', 2);
      assert.equal(reconciliation.complete, false);
      await finish(resumed);

      const restarted = await connect();
      try {
        for (let batch = 0; !reconciliation.complete && batch < 10; batch += 1) {
          reconciliation = await runTagIndexBatch(restarted, 'reconcile', 2);
        }
        assert.equal(reconciliation.complete, true);

        await restarted.query(
          `DELETE FROM content.post_tag_search_tokens
            WHERE post_id=$1::uuid AND tag_key='maintenance'`,
          [postIds[0]],
        );
        await restarted.query(
          `UPDATE feed.tag_search_index_control
              SET reconciliation_cursor=NULL, reconciliation_post_count=0,
                  reconciliation_mismatch_count=0, reconciliation_complete=false
            WHERE singleton=true`,
        );
        let repaired = await runTagIndexBatch(restarted, 'reconcile', 2);
        for (let batch = 0; !repaired.complete && batch < 10; batch += 1) {
          repaired = await runTagIndexBatch(restarted, 'reconcile', 1);
        }
        assert.equal(repaired.complete, true);
        const restored = await restarted.query(
          `SELECT count(*)::integer AS count FROM content.post_tag_search_tokens
            WHERE post_id=$1::uuid AND tag_key='maintenance'`,
          [postIds[0]],
        );
        assert.equal(restored.rows[0].count, 1);
        const control = await restarted.query(
          `SELECT search_enabled, reconciliation_mismatch_count, incomplete_post_count
             FROM feed.tag_search_index_control WHERE singleton=true`,
        );
        assert.equal(control.rows[0].search_enabled, false, 'maintenance never activates search');
        assert.ok(Number(control.rows[0].reconciliation_mismatch_count) >= 1);
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
