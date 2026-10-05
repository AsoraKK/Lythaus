import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { uuidv7 } from '@lythaus/security';
import { TAGGED_DISCOVERY_SQL } from '../src/tag-search-query.ts';
import { applyTagSearchProposal } from './tag-search-candidate.mjs';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
  || !(target.pathname.startsWith('/lythaus_content_test')
    || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) {
  throw new Error('Tag search scale tests require explicitly local disposable PostgreSQL');
}

test('candidate tagged discovery uses the exact-token B-tree at constrained representative scale', async () => {
  const syntheticRows = 75_000;
  const commonTag = `scaleprobe${randomUUID().replaceAll('-', '')}`;
  const missingTag = `${commonTag}_missing`;
  const authorId = uuidv7();
  const client = new pg.Client({ connectionString, ssl: false });
  await client.connect();
  try {
    await applyTagSearchProposal(client);
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout='20s'");
    await client.query("SET LOCAL work_mem='4MB'");
    await client.query("SET LOCAL temp_file_limit='64MB'");
    await client.query('SET LOCAL max_parallel_workers_per_gather=0');
    await client.query(
      "INSERT INTO identity.users(id,status,display_name) VALUES($1,'active','Synthetic scale author')",
      [authorId],
    );
    await client.query(
      `INSERT INTO content.posts
         (id,author_id,body,declared_creation_mode,visibility,moderation_state,published_at)
       SELECT gen_random_uuid(),$1,'Synthetic published body with a common tag','human','public','allowed',
              now() - make_interval(secs => series.n)
         FROM generate_series(1,$2) AS series(n)`,
      [authorId, syntheticRows],
    );
    await client.query(
      `INSERT INTO content.content_declarations(post_id,declared_creation_mode,public_label)
       SELECT id,'human','Human-authored' FROM content.posts WHERE author_id=$1`,
      [authorId],
    );
    const inserted = await client.query(
      `INSERT INTO content.post_tag_search_state(post_id,extractor_version,observed_distinct_count,complete)
       SELECT id,'exact-token-proposal-v2',1,true FROM content.posts WHERE author_id=$1
       ON CONFLICT (post_id) DO UPDATE SET extractor_version=EXCLUDED.extractor_version,
         observed_distinct_count=1,complete=true,updated_at=now()`,
      [authorId],
    );
    const indexed = await client.query(
      `INSERT INTO content.post_tag_search_tokens(post_id,tag_key,indexed_published_at)
       SELECT id,$2,published_at FROM content.posts WHERE author_id=$1`,
      [authorId, commonTag],
    );
    await client.query('ANALYZE content.posts');
    await client.query('ANALYZE content.post_tag_search_state');
    await client.query('ANALYZE content.post_tag_search_tokens');

    const functionSource = await client.query(
      `SELECT prosrc FROM pg_proc
        WHERE oid='feed.search_public_posts_by_tag(text,uuid,timestamptz,uuid,integer,integer)'::regprocedure`,
    );
    assert.ok(functionSource.rows[0]?.prosrc, 'candidate search function must expose its SQL source for plan verification');
    const explain = async (tag) => {
      const result = await client.query(
        `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${functionSource.rows[0].prosrc}`,
        [tag, null, null, null, 26, 1000],
      );
      const root = result.rows[0]['QUERY PLAN'][0];
      const nodes = [];
      const summary = [];
      const visit = (node) => {
        if (node['Relation Name'] === 'posts') nodes.push(node);
        summary.push({
          nodeType: node['Node Type'],
          relation: node['Relation Name'],
          indexName: node['Index Name'],
          actualRows: node['Actual Rows'],
          rowsRemoved: node['Rows Removed by Filter'],
          loops: node['Actual Loops'],
          sortKey: node['Sort Key'],
        });
        for (const child of node.Plans ?? []) visit(child);
      };
      visit(root.Plan);
      const rowsExamined = nodes.reduce((total, node) => {
        const loops = node['Actual Loops'] ?? 1;
        return total + ((node['Actual Rows'] ?? 0) + (node['Rows Removed by Filter'] ?? 0)) * loops;
      }, 0);
      return { root, nodes, summary, rowsExamined };
    };
    const miss = await explain(missingTag);
    const common = await explain(commonTag);
    const page = await client.query(TAGGED_DISCOVERY_SQL, [null, null, null, 26, commonTag, 1000]);
    const indexStats = await client.query(
      `SELECT pg_relation_size('content.post_tag_search_tokens')::bigint AS token_heap_bytes,
              pg_relation_size('content.post_tag_search_tokens_pkey')::bigint AS token_primary_key_bytes,
              pg_relation_size('content.post_tag_search_tokens_lookup_idx')::bigint AS token_index_bytes,
              pg_total_relation_size('content.post_tag_search_tokens')::bigint AS token_table_bytes,
              pg_total_relation_size('content.post_tag_search_state')::bigint AS state_bytes,
              (SELECT count(*)::integer FROM content.post_tag_search_tokens WHERE tag_key=$1) AS token_rows,
              (SELECT count(*)::integer FROM content.post_tag_search_state WHERE post_id IN
                (SELECT id FROM content.posts WHERE author_id=$2)) AS state_rows,
              (SELECT search_enabled FROM feed.tag_search_index_control WHERE singleton=true) AS search_enabled`,
      [commonTag, authorId],
    );
    const indexSummary = indexStats.rows[0];
    const planText = JSON.stringify([miss.root.Plan, common.root.Plan]);
    const evidence = {
      syntheticRows,
      workMem: '4MB',
      tempFileLimit: '64MB',
      parallelWorkers: 0,
      tagIndexName: 'post_tag_search_tokens_lookup_idx',
      missPostRowsExamined: miss.rowsExamined,
      missExecutionMs: miss.root['Execution Time'],
      missSharedHits: miss.root.Plan['Shared Hit Blocks'] ?? 0,
      missSharedReads: miss.root.Plan['Shared Read Blocks'] ?? 0,
      commonPostRowsExamined: common.rowsExamined,
      commonExecutionMs: common.root['Execution Time'],
      commonSharedHits: common.root.Plan['Shared Hit Blocks'] ?? 0,
      commonSharedReads: common.root.Plan['Shared Read Blocks'] ?? 0,
      tokenRows: Number(indexSummary.token_rows),
      stateRows: Number(indexSummary.state_rows),
      tokenHeapBytes: Number(indexSummary.token_heap_bytes),
      tokenPrimaryKeyBytes: Number(indexSummary.token_primary_key_bytes),
      tokenIndexBytes: Number(indexSummary.token_index_bytes),
      tokenTableBytes: Number(indexSummary.token_table_bytes),
      stateTableBytes: Number(indexSummary.state_bytes),
      tableRowsWrittenPerPost: (Number(indexSummary.token_rows) + Number(indexSummary.state_rows)) / syntheticRows,
      runtimeSearchEnabled: indexSummary.search_enabled,
      commonPageRows: page.rows.length,
      commonPlanNodes: common.summary,
    };
    process.stdout.write(`tag-search-scale ${JSON.stringify(evidence)}\n`);

    assert.ok(planText.includes('post_tag_search_tokens_lookup_idx'), `both plans must use the tag B-tree: ${JSON.stringify(evidence)}`);
    assert.equal(miss.rowsExamined, 0, `missing tag must not scan content.posts: ${JSON.stringify(evidence)}`);
    assert.ok(common.rowsExamined <= 1000, `common-tag candidate lookup should stay within the proposed 1,000-candidate scan cap: ${JSON.stringify(evidence)}`);
    assert.equal(common.summary.some((node) => node.relation === 'content_declarations' && node.nodeType === 'Seq Scan'), false,
      `common-tag lookup must not scan the full declaration relation: ${JSON.stringify(evidence)}`);
    assert.equal(page.rows.length, 26, `outer Worker query should receive a bounded exact-tag page: ${JSON.stringify(evidence)}`);
    assert.equal(Number(indexSummary.token_rows), syntheticRows);
    assert.equal(Number(indexSummary.state_rows), syntheticRows);
    assert.equal(Number(indexSummary.token_rows) + Number(indexSummary.state_rows), 2 * syntheticRows);
    assert.equal(indexSummary.search_enabled, false, 'scale fixture must not activate search');
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
});
