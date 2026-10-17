import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const root = fileURLToPath(new URL('../../../', import.meta.url));

export async function standardUploadFixture(database, onEffect = async () => {}) {
  const statements = [], outbound = [];
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false, format: 'esm', platform: 'node',
    target: 'es2022', external: ['cloudflare:workers'],
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire('file:///fixture.mjs');" },
    plugins: [{ name: 'standard-media-local-fixture', setup(builder) {
      builder.onLoad({ filter: /packages\/db\/src\/index\.ts$/ }, args => {
        const original = readFileSync(args.path, 'utf8');
        const start = original.indexOf('export async function query<');
        const end = original.indexOf('export function assertVerifyFull(');
        assert.ok(start > 0 && end > start);
        return { loader: 'ts', contents: original.slice(0, start) + `
          import { env as fixtureEnv } from 'cloudflare:workers';
          async function fixtureSql(input) {
            const response = await fixtureEnv.FIXTURE_DB.fetch('https://fixture.invalid/sql', {
              method: 'POST', body: JSON.stringify(input), headers: { 'content-type': 'application/json' },
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            return result;
          }
          export async function query(binding, text, values = []) { return fixtureSql({ action: 'query', role: binding.role, text, values }); }
          export async function transaction(binding, work) {
            const { transactionId } = await fixtureSql({ action: 'begin', role: binding.role });
            try {
              const result = await work({ query: (text, values = []) => fixtureSql({ action: 'query', transactionId, text, values }) });
              await fixtureSql({ action: 'commit', transactionId });
              return result;
            } catch (error) { await fixtureSql({ action: 'rollback', transactionId }); throw error; }
          }
        ` + original.slice(end) };
      });
      builder.onLoad({ filter: /apps\/lythaus-public-api\/src\/index\.ts$/ }, args => ({
        loader: 'ts', contents: readFileSync(args.path, 'utf8') + '\nexport { createUploadSession, finaliseUpload, uploadSessionBytes };',
      }));
    }}],
    stdin: { resolveDir: root, contents: `
      import api, { createUploadSession, finaliseUpload, uploadSessionBytes } from './apps/lythaus-public-api/src/index.ts';
      import jobs, { reconcileExpiredStandardMediaSessions } from './apps/lythaus-jobs/src/index.ts';
      import { classifyPublicError } from './apps/lythaus-public-api/src/auth-runtime-policy.ts';
      export default { async fetch(request, bindings, ctx) {
        const path = new URL(request.url).pathname;
        if (path.startsWith('/api/')) return api.fetch(request, { ...bindings,
          DB_APP_FRESH: { role: 'lythaus_runtime' },
          MEDIA_UPLOADS_ENABLED: request.headers.get('x-fixture-enabled') ?? 'false',
        }, ctx);
        const fixtureUpload = path.match(/^\\/fixture\\/upload\\/([^/]+)$/);
        if (request.method === 'PUT' && fixtureUpload) return uploadSessionBytes(request,
          { ...bindings, DB_APP_FRESH: { role: 'lythaus_runtime' } },
          { userId: request.headers.get('x-fixture-user-id') ?? '' }, fixtureUpload[1]);
        if (path === '/fixture/cleanup') {
          const env = { ...bindings, DB_JOBS_FRESH: { role: 'lythaus_jobs' } };
          if (request.headers.get('x-fail-delete') === 'true') {
            env.MEDIA_QUARANTINE = { delete: async () => { throw new Error('synthetic_quarantine_delete_failed'); } };
          }
          if (request.headers.get('x-fail-approved-delete') === 'true') {
            env.MEDIA_APPROVED = { delete: async () => { throw new Error('synthetic_approved_delete_failed'); } };
          }
          await reconcileExpiredStandardMediaSessions(env);
          return new Response(null, { status: 204 });
        }
        const input = await request.json();
        const env = { ...bindings, DB_APP_FRESH: { role: 'lythaus_runtime' }, DB_JOBS_FRESH: { role: 'lythaus_jobs' },
          MEDIA_PROCESSING_ENABLED: input.enabled === false ? 'false' : 'true',
          AUTHENTICITY_AI_ENABLED: input.aiEnabled ? 'true' : 'false', MEDIA_QUOTA_BYTES: '10485760',
          R2_ACCOUNT_ID: 'synthetic', R2_ACCESS_KEY_ID: 'synthetic', R2_SECRET_ACCESS_KEY: 'synthetic',
          MEDIA_QUARANTINE_BUCKET: 'synthetic-private-quarantine',
        };
        const effect = async (type, details = {}) => {
          const response = await bindings.FIXTURE_EFFECT.fetch('https://fixture.invalid/effect', {
            method: 'POST', body: JSON.stringify({ type, input, ...details }),
          });
          if (!response.ok) throw new Error('synthetic_effect_failed');
        };
        env.MEDIA_APPROVED = {
          get: (...args) => bindings.MEDIA_APPROVED.get(...args),
          delete: (...args) => bindings.MEDIA_APPROVED.delete(...args),
          put: async (...args) => {
            await effect('beforePut');
            const result = await bindings.MEDIA_APPROVED.put(...args);
            await effect(result ? 'stored' : 'conflict');
            return result;
          },
        };
        let imageCalls = 0, imageInfoCalls = 0;
        env.IMAGES = {
          async info(stream) {
            imageInfoCalls++;
            if (imageInfoCalls === 1) imageCalls++;
            await effect('info', { stage: imageInfoCalls });
            const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
            if (input.decoderFailure && imageInfoCalls === 1) throw new Error('synthetic_decode_unavailable');
            if (input.outputInfoFailure && imageInfoCalls > 1) throw new Error('synthetic_output_info_unavailable');
            if (imageInfoCalls === 1 && input.dimensions) return input.dimensions;
            if (imageInfoCalls > 1 && input.outputDimensions) {
              if (input.outputDimensions.width === 'NaN') return { ...input.outputDimensions, width: Number.NaN };
              return input.outputDimensions;
            }
            const response = await bindings.FIXTURE_IMAGES.fetch(new Request('https://fixture.invalid/info', {
              method: 'POST', body: bytes,
            }));
            if (!response.ok) throw new Error('synthetic_decode_unavailable');
            return response.json();
          },
          input(stream) { return { output: async options => {
            await effect('transform', { options });
            if (input.oversizedTransform) return { image: async () => new Response(new Uint8Array(10 * 1024 * 1024 + 1)).body };
            if (input.transformed) return { image: async () => new Response(Uint8Array.from(input.transformed)).body };
            const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
            const response = await bindings.FIXTURE_IMAGES.fetch(new Request('https://fixture.invalid/transform', {
              method: 'POST', headers: { 'x-fixture-quality': String(options.quality ?? 85) }, body: bytes,
            }));
            if (!response.ok) throw new Error('synthetic_transform_unavailable');
            return { image: async () => response.body };
          } }; },
        };
        if (input.failDelete) env.MEDIA_QUARANTINE = {
          get: (...args) => bindings.MEDIA_QUARANTINE.get(...args),
          delete: async () => { throw new Error('synthetic_delete_unavailable'); },
        };
        if (input.failApprovedDelete) env.MEDIA_APPROVED = {
          get: (...args) => bindings.MEDIA_APPROVED.get(...args),
          delete: async () => { throw new Error('synthetic_approved_delete_unavailable'); },
        };
        try {
          if (path === '/fixture/finalise') return await finaliseUpload(request, env, { userId: input.userId }, input.sessionId);
          if (path === '/fixture/create') return await createUploadSession(new Request(request.url, {
            method: 'POST', body: JSON.stringify(input.upload), headers: { 'content-type': 'application/json' },
          }), env, { userId: input.userId });
          if (path === '/fixture/queue') {
            let ack = 0, retry = 0;
            await jobs.queue({ queue: 'lythaus-media-dev', messages: [{ id: input.event.eventId,
              body: input.event, ack() { ack++; }, retry() { retry++; } }] }, env);
            return Response.json({ ack, retry, imageCalls });
          }
          throw new Error('unknown_fixture_action');
        } catch (error) {
          const classified = classifyPublicError(error);
          return Response.json({ error: classified.exposedCode }, { status: classified.status });
        }
      }};
    ` },
  });
  const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'standard-media-fixture', modules: true,
    script: bundle.outputFiles[0].text, compatibilityDate: '2026-07-27', compatibilityFlags: ['nodejs_compat'],
    r2Buckets: ['MEDIA_QUARANTINE', 'MEDIA_APPROVED'],
    bindings: { EXPECTED_HOSTNAMES: 'local.test', CORS_ALLOWED_ORIGINS: 'https://local.test' },
    outboundService: request => { outbound.push(request.url); throw new Error('fixture denies all external requests'); },
    serviceBindings: { FIXTURE_EFFECT: async request => {
      try { await onEffect(await request.json()); return new Response(null, { status: 204 }); }
      catch { return new Response(null, { status: 500 }); }
    }, FIXTURE_IMAGES: async request => {
      try {
        const bytes = Buffer.from(await request.arrayBuffer());
        const source = sharp(bytes, { failOn: 'error', limitInputPixels: 40000000 });
        const url = new URL(request.url);
        if (url.pathname === '/info') {
          const metadata = await source.metadata();
          if (!metadata.width || !metadata.height || !metadata.format) return new Response(null, { status: 422 });
          return Response.json({ format: `image/${metadata.format}`, fileSize: bytes.byteLength,
            width: metadata.width, height: metadata.height });
        }
        if (url.pathname === '/transform') {
          const quality = Number(request.headers.get('x-fixture-quality') ?? 85);
          if (!Number.isInteger(quality) || quality < 1 || quality > 100) return new Response(null, { status: 400 });
          const output = await source.rotate().webp({ quality }).toBuffer();
          return new Response(output, { headers: { 'content-type': 'image/webp' } });
        }
        return new Response(null, { status: 404 });
      } catch { return new Response(null, { status: 422 }); }
    }, FIXTURE_DB: async request => {
      const input = await request.json();
      statements.push(input);
      try { return Response.json(await database(input)); }
      catch (error) { return Response.json({ error: error.message }, { status: 500 }); }
    } },
  }] }));
  return { statements, outbound, runtime,
    quarantine: await runtime.getR2Bucket('MEDIA_QUARANTINE'), approved: await runtime.getR2Bucket('MEDIA_APPROVED'),
    request(path, body) { return runtime.dispatchFetch('https://local.test' + path, { method: 'POST',
      body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }); },
    upload(uploadUrl, userId, bytes, contentType = 'image/png') {
      const parsed = new URL(uploadUrl);
      const sessionId = parsed.pathname.match(/^\/api\/media\/uploads\/([^/]+)\/bytes$/)?.[1];
      assert.ok(sessionId);
      return runtime.dispatchFetch(`https://local.test/fixture/upload/${sessionId}`, { method: 'PUT', body: bytes,
        headers: { 'x-fixture-user-id': userId, 'content-type': contentType } });
    },
    cleanup({ failDelete = false, failApprovedDelete = false } = {}) { return runtime.dispatchFetch('https://local.test/fixture/cleanup', { method: 'POST',
      headers: { 'x-fail-delete': failDelete ? 'true' : 'false',
        'x-fail-approved-delete': failApprovedDelete ? 'true' : 'false' } }); },
    dispose: () => runtime.dispose(),
  };
}
