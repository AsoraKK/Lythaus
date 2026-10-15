import { createRequire } from 'node:module';

const root = new URL('../../../../', import.meta.url);
const require = createRequire(new URL('node_modules/wrangler/package.json', root));
const { build } = require('esbuild');
const appRequire = createRequire(new URL('package.json', root));
let modulePromise;

export function loadJobsModule() {
  modulePromise ??= build({
    absWorkingDir: root.pathname,
    entryPoints: ['apps/lythaus-jobs/src/index.ts'],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    target: 'node22',
    external: ['pg'],
    plugins: [{ name: 'fixture-workflow-entrypoint', setup(builder) {
      builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'workers', namespace: 'fixture-workers' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture-workers' }, () => ({ contents: `
        export class WorkflowEntrypoint {
          constructor(ctx, env) { this.ctx = ctx; this.env = env; }
        }
      `, loader: 'js' }));
    } }],
  }).then(result => {
    const fixtureModule = { exports: {} };
    new Function('require', 'module', 'exports', result.outputFiles[0].text)(
      appRequire,
      fixtureModule,
      fixtureModule.exports,
    );
    return fixtureModule.exports;
  });
  return modulePromise;
}
