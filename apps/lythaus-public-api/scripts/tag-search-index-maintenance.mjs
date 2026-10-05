import pg from 'pg';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { extractHashtags, TAG_SEARCH_PROPOSED_MAX_DISTINCT_TAGS_PER_POST, TAG_SEARCH_PROPOSAL_VERSION } from '../src/tag-search-policy.ts';

const { Client } = pg;
const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '';
const target = new URL(connectionString || 'file:///missing');

function assertLocalDisposableTarget() {
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
    || !(target.pathname.startsWith('/lythaus_content_test')
      || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) {
    throw new Error('Tag-index maintenance refuses non-local or non-disposable PostgreSQL targets');
  }
}

function prepareExtracted(posts) {
  return posts.map((post) => {
    const extracted = extractHashtags(post.body, TAG_SEARCH_PROPOSED_MAX_DISTINCT_TAGS_PER_POST);
    return {
      post_id: post.id,
      tokens: extracted.tokens,
      observed_distinct_count: extracted.observedDistinctCount,
      complete: extracted.complete,
      extractor_version: TAG_SEARCH_PROPOSAL_VERSION,
    };
  });
}

async function applyExtractedBatch(client, extractedRows) {
  if (!extractedRows.length) return;
  await client.query(
    `SELECT feed.write_post_tag_search_index(
              row.post_id, row.tokens, row.observed_distinct_count, row.complete, row.extractor_version)
       FROM jsonb_to_recordset($1::jsonb) AS row(
         post_id uuid, tokens text[], observed_distinct_count integer, complete boolean, extractor_version text)`,
    [JSON.stringify(extractedRows)],
  );
}

async function countReconciliationMismatches(client, posts, extractedRows) {
  if (!posts.length) return 0;
  const result = await client.query(
    `SELECT target.post_id AS id, state.extractor_version, state.observed_distinct_count,
            state.complete, state.excluded_reason,
            COALESCE(array_agg(token.tag_key ORDER BY token.tag_key)
              FILTER (WHERE token.tag_key IS NOT NULL), ARRAY[]::text[]) AS tokens,
            COALESCE(array_agg(token.searchable ORDER BY token.tag_key)
              FILTER (WHERE token.tag_key IS NOT NULL), ARRAY[]::boolean[]) AS searchable_flags,
            COALESCE(array_agg(token.exclusion_reason ORDER BY token.tag_key)
              FILTER (WHERE token.tag_key IS NOT NULL), ARRAY[]::text[]) AS exclusion_reasons
       FROM unnest($1::uuid[]) AS target(post_id)
       LEFT JOIN content.post_tag_search_state state ON state.post_id = target.post_id
       LEFT JOIN content.post_tag_search_tokens token ON token.post_id = target.post_id
      GROUP BY target.post_id, state.extractor_version, state.observed_distinct_count,
               state.complete, state.excluded_reason`,
    [posts.map((post) => post.id)],
  );
  const storedById = new Map(result.rows.map((row) => [row.id, row]));
  return extractedRows.reduce((mismatches, expected) => {
    const current = storedById.get(expected.post_id);
    const expectedSearchable = expected.tokens.map(() => !expected.exceedsLimit);
    const expectedReasons = expected.tokens.map(() => expected.exceedsLimit ? 'tag_limit_exceeded' : null);
    const matches = current?.extractor_version === expected.extractor_version
      && current?.observed_distinct_count === expected.observed_distinct_count
      && current?.complete === expected.complete
      && current?.excluded_reason === (expected.exceedsLimit ? 'tag_limit_exceeded' : null)
      && JSON.stringify(current?.tokens ?? []) === JSON.stringify(expected.tokens)
      && JSON.stringify(current?.searchable_flags ?? []) === JSON.stringify(expectedSearchable)
      && JSON.stringify(current?.exclusion_reasons ?? []) === JSON.stringify(expectedReasons);
    return mismatches + (matches ? 0 : 1);
  }, 0);
}

async function beginBatch(client) {
  await client.query('BEGIN');
  await client.query("SET LOCAL statement_timeout='20s'");
  const control = await client.query(
    `SELECT backfill_cursor, backfill_complete, backfill_post_count,
            reconciliation_cursor, reconciliation_complete, reconciliation_post_count
       FROM feed.tag_search_index_control WHERE singleton = true FOR UPDATE`,
  );
  if (!control.rows[0]) throw new Error('tag search candidate control row is missing; apply the proposal in a disposable database first');
  return control.rows[0];
}

export async function runTagIndexBatch(client, mode, batchSize = 200) {
  if (!['backfill', 'reconcile'].includes(mode)) throw new Error('invalid tag-index operation');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new Error('tag-index batch size must be between 1 and 500');
  const cursorField = mode === 'backfill' ? 'backfill_cursor' : 'reconciliation_cursor';
  const completeField = mode === 'backfill' ? 'backfill_complete' : 'reconciliation_complete';
  const countField = mode === 'backfill' ? 'backfill_post_count' : 'reconciliation_post_count';

  const control = await beginBatch(client);
  try {
    if (control[completeField]) {
      await client.query('COMMIT');
      return { mode, complete: true, processed: 0, mismatches: 0, incomplete: 0, cursor: control[cursorField] };
    }
    const candidates = await client.query(
      `SELECT post.id, post.body
         FROM content.posts post
        WHERE post.deleted_at IS NULL
          AND ($1::uuid IS NULL OR post.id > $1::uuid)
        ORDER BY post.id
        LIMIT $2
        FOR UPDATE`,
      [control[cursorField], batchSize + 1],
    );
    const hasMore = candidates.rows.length > batchSize;
    const posts = candidates.rows.slice(0, batchSize);
    const extractedRows = prepareExtracted(posts);
    const mismatches = mode === 'reconcile'
      ? await countReconciliationMismatches(client, posts, extractedRows)
      : 0;
    await applyExtractedBatch(client, extractedRows);
    const nextCursor = posts.at(-1)?.id ?? control[cursorField] ?? null;
    const total = Number(control[countField]) + posts.length;
    if (hasMore) {
      await client.query(
        `UPDATE feed.tag_search_index_control
            SET ${cursorField} = $1::uuid, ${countField} = $2,
                ${mode === 'reconcile' ? 'reconciliation_mismatch_count = reconciliation_mismatch_count + $3,' : ''}
                updated_at = now()
          WHERE singleton = true`,
        mode === 'reconcile' ? [nextCursor, total, mismatches] : [nextCursor, total],
      );
      await client.query('COMMIT');
      return { mode, complete: false, processed: posts.length, mismatches, incomplete: null, cursor: nextCursor };
    }

    const incompletes = await client.query(
      `SELECT count(*)::integer AS count
         FROM content.posts post
         LEFT JOIN content.post_tag_search_state state ON state.post_id = post.id
        WHERE post.deleted_at IS NULL AND state.complete IS DISTINCT FROM true`,
    );
    const incomplete = Number(incompletes.rows[0]?.count ?? 0);
    await client.query(
      `UPDATE feed.tag_search_index_control
          SET ${cursorField} = $1::uuid,
              ${countField} = $2,
              ${completeField} = ($3::integer = 0),
              incomplete_post_count = $3,
              ${mode === 'reconcile' ? 'reconciliation_mismatch_count = reconciliation_mismatch_count + $4,' : 'reconciliation_complete = false, reconciliation_cursor = NULL,'}
              block_reason = CASE WHEN $3::integer > 0 THEN 'post_tag_index_incomplete' ELSE block_reason END,
              search_enabled = CASE WHEN $3::integer > 0 THEN false ELSE search_enabled END,
              updated_at = now()
        WHERE singleton = true`,
      mode === 'reconcile' ? [nextCursor, total, incomplete, mismatches] : [nextCursor, total, incomplete],
    );
    await client.query('COMMIT');
    return { mode, complete: incomplete === 0, processed: posts.length, mismatches, incomplete, cursor: nextCursor };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function main() {
  assertLocalDisposableTarget();
  const mode = process.argv[2];
  if (!['backfill', 'reconcile'].includes(mode)) throw new Error('usage: node --experimental-strip-types tag-search-index-maintenance.mjs <backfill|reconcile> [--batch-size=200] [--once] [--restart]');
  const batchArg = process.argv.find((argument) => argument.startsWith('--batch-size='));
  const batchSize = batchArg ? Number(batchArg.slice('--batch-size='.length)) : 200;
  const once = process.argv.includes('--once');
  const restart = process.argv.includes('--restart');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new Error('tag-index batch size must be between 1 and 500');

  const client = new Client({ connectionString, ssl: false });
  await client.connect();
  try {
    if (restart) {
      const cursor = mode === 'backfill' ? 'backfill_cursor' : 'reconciliation_cursor';
      const complete = mode === 'backfill' ? 'backfill_complete' : 'reconciliation_complete';
      const count = mode === 'backfill' ? 'backfill_post_count' : 'reconciliation_post_count';
      await client.query(
        `UPDATE feed.tag_search_index_control
            SET ${cursor} = NULL, ${complete} = false, ${count} = 0,
                ${mode === 'backfill' ? 'reconciliation_complete = false, reconciliation_cursor = NULL, reconciliation_post_count = 0, reconciliation_mismatch_count = 0,' : 'reconciliation_mismatch_count = 0,'}
                search_enabled = false, updated_at = now()
          WHERE singleton = true`,
      );
    }
    let result;
    do {
      result = await runTagIndexBatch(client, mode, batchSize);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      if (once || result.complete) break;
    } while (true);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
