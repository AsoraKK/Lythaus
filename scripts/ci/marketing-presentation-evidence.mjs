import { pathToFileURL } from 'node:url';
import { assertExactReleaseRun } from './verify-exact-release-evidence.mjs';

const runs = Object.freeze([
  ['CI', 'CI_RUN_ID'], ['CodeQL', 'CODEQL_RUN_ID'], ['Dependency review', 'DEPENDENCY_REVIEW_RUN_ID'],
  ['Native secret scan', 'SECRET_SCAN_RUN_ID'], ['Historical branch reconciliation', 'HISTORICAL_RECONCILIATION_RUN_ID'],
]);

export async function verifyMarketingReleaseEvidence({ env, fetchImpl = fetch }) {
  const sha = env.RELEASE_SHA, repository = env.GITHUB_REPOSITORY, token = env.GH_TOKEN;
  if (!/^[a-f0-9]{40}$/.test(sha ?? '') || repository !== 'AsoraKK/Lythaus' || !token)
    throw new Error('marketing_release_evidence_context_invalid');
  const evidence = [];
  for (const [name, key] of runs) {
    const runId = env[key];
    if (!/^[1-9]\d*$/.test(runId ?? '')) throw new Error(`marketing_release_evidence_id_invalid:${key}`);
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/actions/runs/${runId}`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
    });
    if (!response.ok || response.redirected) throw new Error(`marketing_release_evidence_http_${response.status}:${name}`);
    const payload = await response.json();
    const checked = assertExactReleaseRun(payload, name, sha);
    if (String(checked.runId) !== runId || payload.status !== 'completed' || payload.repository?.id !== 1010752912)
      throw new Error(`marketing_release_evidence_identity_invalid:${name}`);
    evidence.push(checked);
  }
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyMarketingReleaseEvidence({ env: process.env }).then(evidence => console.log(JSON.stringify({ status: 'VERIFIED', evidence })))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
