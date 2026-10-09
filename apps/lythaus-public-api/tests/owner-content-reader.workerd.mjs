import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const ownerId = '0192c000-0000-7000-8000-000000000001';
const fixtures = [
  { id:'0192c000-0000-7000-8000-000000000011', authorId:ownerId, body:'Published own post', declaredCreationMode:'human', moderationState:'allowed', visibility:'public', publishedAt:'2026-10-05T00:00:00Z', createdAt:'2026-10-05T00:00:00Z', updatedAt:'2026-10-05T00:00:00Z', cursorCreatedAt:'2026-10-05T00:00:00.123456Z', deleted:false },
  { id:'0192c000-0000-7000-8000-000000000012', authorId:ownerId, body:'Pending private own post', declaredCreationMode:'human', moderationState:'under_review', visibility:'private', publishedAt:null, createdAt:'2026-10-04T00:00:00Z', updatedAt:'2026-10-04T00:00:00Z', cursorCreatedAt:'2026-10-04T00:00:00.654321Z', deleted:false },
  { id:'0192c000-0000-7000-8000-000000000013', authorId:ownerId, body:'Followers-only own post', declaredCreationMode:'ai_assisted', moderationState:'allowed', visibility:'followers', publishedAt:'2026-10-03T00:00:00Z', createdAt:'2026-10-03T00:00:00Z', updatedAt:'2026-10-03T00:00:00Z', cursorCreatedAt:'2026-10-03T00:00:00.000001Z', deleted:false },
];

test('owner post listing runs in workerd with paginated private responses', { timeout: 60_000 }, async () => {
  const bundle = await build({
    absWorkingDir: root,
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    stdin: {
      resolveDir: root,
      contents: `
        import { handleOwnerContentRead, ownerPostsQuery } from './apps/lythaus-public-api/src/owner-content-reader.ts';
        import { classifyPublicError } from './apps/lythaus-public-api/src/auth-runtime-policy.ts';
        const ownerId = ${JSON.stringify(ownerId)};
        const fixtures = ${JSON.stringify(fixtures)};
        let queryCount = 0;
        export default { async fetch(request) {
          const response = await handleOwnerContentRead(request, {
            authenticate: async () => {
              if (request.headers.get('authorization') !== 'Bearer synthetic-owner') throw new Error('authentication_required');
              return { userId: ownerId };
            },
            query: async (sql, values) => {
              queryCount += 1;
              if (sql !== ownerPostsQuery || values[0] !== ownerId) throw new Error('unexpected_owner_query');
              const start = values[1] === null ? 0 : fixtures.findIndex(row => row.cursorCreatedAt === values[1] && row.id === values[2]) + 1;
              return { rows: fixtures.slice(start, start + values[3]) };
            },
            respond: (body, status) => Response.json({ ...body, queryCount }, { status, headers: {
              'cache-control': 'private, no-store', 'vary': 'Origin, Authorization',
            }}),
          });
          if (response) return response;
          return Response.json({ error: 'not_found' }, { status: 404 });
        }};
      `,
    },
  });
  const miniflare = new Miniflare(convertV4MiniflareOptions({
    workers: [{
      name: 'owner-profile',
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-07-27',
      compatibilityFlags: ['nodejs_compat'],
    }],
  }));
  try {
    const firstResponse = await miniflare.dispatchFetch('https://local.test/api/users/me/posts?limit=2', {
      headers: { authorization: 'Bearer synthetic-owner' },
    });
    assert.equal(firstResponse.status, 200);
    assert.equal(firstResponse.headers.get('cache-control'), 'private, no-store');
    assert.equal(firstResponse.headers.get('vary'), 'Origin, Authorization');
    const firstPage = await firstResponse.json();
    assert.deepEqual(firstPage.items.map(post => post.body), ['Published own post', 'Pending private own post']);
    assert.deepEqual(firstPage.items.map(post => post.moderationState), ['allowed', 'under_review']);
    assert.equal(firstPage.items[1].privateModerationSignal, undefined);
    assert.equal(typeof firstPage.nextCursor, 'string');

    const nextResponse = await miniflare.dispatchFetch(
      'https://local.test/api/users/me/posts?limit=2&cursor=' + encodeURIComponent(firstPage.nextCursor),
      { headers: { authorization: 'Bearer synthetic-owner' } },
    );
    const nextPage = await nextResponse.json();
    assert.equal(nextResponse.status, 200);
    assert.deepEqual(nextPage.items.map(post => post.body), ['Followers-only own post']);
    assert.equal(nextPage.nextCursor, null);

    const guestResponse = await miniflare.dispatchFetch('https://local.test/api/users/me/posts');
    assert.equal(guestResponse.status, 401);
  } finally {
    await miniflare.dispose();
  }
});
