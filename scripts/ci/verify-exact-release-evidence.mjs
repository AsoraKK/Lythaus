const RELEASE_EVIDENCE_RUNS = Object.freeze([
  ['CI', 'CI_RUN_ID'],
  ['CodeQL', 'CODEQL_RUN_ID'],
  ['Dependency review', 'DEPENDENCY_REVIEW_RUN_ID'],
  ['Native secret scan', 'SECRET_SCAN_RUN_ID'],
  ['Historical branch reconciliation', 'HISTORICAL_RECONCILIATION_RUN_ID'],
]);

function required(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

export function assertExactReleaseRun(payload, expectedName, releaseSha) {
  if (!payload || !Number.isSafeInteger(payload.id) || payload.id < 1
    || payload.name !== expectedName || payload.head_sha?.toLowerCase() !== releaseSha.toLowerCase() || payload.conclusion !== 'success') {
    throw new Error(`${expectedName} must be a successful run for the exact release SHA`);
  }
  return Object.freeze({
    name: expectedName,
    runId: payload.id,
    headSha: payload.head_sha,
    conclusion: payload.conclusion,
  });
}

async function githubRun(repository, runId, token, apiUrl) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/repos/${repository}/actions/runs/${runId}`, {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2022-11-28',
          'user-agent': 'Lythaus-exact-release-evidence',
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;
      const error = new Error(`GitHub run lookup failed with HTTP ${response.status}`);
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) throw error;
      lastError = error;
    } catch (error) {
      if (attempt === 3) throw error;
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  throw lastError ?? new Error('GitHub run lookup failed');
}

export async function verifyExactReleaseEvidence({
  releaseSha = process.env.RELEASE_SHA,
  repository = process.env.GITHUB_REPOSITORY,
  token = process.env.GH_TOKEN,
  apiUrl = process.env.GITHUB_API_URL ?? 'https://api.github.com',
  runIds = Object.fromEntries(RELEASE_EVIDENCE_RUNS.map(([, variable]) => [variable, process.env[variable]])),
} = {}) {
  if (!/^[0-9a-f]{40}$/i.test(releaseSha ?? '')) throw new Error('RELEASE_SHA must be a full 40-character commit SHA');
  required(repository, 'GITHUB_REPOSITORY');
  required(token, 'GH_TOKEN');
  const evidence = [];
  for (const [expectedName, variable] of RELEASE_EVIDENCE_RUNS) {
    const runId = required(runIds?.[variable], variable);
    if (!/^\d+$/.test(runId)) throw new Error(`${variable} must be numeric`);
    const payload = await githubRun(repository, runId, token, apiUrl);
    const exact = assertExactReleaseRun(payload, expectedName, releaseSha);
    if (String(exact.runId) !== runId) throw new Error(`${expectedName} response did not match the requested run ID`);
    evidence.push(exact);
  }
  return Object.freeze(evidence);
}

async function main() {
  const evidence = await verifyExactReleaseEvidence();
  console.log(JSON.stringify({ status: 'VERIFIED', releaseSha: process.env.RELEASE_SHA, runs: evidence }));
}

if (process.argv[1] && process.argv[1].endsWith('verify-exact-release-evidence.mjs')) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
