import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import { pageRequest, encodeCursor } from '../apps/lythaus-public-api/src/product-policy.ts';
import { requireFeedPostId, commentPublicLabel } from '../apps/lythaus-public-api/src/feed-runtime-policy.ts';

// Execute the exact checked-in handler, not the proposed integration transform.
// SQL transport and presentation are mocked; this proves request interpretation,
// not PostgreSQL semantics, router authentication, or rendered Flutter behavior.
const sha = 'a10c381213373c0cb93e7dbc14404806ddf21cf2';
const source = execFileSync('git', ['show', `${sha}:apps/lythaus-public-api/src/index.ts`], { encoding: 'utf8' });
const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'getComments');
assert.ok(declaration, 'real handler must exist');
const js = ts.transpileModule(declaration.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const post = '019a0000-0000-7000-8000-000000000001';
const target = '019a0000-0000-7000-8000-000000000002';
async function call(search) {
  const queries = [];
  const scope = { URL, pageRequest, encodeCursor, requireFeedPostId, commentPublicLabel,
    FEED_AUTHOR_FIELDS: 'author.id AS author', FEED_AUTHOR_JOINS: '',
    query: async (_binding, sql, values) => { queries.push({ sql, values }); return { rows: [] }; },
    assertCommentFeedResponseCandidates: () => {}, presentCommentFeedItems: rows => rows,
    feedResponse: (_request, _env, body) => Response.json(body),
  };
  vm.createContext(scope);
  vm.runInContext(js, scope);
  const response = await scope.getComments(new Request(`https://fixture.invalid/api/posts/${post}/comments?${search}`), { DB_APP_FRESH: {} }, post);
  return { body: await response.json(), queries: JSON.parse(JSON.stringify(queries)) };
}
const expectFixed = process.env.EXPECT_COMMENT_INTEGRATION === '1';
test('CS01 exact target must alter the real handler lookup', async () => {
  const ordinary = await call('limit=25');
  const exact = await call(`limit=25&targetId=${target}`);
  if (expectFixed) assert.notDeepEqual(exact.queries, ordinary.queries, 'STAGED FUTURE CONTRACT: targetId is ignored by checked-in handler');
  else assert.deepEqual(exact.queries, ordinary.queries, 'staged legacy behavior changed: update evidence');
});
test('CS02 conversation newest mode must alter the legacy flat query', async () => {
  const ordinary = await call('limit=25');
  const conversation = await call('limit=25&view=conversations&sort=newest');
  if (expectFixed) assert.notDeepEqual(conversation.queries, ordinary.queries, 'STAGED FUTURE CONTRACT: conversation and sort parameters are ignored');
  else assert.deepEqual(conversation.queries, ordinary.queries, 'staged legacy behavior changed: update evidence');
});
test('CS03 conversation response must expose capabilities expected by pending UI', async () => {
  const { body } = await call('limit=25&view=conversations');
  if (expectFixed) assert.ok(body.capabilities, 'STAGED FUTURE CONTRACT: checked-in handler omits thread capabilities');
  else assert.equal(body.capabilities, undefined, 'staged legacy behavior changed: update evidence');
});
