import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { build } = wranglerRequire('esbuild');
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');

export async function imageDetectionFixture(open) {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const connections = new Map();
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false, format: 'esm', platform: 'browser',
    target: 'es2022', stdin: { resolveDir: root, contents: `
      import { createImageDetectionStore } from './packages/db/src/image-detection-store.ts';
      import { enqueueImageDetection, imageDetectionStatus } from './packages/authenticity/src/image-detection.ts';
      import { processImageDetectionEvent } from './apps/lythaus-jobs/src/image-detection.ts';
      import { IMAGE_DETECTION_VERSION } from './packages/authenticity/src/image-detection-contract.ts';
      export default { async fetch(request, env) {
        const input = await request.json(), path = new URL(request.url).pathname;
        async function sql(value) {
          const response = await env.SQL.fetch('https://synthetic.invalid/sql', { method: 'POST', body: JSON.stringify(value) });
          const result = await response.json();
          if (!response.ok) throw new Error('synthetic_database_transport_failed');
          for (const row of result.rows ?? []) for (const field of ['created_at','updated_at','expires_at','lease_until',
            'dispatch_started_at','deleted_at','quarantine_deleted_at']) if (typeof row[field] === 'string') row[field] = new Date(row[field]);
          return result;
        }
        const store = createImageDetectionStore(async work => {
          const { transactionId } = await sql({ action: 'begin' });
          try {
            const result = await work({ query: (text, values = []) => sql({ action: 'query', transactionId, text, values }) });
            await sql({ action: 'commit', transactionId }); return result;
          } catch (error) { await sql({ action: 'rollback', transactionId }); throw error; }
        });
        const deps = { mode: input.enabled === true ? 'synthetic-local-only' : undefined, store, originals: env.ORIGINALS,
          evaluator: { kind: 'synthetic', async evaluate(value) {
            return { schemaVersion: IMAGE_DETECTION_VERSION, bindingHash: value.bindingHash, attemptId: value.attemptId,
              evaluator: value.binding.evaluator, evidenceKind: 'synthetic', safety: 'ALLOW', authorship: 'NO_POSITIVE_EVIDENCE' };
          } } };
        const result = path === '/enqueue' ? await enqueueImageDetection(deps, input.binding, input.expiresAt)
          : path === '/process' ? await processImageDetectionEvent(deps, input.event)
          : path === '/status' ? await imageDetectionStatus(deps, input.id, input.ownerId) : null;
        return Response.json(result);
      } };` } });
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2025-06-01', r2Buckets: ['ORIGINALS'], serviceBindings: {
      SQL: async request => {
        const input = await request.json();
        let client = connections.get(input.transactionId);
        try {
          if (input.action === 'begin') {
            client = await open(); await client.query('BEGIN');
            const transactionId = randomUUID(); connections.set(transactionId, client);
            return Response.json({ transactionId });
          }
          if (!client) throw new Error('unknown_transaction');
          if (input.action === 'query') {
            const result = await client.query(input.text, input.values);
            return Response.json({ rows: result.rows, rowCount: result.rowCount });
          }
          if (!['commit','rollback'].includes(input.action)) throw new Error('invalid_action');
          await client.query(input.action === 'commit' ? 'COMMIT' : 'ROLLBACK'); return Response.json({});
        } catch { return Response.json({ error: 'synthetic_database_transport_failed' }, { status: 500 }); }
        finally {
          if (['commit','rollback'].includes(input.action)) { connections.delete(input.transactionId); await client?.end(); }
        }
      },
    } }));
  return { bucket: await mf.getR2Bucket('ORIGINALS'),
    request: async (path, value) => {
      const response = await mf.dispatchFetch('https://synthetic.invalid' + path, { method: 'POST', body: JSON.stringify(value) });
      if (!response.ok) throw new Error('synthetic_worker_request_failed');
      return response.json();
    },
    async dispose() { await mf.dispose(); await Promise.all([...connections.values()].map(client => client.end())); },
  };
}
