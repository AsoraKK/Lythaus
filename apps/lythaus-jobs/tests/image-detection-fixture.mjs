import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const root = fileURLToPath(new URL('../../../', import.meta.url));

export async function imageDetectionFixture({ database, config, safety, specialist, reasoner }) {
  const outbound = [];
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false, format: 'esm',
    platform: 'neutral', target: 'es2022', external: ['cloudflare:workers'],
    plugins: [{ name: 'image-detection-synthetic-db', setup(builder) {
      builder.onResolve({ filter: /^@lythaus\/db$/ }, () => ({ path: 'db', namespace: 'image-detection-fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'image-detection-fixture' }, () => ({ loader: 'ts', contents: `
        import { env } from 'cloudflare:workers';
        async function sql(input) {
          const response = await env.FIXTURE_DB.fetch('https://fixture.invalid/sql', {
            method: 'POST', body: JSON.stringify(input),
          });
          const value = await response.json();
          if (!response.ok) throw new Error(value.error);
          return value;
        }
        export const query = (binding, text, values = []) => sql({ action: 'query', text, values });
        export async function transaction(binding, work) {
          await sql({ action: 'begin' });
          try {
            const value = await work({ query: (text, values = []) => sql({ action: 'query', text, values }) });
            await sql({ action: 'commit' });
            return value;
          } catch (error) { await sql({ action: 'rollback' }); throw error; }
        }
      ` }));
    } }],
    stdin: { resolveDir: root, contents: `
      import { processBetaEvent } from './apps/lythaus-jobs/src/authenticity-beta.ts';
      import { authorBetaView, betaResultCurrent } from './packages/authenticity/src/beta.ts';
      import { readBetaConfig } from './packages/authenticity/src/beta-config.ts';
      export default { async fetch(request, bindings) {
        const input = await request.json();
        const env = { ...bindings, DB_JOBS_FRESH: {}, COST_BUDGET_ENABLED: 'true',
          AUTHENTICITY_BETA_ENABLED: input.enabled === false ? 'false' : 'true',
          OPENAI_API_KEY: 'synthetic-not-a-credential', AUTHENTICITY_BETA_DISPATCH_SECRET: 'synthetic-not-a-secret',
          AI_GATEWAY_ID: 'synthetic',
          LYTHAUS_CONFIG: { get: async () => (await bindings.FIXTURE_CONFIG.fetch('https://fixture.invalid/config')).json() },
          AUTHENTICITY_BETA_CONTAINER: { getByName(name) {
            if (name !== 'safe-a-beta-v1') throw new Error('unexpected_specialist_name');
            return bindings.FIXTURE_SPECIALIST;
          } },
          AI: { run: async (model, body, options) => {
            const response = await bindings.FIXTURE_REASONER.fetch('https://fixture.invalid/reasoning', {
              method: 'POST', body: JSON.stringify({ model, body, options }),
            });
            if (!response.ok) throw new Error('synthetic_reasoning_unavailable');
            return response.json();
          } },
        };
        await processBetaEvent(env, input.eventId, input.payload);
        const snapshot = await bindings.FIXTURE_DB.fetch('https://fixture.invalid/snapshot');
        const row = await snapshot.json();
        const active = await readBetaConfig(env);
        const current = row.result === null || betaResultCurrent(row.result, active, {
          caseId: row.case_id, inputHash: row.input_hash, revision: row.revision,
        });
        return Response.json({ evidenceMode: 'SYNTHETIC_TRANSPORT_TEST_ONLY', externalProviderCalls: 0,
          view: authorBetaView({ id: row.case_id, state: row.state, result: row.result,
            createdAt: row.created_at, updatedAt: row.updated_at, expiresAt: row.expires_at,
            reviewState: 'none', evidenceCurrent: current }) });
      } };
    ` },
  });
  const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'image-detection-fixture',
    modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-07-27',
    compatibilityFlags: ['nodejs_compat'], r2Buckets: ['MEDIA_QUARANTINE'],
    outboundService: async request => {
      if (request.url !== 'https://api.openai.com/v1/moderations') {
        outbound.push(request.url);
        throw new Error('all_external_transport_denied');
      }
      return safety(request);
    },
    serviceBindings: {
      FIXTURE_DB: async request => {
        try {
          const input = new URL(request.url).pathname === '/snapshot' ? { action: 'snapshot' } : await request.json();
          return Response.json(await database(input));
        } catch (error) { return Response.json({ error: error.message }, { status: 500 }); }
      },
      FIXTURE_CONFIG: async () => Response.json(await config()),
      FIXTURE_SPECIALIST: request => specialist(request),
      FIXTURE_REASONER: request => reasoner(request),
    },
  }] }));
  let quarantine;
  try { quarantine = await runtime.getR2Bucket('MEDIA_QUARANTINE'); }
  catch (error) { await runtime.dispose(); throw error; }
  return { runtime, outbound, quarantine,
    async run(input) {
      const response = await runtime.dispatchFetch('https://image-detection.test/run', {
        method: 'POST', body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error('synthetic_job_failed');
      return response.json();
    },
    dispose: () => runtime.dispose(),
  };
}
