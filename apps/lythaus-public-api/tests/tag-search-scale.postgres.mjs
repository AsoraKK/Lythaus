import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { uuidv7 } from '@lythaus/security';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
  || !(target.pathname.startsWith('/lythaus_content_test')
    || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'))) {
  throw new Error('Tag search scale tests require explicitly local disposable PostgreSQL');
}

test('representative miss query measures an unindexed body scan and keeps the runtime gate closed', async () => {
  const syntheticRows = 75_000;
  const tag = `scaleprobe${randomUUID().replaceAll('-', '')}`;
  const authorId = uuidv7();
  const client = new pg.Client({ connectionString, ssl: false });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout='20s'");
    await client.query(
      "INSERT INTO identity.users(id,status,display_name) VALUES($1,'active','Synthetic scale author')",
      [authorId],
    );
    await client.query(
      `INSERT INTO content.posts
         (id,author_id,body,declared_creation_mode,visibility,moderation_state,published_at)
       SELECT gen_random_uuid(),$1,'Synthetic published body with no tag','human','public','allowed',
              now() - make_interval(secs => series.n)
         FROM generate_series(1,$2) AS series(n)`,
      [authorId, syntheticRows],
    );
    await client.query(
      `INSERT INTO content.content_declarations(post_id,declared_creation_mode,public_label)
       SELECT id,'human','Human-authored' FROM content.posts WHERE author_id=$1`,
      [authorId],
    );

    const indexes = await client.query(
      `SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='content' AND tablename='posts'`,
    );
    const tagIndexes = indexes.rows.filter(({ indexname, indexdef }) =>
      /tag|hashtag|trgm/i.test(`${indexname} ${indexdef}`),
    );
    const explained = await client.query(
      `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)
       SELECT p.id,p.author_id,p.body,p.published_at
         FROM content.posts p
         JOIN identity.users author ON author.id=p.author_id AND author.status='active'
         JOIN content.content_declarations declaration ON declaration.post_id=p.id
        WHERE p.visibility='public' AND p.moderation_state='allowed' AND p.deleted_at IS NULL
          AND declaration.public_label IN ('Human-authored','AI-assisted')
          AND p.published_at IS NOT NULL
          AND p.body ILIKE $1
          AND p.body ~* $2
        ORDER BY p.published_at DESC,p.id DESC
        LIMIT 26`,
      [`%#${tag}%`, `(^|[^[:alnum:]_])#${tag}([^[:alnum:]_]|$)`],
    );
    const root = explained.rows[0]['QUERY PLAN'][0];
    const postNodes = [];
    const visit = (node) => {
      if (node['Relation Name'] === 'posts') postNodes.push(node);
      for (const child of node.Plans ?? []) visit(child);
    };
    visit(root.Plan);
    const examined = postNodes.reduce((total, node) => {
      const loops = node['Actual Loops'] ?? 1;
      return total + ((node['Actual Rows'] ?? 0) + (node['Rows Removed by Filter'] ?? 0)) * loops;
    }, 0);
    const evidence = {
      syntheticRows,
      tagIndexNames: tagIndexes.map(({ indexname }) => indexname),
      postScanNodes: postNodes.map(({ 'Node Type': nodeType, 'Index Name': indexName }) => ({ nodeType, indexName })),
      postRowsExamined: examined,
      executionTimeMs: root['Execution Time'],
      sharedHits: root.Plan['Shared Hit Blocks'] ?? 0,
      sharedReads: root.Plan['Shared Read Blocks'] ?? 0,
    };
    process.stdout.write(`tag-search-scale ${JSON.stringify(evidence)}\n`);

    assert.ok(postNodes.length > 0, 'plan must expose the content.posts scan');
    if (tagIndexes.length === 0) {
      const minimumRowsExamined = Math.floor(syntheticRows * 0.99);
      assert.ok(
        examined >= minimumRowsExamined,
        `without a tag index, the no-result request should scan at least 99% of the synthetic table; ${JSON.stringify(evidence)}`,
      );
    } else {
      assert.ok(
        examined < syntheticRows / 2,
        `candidate tag indexes must actually bound planner work; ${JSON.stringify(evidence)}`,
      );
    }
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
});
