import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const LYTHAUS_ACCOUNT_ID = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
export const COORDINATOR_WORKER_NAME = 'lythaus-auth-acceptance-coordinator-development';
const API_ROOT = 'https://api.cloudflare.com/client/v4';
const MAX_ATTEMPTS = 3;

function fail(message) {
  throw new Error(message);
}

function required(value, name) {
  if (!value) fail(`${name} is required`);
  return value;
}

function assertScope(accountId, workerName) {
  if (accountId !== LYTHAUS_ACCOUNT_ID) {
    fail('Cloudflare account is outside the configured Lythaus scope');
  }
  if (workerName !== COORDINATOR_WORKER_NAME) {
    fail('Cloudflare Worker is outside the configured Lythaus coordinator scope');
  }
}

function errorCodes(payload) {
  const values = [...(Array.isArray(payload?.errors) ? payload.errors : []), ...(Array.isArray(payload?.messages) ? payload.messages : [])]
    .map((item) => item?.code)
    .filter((code) => Number.isInteger(code));
  return [...new Set(values)];
}

function providerError(operation, response, payload) {
  const codes = errorCodes(payload);
  return `Cloudflare Worker parent ${operation} failed with HTTP ${response.status}; codes=${codes.join(',') || 'unknown'}`;
}

async function defaultSleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestJson(fetchImpl, url, init, sleepImpl) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, init);
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        fail(`Cloudflare Worker parent request failed before receiving a response (${init.method ?? 'GET'})`);
      }
      await sleepImpl(attempt * 100);
      continue;
    }

    const payload = await response.json().catch(() => null);
    if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
      await sleepImpl(attempt * 100);
      continue;
    }
    return { response, payload };
  }
  fail('Cloudflare Worker parent request exhausted its retry budget');
}

function validateResult(result) {
  if (!result || typeof result !== 'object' || result.name !== COORDINATOR_WORKER_NAME) {
    fail('Cloudflare Worker parent response did not identify the exact coordinator');
  }
  if (typeof result.id !== 'string' || result.id.length === 0) {
    fail('Cloudflare Worker parent response did not include a valid Worker identifier');
  }
  if (!Object.prototype.hasOwnProperty.call(result, 'deployed_on')) {
    fail('Cloudflare Worker parent response omitted deployment state');
  }
  if (result.deployed_on !== null && typeof result.deployed_on !== 'string') {
    fail('Cloudflare Worker parent response contained invalid deployment state');
  }

  const subdomain = result.subdomain;
  if (!subdomain || typeof subdomain !== 'object' || Array.isArray(subdomain)) {
    fail('Cloudflare Worker parent response omitted subdomain state');
  }
  for (const field of ['enabled', 'previews_enabled']) {
    if (!Object.prototype.hasOwnProperty.call(subdomain, field) || typeof subdomain[field] !== 'boolean') {
      fail(`Cloudflare Worker parent response contained invalid subdomain.${field} state`);
    }
  }

  const references = result.references;
  if (!references || typeof references !== 'object' || Array.isArray(references)) {
    fail('Cloudflare Worker parent response omitted references');
  }
  const domains = references?.domains;
  if (!Array.isArray(domains)) {
    fail('Cloudflare Worker parent response contained invalid custom-domain state');
  }

  return {
    deployedOn: result.deployed_on,
    workersDevEnabled: subdomain?.enabled === true,
    previewUrlsEnabled: subdomain?.previews_enabled === true,
    customDomainCount: Array.isArray(domains) ? domains.length : 0,
  };
}

function assertParentOnly(state) {
  if (state.deployedOn !== null) {
    fail('Newly bootstrapped coordinator already has a deployment');
  }
  if (state.workersDevEnabled || state.previewUrlsEnabled) {
    fail('Newly bootstrapped coordinator has an enabled workers.dev or preview surface');
  }
  if (state.customDomainCount !== 0) {
    fail('Newly bootstrapped coordinator has an unexpected custom domain');
  }
}

function makeStateEvidence({ status, existedBefore, created, state }) {
  return {
    workerName: COORDINATOR_WORKER_NAME,
    existedBefore,
    created,
    status,
    ...(state ? {
      deployment: {
        exists: state.deployedOn !== null,
        deployedOn: state.deployedOn,
      },
      workersDevEnabled: state.workersDevEnabled,
      previewUrlsEnabled: state.previewUrlsEnabled,
      customDomainCount: state.customDomainCount,
    } : {}),
  };
}

function publicEvidence(evidence) {
  return {
    workerName: evidence.workerName,
    existedBefore: evidence.existedBefore,
    created: evidence.created,
    status: evidence.status,
  };
}

function writeEvidence(evidence, outputPath, statePath) {
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(publicEvidence(evidence), null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  }
  if (statePath) {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  }
}

function appendGithubEnvironment(githubEnv, evidence) {
  if (!githubEnv) return;
  fs.appendFileSync(githubEnv, `COORDINATOR_PARENT_EXISTED_BEFORE=${evidence.existedBefore}\nCOORDINATOR_PARENT_CREATED=${evidence.created}\n`, 'utf8');
}

export async function ensureCloudflareWorkerParent({
  token,
  accountId,
  workerName = COORDINATOR_WORKER_NAME,
  checkOnly = false,
  fetchImpl = globalThis.fetch,
  sleepImpl = defaultSleep,
  outputPath,
  statePath,
  githubEnv,
} = {}) {
  required(token, 'CLOUDFLARE_API_TOKEN');
  required(accountId, 'CLOUDFLARE_ACCOUNT_ID');
  assertScope(accountId, workerName);
  if (typeof fetchImpl !== 'function') fail('a fetch implementation is required');

  const endpoint = `${API_ROOT}/accounts/${accountId}/workers/workers/${encodeURIComponent(COORDINATOR_WORKER_NAME)}`;
  const headers = { authorization: `Bearer ${token}`, accept: 'application/json' };
  const inspect = async () => requestJson(fetchImpl, endpoint, { method: 'GET', headers }, sleepImpl);
  const initial = await inspect();

  if (initial.response.status !== 404) {
    if (!initial.response.ok || initial.payload?.success !== true) fail(providerError('inspection', initial.response, initial.payload));
    const state = validateResult(initial.payload.result);
    const evidence = makeStateEvidence({ status: 'VERIFIED', existedBefore: true, created: false, state });
    writeEvidence(evidence, outputPath, statePath);
    if (!checkOnly) appendGithubEnvironment(githubEnv, evidence);
    return evidence;
  }

  if (checkOnly) {
    const evidence = makeStateEvidence({ status: 'ABSENT', existedBefore: false, created: false, state: null });
    writeEvidence(evidence, outputPath, statePath);
    return evidence;
  }

  const create = await requestJson(fetchImpl, `${API_ROOT}/accounts/${accountId}/workers/workers`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ name: COORDINATOR_WORKER_NAME }),
  }, sleepImpl);

  if (create.response.status === 409) {
    const raced = await inspect();
    if (raced.response.status === 404 || !raced.response.ok || raced.payload?.success !== true) {
      fail(providerError('post-create inspection', raced.response, raced.payload));
    }
    const state = validateResult(raced.payload.result);
    const evidence = makeStateEvidence({ status: 'VERIFIED', existedBefore: true, created: false, state });
    writeEvidence(evidence, outputPath, statePath);
    appendGithubEnvironment(githubEnv, evidence);
    return evidence;
  }
  if (!create.response.ok || create.payload?.success !== true) {
    fail(providerError('creation', create.response, create.payload));
  }
  if (create.payload?.result?.name !== undefined && create.payload.result.name !== COORDINATOR_WORKER_NAME) {
    fail('Cloudflare Worker parent creation returned a different Worker name');
  }

  const after = await inspect();
  if (!after.response.ok || after.payload?.success !== true) fail(providerError('post-create inspection', after.response, after.payload));
  const state = validateResult(after.payload.result);
  assertParentOnly(state);
  const evidence = makeStateEvidence({ status: 'VERIFIED', existedBefore: false, created: true, state });
  writeEvidence(evidence, outputPath, statePath);
  appendGithubEnvironment(githubEnv, evidence);
  return evidence;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check-only')) {
    fail('Usage: ensure-cloudflare-worker-parent.mjs [--check-only]');
  }
  const evidence = await ensureCloudflareWorkerParent({
    token: process.env.CLOUDFLARE_API_TOKEN,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    checkOnly: args[0] === '--check-only',
    outputPath: process.env.CLOUDFLARE_WORKER_PARENT_EVIDENCE_PATH,
    statePath: process.env.CLOUDFLARE_WORKER_PARENT_STATE_PATH,
    githubEnv: process.env.GITHUB_ENV,
  });
  console.log(JSON.stringify(publicEvidence(evidence)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
