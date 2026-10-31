import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertMainDispatchAccountContext } from './capture-app-only-worker-state.mjs';
import { isAppPagesBranch, normalizeAppPagesSnapshot, normalizeReusedPagesSnapshot } from '../release/app-only-eligibility.mjs';

const ACCOUNT_ID = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
const ENDPOINT = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/lythaus-web`;

/** The release job must supply branch from protected production configuration. */
export async function captureAppPages({ token, branch, fetchImpl = fetch } = {}) {
  if (typeof token !== 'string' || !token || !isAppPagesBranch(branch)) {
    throw new Error('app Pages provider inputs are invalid');
  }
  let payload;
  try {
    const response = await fetchImpl(ENDPOINT, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    if (!response.ok || response.redirected) throw new Error('provider rejected request');
    payload = await response.json();
  } catch {
    throw new Error('read-only app Pages provider request failed');
  }
  return normalizeAppPagesSnapshot(payload, branch);
}

/** Both project identities are fixed by policy or protected configuration. */
export async function captureReusedPages({ token, adminProject, fetchImpl = fetch } = {}) {
  if (typeof token !== 'string' || !token || !/^lythaus-[a-z0-9-]+$/.test(adminProject ?? '')
    || ['lythaus-web', 'lythaus-marketing'].includes(adminProject)) throw new Error('reused Pages provider inputs are invalid');
  const pages = {};
  for (const [component, name] of [['marketing', 'lythaus-marketing'], ['control-panel', adminProject]]) {
    let payload;
    try {
      const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${name}`, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      });
      if (!response.ok || response.redirected) throw new Error('provider rejected request');
      payload = await response.json();
    } catch { throw new Error('read-only reused Pages provider request failed'); }
    pages[component] = normalizeReusedPagesSnapshot(payload, name);
  }
  return Object.freeze(pages);
}

async function main() {
  assertMainDispatchAccountContext(process.env);
  const startedAt = new Date().toISOString();
  const pages = await captureAppPages({ token: process.env.CLOUDFLARE_API_TOKEN, branch: process.env.LYTHAUS_WEB_PAGES_BRANCH });
  const capturedAt = new Date().toISOString();
  const directory = path.join(process.env.RUNNER_TEMP, 'app-only-provider-evidence');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const output = path.join(directory, 'app-pages.json');
  writeFileSync(output, `${JSON.stringify({ schemaVersion: 1, startedAt, capturedAt, pages }, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ status: 'READ_ONLY_CAPTURED', output, project: pages.project }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
