import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

export const APP_PAGES_ACCOUNT_ID = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
export const APP_PAGES_HOSTNAME = 'app.lythaus.co';
export const APP_PAGES_SERVING_PROOF_MAX_AGE_MS = 30 * 60 * 1000;

const REPOSITORY = 'AsoraKK/Lythaus';
const PROOF_SCHEMA = 'lythaus-app-pages-serving-proof-v1';
const RECEIPT_SCHEMA = 'lythaus-app-pages-serving-consumption-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const RAW_FIELDS = Object.freeze([
  'schemaVersion', 'proofId', 'source', 'sourceUrl', 'observedAt', 'capturedBy', 'accountId', 'hostname',
  'project', 'projectId', 'branch', 'deploymentId', 'deploymentUrl', 'commitSha', 'environment', 'status',
  'releaseSha', 'previousProductionSha', 'previousProductionRunId', 'previousManifestArtifactId', 'previousManifestDigest',
]);
const RECEIPT_FIELDS = [...RAW_FIELDS, 'proofDigest', 'verifiedAt'].sort();

function fail(message) { throw new Error(message); }
function isCanonicalTime(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function lowerHexUuid(value) { return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null; }
function exactFields(value, fields, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail(message);
}

function canonicalRawProof(value) {
  exactFields(value, RAW_FIELDS, 'app Pages serving proof fields invalid');
  const proof = Object.fromEntries(RAW_FIELDS.map(field => [field, value[field]]));
  if (proof.schemaVersion !== PROOF_SCHEMA || !lowerHexUuid(proof.proofId)
    || proof.source !== 'cloudflare-dashboard-production-panel'
    || proof.accountId !== APP_PAGES_ACCOUNT_ID || proof.hostname !== APP_PAGES_HOSTNAME
    || proof.project !== 'lythaus-web' || !lowerHexUuid(proof.projectId) || !lowerHexUuid(proof.deploymentId)
    || !SHA.test(proof.commitSha ?? '') || !SHA.test(proof.releaseSha ?? '') || !SHA.test(proof.previousProductionSha ?? '')
    || proof.proofId !== proof.proofId?.toLowerCase() || proof.projectId !== proof.projectId?.toLowerCase()
    || proof.deploymentId !== proof.deploymentId?.toLowerCase()
    || !/^[1-9][0-9]*$/.test(String(proof.previousProductionRunId ?? ''))
    || !/^[1-9][0-9]*$/.test(String(proof.previousManifestArtifactId ?? ''))
    || !DIGEST.test(proof.previousManifestDigest ?? '') || typeof proof.capturedBy !== 'string'
    || !/^[A-Za-z0-9-]{1,39}$/.test(proof.capturedBy) || !isCanonicalTime(proof.observedAt)
    || typeof proof.branch !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(proof.branch)
    || proof.branch.includes('..') || proof.branch.includes('//') || proof.branch.endsWith('/') || proof.branch.endsWith('.')
    || proof.environment !== 'production' || proof.status !== 'success') fail('app Pages serving proof identity invalid');
  const expectedSource = `https://dash.cloudflare.com/${APP_PAGES_ACCOUNT_ID}/pages/view/lythaus-web/${proof.deploymentId}`;
  if (proof.sourceUrl !== expectedSource) fail('app Pages serving proof source invalid');
  let deploymentUrl;
  try { deploymentUrl = new URL(proof.deploymentUrl); } catch { fail('app Pages serving proof URL invalid'); }
  if (deploymentUrl.protocol !== 'https:' || deploymentUrl.username || deploymentUrl.password || deploymentUrl.port
    || deploymentUrl.search || deploymentUrl.hash || deploymentUrl.pathname !== '/'
    || !new RegExp(`^[a-z0-9-]+\\.lythaus-web\\.pages\\.dev$`).test(deploymentUrl.hostname)) {
    fail('app Pages serving proof URL invalid');
  }
  return proof;
}

/** Build this only from a manifest whose artifact archive was digest-verified
 * and whose live identities already passed assertAppOnlyPriorRelease. */
export function createAppPagesPriorReleaseBinding({ prior, previousSha, previousRunId, appPage } = {}) {
  const manifest = prior?.manifest;
  if (!manifest || !SHA.test(previousSha ?? '') || manifest.releaseSha !== previousSha
    || manifest.repository?.releaseSha !== previousSha || manifest.status !== 'GO'
    || manifest.productionStatus !== 'GO' || manifest.state !== 'VERIFIED'
    || !isCanonicalTime(manifest.capturedAt) || String(prior.previousRunId) !== String(previousRunId)
    || !/^[1-9][0-9]*$/.test(String(previousRunId ?? ''))
    || !Number.isSafeInteger(prior.artifactId) || prior.artifactId < 1 || !DIGEST.test(prior.archiveDigest ?? '')
    || !appPage || appPage.project !== 'lythaus-web') fail('app Pages prior release binding invalid');
  const web = manifest.surfaces?.web;
  if (!web || web.project !== appPage.project || web.branch !== appPage.branch || web.deploymentId !== appPage.deploymentId
    || web.deploymentUrl !== appPage.deploymentUrl || web.deployedSha !== appPage.commitSha
    || !['ACTIVATED', 'REUSED_PRODUCTION'].includes(web.status)) fail('app Pages prior manifest identity differs');
  let consumedProof = null;
  if (manifest.deployment?.pagesServingProof !== undefined) {
    const record = manifest.deployment.pagesServingProof;
    if (!record || record.schemaVersion !== PROOF_SCHEMA || !UUID.test(record.proofId ?? '')
      || !DIGEST.test(record.proofDigest ?? '')) fail('app Pages prior proof record invalid');
    consumedProof = Object.freeze({ proofId: record.proofId.toLowerCase(), proofDigest: record.proofDigest });
  }
  return Object.freeze({
    schemaVersion: 'lythaus-app-pages-prior-release-binding-v1',
    previousSha,
    previousRunId: String(previousRunId),
    artifactId: prior.artifactId,
    archiveDigest: prior.archiveDigest,
    manifestCapturedAt: manifest.capturedAt,
    web: Object.freeze({ ...appPage, deployedSha: web.deployedSha, status: web.status }),
    consumedProof,
  });
}

function assertPriorBinding(binding, expected) {
  const fields = ['schemaVersion', 'previousSha', 'previousRunId', 'artifactId', 'archiveDigest', 'manifestCapturedAt', 'web', 'consumedProof'];
  exactFields(binding, fields, 'app Pages prior release binding fields invalid');
  if (binding.schemaVersion !== 'lythaus-app-pages-prior-release-binding-v1'
    || binding.previousSha !== expected.previousSha || binding.previousRunId !== String(expected.previousRunId)
    || !Number.isSafeInteger(binding.artifactId) || binding.artifactId < 1 || !DIGEST.test(binding.archiveDigest ?? '')
    || !isCanonicalTime(binding.manifestCapturedAt) || !binding.web || binding.web.project !== 'lythaus-web'
    || !lowerHexUuid(binding.web.projectId) || !lowerHexUuid(binding.web.deploymentId)
    || !SHA.test(binding.web.commitSha ?? '') || !SHA.test(binding.web.deployedSha ?? '')
    || binding.web.deployedSha !== binding.web.commitSha || !['ACTIVATED', 'REUSED_PRODUCTION'].includes(binding.web.status)
    || typeof binding.web.branch !== 'string' || typeof binding.web.deploymentUrl !== 'string') fail('app Pages prior release binding invalid');
  if (binding.consumedProof !== null) {
    exactFields(binding.consumedProof, ['proofId', 'proofDigest'], 'app Pages prior proof binding fields invalid');
    if (!lowerHexUuid(binding.consumedProof.proofId) || binding.consumedProof.proofId !== binding.consumedProof.proofId.toLowerCase()
      || !DIGEST.test(binding.consumedProof.proofDigest ?? '')) fail('app Pages prior proof binding invalid');
  }
  return binding;
}

function assertMatchesSnapshot(proof, snapshot, binding, expected) {
  if (!snapshot || snapshot.project !== 'lythaus-web' || !lowerHexUuid(snapshot.projectId)
    || !lowerHexUuid(snapshot.deploymentId) || !SHA.test(snapshot.commitSha ?? '')
    || snapshot.project !== proof.project || snapshot.projectId !== proof.projectId || snapshot.branch !== proof.branch
    || snapshot.deploymentId !== proof.deploymentId || snapshot.deploymentUrl !== proof.deploymentUrl
    || snapshot.commitSha !== proof.commitSha) fail('app Pages serving proof does not match the authenticated API record');
  const web = binding.web;
  if (web.project !== snapshot.project || web.projectId !== snapshot.projectId || web.branch !== snapshot.branch
    || web.deploymentId !== snapshot.deploymentId || web.deploymentUrl !== snapshot.deploymentUrl
    || web.commitSha !== snapshot.commitSha || web.deployedSha !== snapshot.commitSha) {
    fail('app Pages serving proof does not match the verified prior release');
  }
  if (proof.releaseSha !== expected.releaseSha || proof.previousProductionSha !== binding.previousSha
    || proof.previousProductionRunId !== binding.previousRunId || proof.previousManifestArtifactId !== String(binding.artifactId)
    || proof.previousManifestDigest !== binding.archiveDigest || proof.branch !== snapshot.branch) {
    fail('app Pages serving proof is bound to a different release');
  }
}

function proofDigest(proof) {
  return `sha256:${createHash('sha256').update(JSON.stringify(proof)).digest('hex')}`;
}

function assertFreshness(proof, referenceTime) {
  const observedAt = Date.parse(proof.observedAt);
  if (!Number.isFinite(referenceTime) || observedAt > referenceTime + 30_000
    || referenceTime - observedAt > APP_PAGES_SERVING_PROOF_MAX_AGE_MS) fail('app Pages serving proof is stale or from the future');
}

/** Validate the manual dashboard observation against the authenticated Pages
 * API snapshot and the integrity-checked prior canonical manifest. */
export function validateAppPagesServingProof({ proof: input, snapshot, priorRelease, releaseSha,
  previousSha, previousRunId, actor, now = Date.now() } = {}) {
  const binding = assertPriorBinding(priorRelease, { previousSha, previousRunId });
  const proof = canonicalRawProof(input);
  if (proof.capturedBy !== actor || !/^[A-Za-z0-9-]{1,39}$/.test(actor ?? '')) fail('app Pages serving proof actor differs from the protected dispatch');
  if (proof.previousProductionSha !== binding.previousSha || Date.parse(proof.observedAt) <= Date.parse(binding.manifestCapturedAt)) {
    fail('app Pages serving proof is not newer than the verified prior release');
  }
  assertMatchesSnapshot(proof, snapshot, binding, { releaseSha, previousRunId });
  assertFreshness(proof, now);
  const digest = proofDigest(proof);
  if (binding.consumedProof && (binding.consumedProof.proofId === proof.proofId || binding.consumedProof.proofDigest === digest)) {
    fail('app Pages serving proof was already consumed by the prior release');
  }
  return Object.freeze({ ...proof, proofDigest: digest, verifiedAt: new Date(now).toISOString() });
}

/** Recheck a receipt minted by the protected preparation job. At rollback
 * readback, freshness is anchored to that successful pre-deploy validation. */
export function verifyAppPagesServingProofReceipt({ receipt, snapshot, priorRelease, releaseSha,
  previousSha, previousRunId, actor, now = Date.now(), requireFreshNow = true } = {}) {
  exactFields(receipt, RECEIPT_FIELDS, 'app Pages serving proof receipt fields invalid');
  const proof = canonicalRawProof(Object.fromEntries(RAW_FIELDS.map(field => [field, receipt[field]])));
  const binding = assertPriorBinding(priorRelease, { previousSha, previousRunId });
  if (!isCanonicalTime(receipt.verifiedAt) || Date.parse(receipt.verifiedAt) > now + 30_000
    || receipt.proofDigest !== proofDigest(proof) || proof.capturedBy !== actor
    || Date.parse(proof.observedAt) > Date.parse(receipt.verifiedAt) + 30_000) fail('app Pages serving proof receipt integrity invalid');
  assertFreshness(proof, Date.parse(receipt.verifiedAt));
  if (requireFreshNow) assertFreshness(proof, now);
  if (proof.previousProductionSha !== binding.previousSha || Date.parse(proof.observedAt) <= Date.parse(binding.manifestCapturedAt)) {
    fail('app Pages serving proof is not newer than the verified prior release');
  }
  assertMatchesSnapshot(proof, snapshot, binding, { releaseSha, previousRunId });
  if (binding.consumedProof && (binding.consumedProof.proofId === proof.proofId || binding.consumedProof.proofDigest === receipt.proofDigest)) {
    fail('app Pages serving proof was already consumed by the prior release');
  }
  return Object.freeze({ ...proof, proofDigest: receipt.proofDigest, verifiedAt: receipt.verifiedAt });
}

function completeArtifactPages(pages, expectedName) {
  if (!Array.isArray(pages) || pages.length < 1 || pages.length > 10
    || pages.some(page => !Array.isArray(page?.artifacts) || !Number.isSafeInteger(page?.total_count)
      || page.total_count < 0 || page.total_count > 1000 || page.total_count !== pages[0].total_count)) {
    fail('app Pages proof replay inventory is invalid');
  }
  const artifacts = pages.flatMap(page => page.artifacts);
  if (artifacts.length !== pages[0].total_count) fail('app Pages proof replay inventory is incomplete');
  if (artifacts.some(item => item?.name === expectedName)) fail('app Pages serving proof was already consumed');
  return artifacts;
}

/** A receipt artifact is written before any Pages deployment. This prevents
 * reusing the same fresh proof after a failed workflow attempt. */
export function assertAppPagesServingProofNotReplayed({ proofDigest: digest, runId, executeGh = args => {
  return execFileSync('gh', ['api', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
} } = {}) {
  if (!DIGEST.test(digest ?? '') || !/^[1-9][0-9]*$/.test(String(runId ?? ''))) fail('app Pages proof replay inputs invalid');
  const artifactName = `lythaus-app-only-pages-serving-${digest.slice('sha256:'.length)}`;
  let pages;
  try {
    const query = `repos/${REPOSITORY}/actions/artifacts?name=${encodeURIComponent(artifactName)}&per_page=100`;
    pages = JSON.parse(executeGh([query, '--paginate', '--slurp']));
  } catch { fail('app Pages proof replay inventory unavailable'); }
  completeArtifactPages(pages, artifactName);
  return Object.freeze({ artifactName, runId: String(runId) });
}

export function writeAppPagesServingProofConsumption({ path: outputPath, proof, releaseSha, runId, runAttempt, previousRunId, now = Date.now() } = {}) {
  if (!path.isAbsolute(outputPath ?? '') || !SHA.test(releaseSha ?? '') || !/^[1-9][0-9]*$/.test(String(runId ?? ''))
    || !/^[1-9][0-9]*$/.test(String(runAttempt ?? ''))
    || !/^[1-9][0-9]*$/.test(String(previousRunId ?? '')) || !proof || !DIGEST.test(proof.proofDigest ?? '')) {
    fail('app Pages proof consumption receipt inputs invalid');
  }
  const value = Object.freeze({ schemaVersion: RECEIPT_SCHEMA, proofDigest: proof.proofDigest,
    proofId: proof.proofId, releaseSha, runId: String(runId), runAttempt: String(runAttempt),
    previousRunId: String(previousRunId), consumedAt: new Date(now).toISOString() });
  writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  return value;
}
