import fs from 'node:fs';
import path from 'node:path';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
const project = process.env.PAGES_PROJECT ?? '';
const branch = process.env.PAGES_BRANCH ?? '';
const releaseSha = process.env.RELEASE_SHA ?? '';
const outputPath = process.env.PAGES_DEPLOYMENT_EVIDENCE_OUTPUT ?? 'pages-deployment-evidence.json';

if (!/^[0-9a-f]{32}$/i.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID is required');
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required');
if (!/^[A-Za-z0-9._-]+$/.test(project)) throw new Error('PAGES_PROJECT is invalid');
if (!/^[A-Za-z0-9._/-]+$/.test(branch)) throw new Error('PAGES_BRANCH is invalid');
if (!/^[0-9a-f]{40}$/.test(releaseSha)) throw new Error('RELEASE_SHA must be a full 40-character SHA');

const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${encodeURIComponent(project)}/deployments?per_page=25`,
  { headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' } },
);
let payload = {};
try { payload = await response.json(); } catch { payload = {}; }
if (!response.ok || payload.success === false) {
  const error = Array.isArray(payload.errors) ? payload.errors[0] : null;
  const code = error?.code == null ? 'unknown' : String(error.code).replace(/[^0-9A-Za-z_-]/g, '');
  const message = error?.message == null ? 'unknown' : String(error.message).replace(/[^0-9A-Za-z ._:/-]/g, '').slice(0, 240);
  throw new Error(`Cloudflare Pages deployment inventory failed with HTTP ${response.status}, code=${code}, message=${message}`);
}

const deployments = Array.isArray(payload.result) ? payload.result : [];
const match = deployments.find((deployment) => {
  const metadata = deployment?.deployment_trigger?.metadata ?? {};
  const commit = metadata.commit_hash ?? deployment?.source?.commit_hash ?? deployment?.commit_hash;
  const deploymentBranch = metadata.branch ?? deployment?.source?.branch ?? deployment?.branch;
  return commit === releaseSha && deploymentBranch === branch;
});
if (!match) throw new Error(`No Pages deployment matched project=${project}, branch=${branch}, release SHA=${releaseSha}`);

const evidence = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  project,
  branch,
  commitSha: releaseSha,
  deploymentId: String(match.id ?? match.deployment_id ?? ''),
  deploymentUrl: String(match.url ?? match.alias ?? ''),
  environment: match.environment === 'production' ? 'production' : 'preview',
};
if (!evidence.deploymentId || !evidence.deploymentUrl) throw new Error('Pages deployment evidence omitted deployment id or URL');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(evidence));
