import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const trustPath = 'scripts/ci/canonical-sdk-trust.json';
const repositoryId = 1010752912, repositoryOwnerId = 211295889;
const exact = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) && !/^0+$/.test(value);
const git = (root, args, binary = false) => execFileSync('git', ['-C', root, ...args], { encoding: binary ? null : 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

export function validateTrust(trust, candidateSha) {
  if (trust?.schemaVersion !== 'lythaus-sdk-verifier-trust-v1' || trust.state !== 'approved' || !exact(trust.verifierSha) || !exact(trust.verifierTreeSha) || !exact(trust.workflowBlobSha) || !trust.approvalEvidenceRef) throw new Error('TRUSTED_VERIFIER_BOOTSTRAP_REQUIRED');
  if (trust.repositoryId !== repositoryId || trust.repositoryOwnerId !== repositoryOwnerId || trust.protectedRef !== 'refs/heads/main' || trust.workflowPath !== '.github/workflows/dependency-review.yml' || trust.job !== 'canonical-sdk-verification' || !exact(candidateSha) || trust.verifierSha === candidateSha) throw new Error('INDEPENDENT_VERIFIER_REQUIRED');
  return trust;
}

export function validateRepositoryIdentity(repository) {
  if (repository?.id !== repositoryId || repository.name !== 'Lythaus' || repository.owner?.id !== repositoryOwnerId || typeof repository.owner.login !== 'string' || !/^[a-zA-Z0-9-]+$/.test(repository.owner.login) || repository.full_name !== `${repository.owner.login}/Lythaus`) throw new Error('GITHUB_REPOSITORY_PROVENANCE_MISMATCH');
  return { id: repository.id, ownerId: repository.owner.id, fullName: repository.full_name };
}

export function candidateCheckBinding(candidateSha, run) {
  if (!exact(candidateSha) || !exact(run?.head_sha) || !Number.isSafeInteger(run.id)) throw new Error('EXACT_CANDIDATE_CHECK_BINDING_REQUIRED');
  return { candidateSha, workflowCheckSha: run.head_sha, runId: run.id, state: 'unpublished', publicationEligible: false, reason: 'TRUSTED_CANDIDATE_CHECK_PUBLICATION_REQUIRED' };
}

export function applyCandidateCheckGate(result, candidateCheck) {
  if (candidateCheck?.state !== 'unpublished' || candidateCheck.publicationEligible !== false || candidateCheck.reason !== 'TRUSTED_CANDIDATE_CHECK_PUBLICATION_REQUIRED') throw new Error('CANDIDATE_CHECK_PUBLICATION_STATE_REQUIRED');
  return { ...result, verificationConclusion: result.conclusion, candidateCheck, conclusion: 'failure', reason: result.conclusion === 'success' ? candidateCheck.reason : result.reason };
}

export function validateRunContext(trust, context) {
  const { run, workflow, jobs, environment, workflowBlobSha } = context;
  const repository = validateRepositoryIdentity(context.repository);
  if (environment.GITHUB_REPOSITORY !== repository.fullName || environment.GITHUB_REPOSITORY_ID !== String(repository.id) || environment.GITHUB_REPOSITORY_OWNER_ID !== String(repository.ownerId) || environment.GITHUB_EVENT_NAME !== 'workflow_dispatch' || environment.GITHUB_WORKFLOW_REF !== `${repository.fullName}/${trust.workflowPath}@refs/heads/main` || !exact(environment.GITHUB_WORKFLOW_SHA) || environment.GITHUB_REF !== trust.protectedRef) throw new Error('TRUSTED_MAIN_WORKFLOW_REQUIRED');
  if (run.repository?.id !== repository.id || run.head_repository?.id !== repository.id || run.repository?.full_name !== repository.fullName || run.head_repository?.full_name !== repository.fullName || run.id !== Number(environment.GITHUB_RUN_ID) || run.run_attempt !== Number(environment.GITHUB_RUN_ATTEMPT) || run.event !== 'workflow_dispatch' || run.head_branch !== 'main' || run.head_sha !== environment.GITHUB_WORKFLOW_SHA || workflow.id !== run.workflow_id || workflow.path !== trust.workflowPath || workflowBlobSha !== trust.workflowBlobSha) throw new Error('GITHUB_WORKFLOW_PROVENANCE_MISMATCH');
  const matches = jobs.filter(job => job.name === trust.job && job.run_id === run.id && job.run_attempt === run.run_attempt && job.head_sha === run.head_sha && job.status === 'in_progress' && Number.isSafeInteger(job.id));
  if (matches.length !== 1 || environment.GITHUB_JOB !== trust.job) throw new Error('GITHUB_JOB_PROVENANCE_MISMATCH');
  return { verifierSha: trust.verifierSha, verifierTreeSha: trust.verifierTreeSha, workflowSha: run.head_sha, workflowId: workflow.id, workflowPath: workflow.path, repository: repository.fullName, repositoryId: repository.id, repositoryOwnerId: repository.ownerId, runId: run.id, runAttempt: run.run_attempt, jobId: matches[0].id, approvalEvidenceRef: trust.approvalEvidenceRef, candidateCheck: candidateCheckBinding(environment.HEAD_SHA, run) };
}

async function github(path) {
  const response = await fetch(`https://api.github.com/${path}`, { headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`READ_ONLY_GITHUB_PROVENANCE_UNAVAILABLE:${response.status}:${path}`);
  const text = await response.text();
  if (Buffer.byteLength(text) > 8 * 1024 * 1024) throw new Error('GITHUB_PROVENANCE_RESPONSE_LIMIT');
  return JSON.parse(text);
}

export async function anchoredContext(repository, anchor, { request = github, fetchRevision = revision => execFileSync('git', ['-C', repository, 'fetch', '--no-tags', 'origin', revision], { stdio: ['ignore', 'pipe', 'pipe'] }), environment = process.env } = {}) {
  const candidateSha = environment.HEAD_SHA;
  const anchorSha = git(anchor, ['rev-parse', 'HEAD']).trim();
  const repositoryMetadata = await request(`repositories/${repositoryId}`);
  const identity = validateRepositoryIdentity(repositoryMetadata);
  const prefix = `repos/${identity.fullName}/`;
  const main = await request(`${prefix}git/ref/heads/main`);
  if (main.ref !== 'refs/heads/main' || main.object?.sha !== anchorSha) throw new Error('PROTECTED_MAIN_ANCHOR_MISMATCH');
  const trustEntry = git(anchor, ['ls-tree', anchorSha, '--', trustPath]).trim();
  if (!trustEntry.startsWith('100644 blob ')) throw new Error('TRUSTED_VERIFIER_BOOTSTRAP_REQUIRED');
  const trust = validateTrust(JSON.parse(git(anchor, ['show', `${anchorSha}:${trustPath}`])), candidateSha);
  if (!/^\d+$/.test(environment.GITHUB_RUN_ID ?? '') || !/^\d+$/.test(environment.GITHUB_RUN_ATTEMPT ?? '')) throw new Error('GITHUB_RUN_ID_REQUIRED');
  const run = await request(`${prefix}actions/runs/${environment.GITHUB_RUN_ID}`);
  if (!exact(run.head_sha) || !Number.isSafeInteger(run.workflow_id) || run.id !== Number(environment.GITHUB_RUN_ID) || run.run_attempt !== Number(environment.GITHUB_RUN_ATTEMPT)) throw new Error('GITHUB_RUN_PROVENANCE_MISMATCH');
  const workflow = await request(`${prefix}actions/workflows/${run.workflow_id}`);
  const jobs = [];
  for (let page = 1; page <= 10; page++) {
    const response = await request(`${prefix}actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page}`);
    if (!Array.isArray(response.jobs)) throw new Error('GITHUB_JOBS_REQUIRED');
    jobs.push(...response.jobs);
    if (jobs.length >= response.total_count) break;
    if (page === 10) throw new Error('GITHUB_JOB_PAGE_LIMIT');
  }
  for (const revision of [trust.verifierSha, run.head_sha]) fetchRevision(revision);
  if (git(repository, ['rev-parse', `${trust.verifierSha}^{tree}`]).trim() !== trust.verifierTreeSha) throw new Error('VERIFIER_TREE_MISMATCH');
  const entry = git(repository, ['ls-tree', run.head_sha, '--', trust.workflowPath]).trim();
  if (!entry.startsWith('100644 blob ')) throw new Error('TRUSTED_WORKFLOW_FILE_REQUIRED');
  const optionalApproval = path => {
    const record = git(anchor, ['ls-tree', anchorSha, '--', path]).trim();
    if (!record) return null;
    if (!record.startsWith('100644 blob ')) throw new Error('OWNER_APPROVAL_NON_REGULAR_FILE');
    return JSON.parse(git(anchor, ['show', `${anchorSha}:${path}`]));
  };
  return { trust, anchorSha, ownerClassification: optionalApproval('infrastructure/canonical-dart-package-approval.json'), runtimeLicenses: optionalApproval('infrastructure/canonical-dart-runtime-licenses.json'), ...validateRunContext(trust, { repository: repositoryMetadata, run, workflow, jobs, environment, workflowBlobSha: entry.split(/\s+/)[2] }) };
}

export function materializeVerifier(repository, context, destination) {
  const revision = context.verifierSha;
  if (!exact(revision) || git(repository, ['rev-parse', `${revision}^{tree}`]).trim() !== context.verifierTreeSha) throw new Error('TRUSTED_VERIFIER_TREE_REQUIRED');
  const entries = git(repository, ['ls-tree', '-r', '-z', revision]).split('\0').filter(Boolean);
  const manifest = JSON.parse(git(repository, ['show', `${revision}:package.json`]));
  const roots = ['scripts/ci/', '.github/actions/', 'scripts/tests/canonical-sdk-verification.test.mjs', 'scripts/tests/canonical-sdk-isolation.test.mjs', 'scripts/fix-openapi-dart-nested-builder-assignment.mjs', 'scripts/remove-openapi-oauth-support.mjs', 'scripts/trim-trailing-whitespace.js', 'package.json', 'package-lock.json', ...manifest.workspaces.map(path => `${path}/package.json`), 'tools/openapi/spectral-glob/', 'tools/openapi/oasdiff/'];
  let bytes = 0;
  const inventory = [];
  for (const entry of entries) {
    const [metadata, path] = entry.split('\t');
    if (!roots.some(root => root.endsWith('/') ? path.startsWith(root) : path === root)) continue;
    if (!metadata.startsWith('100644 blob ') || !/^[a-zA-Z0-9_./@+-]+$/.test(path) || path.split('/').includes('..')) throw new Error('TRUSTED_RECIPE_NON_REGULAR_FILE');
    const blob = metadata.split(' ')[2], data = git(repository, ['cat-file', 'blob', blob], true);
    bytes += data.length;
    if (data.length > 8 * 1024 * 1024 || bytes > 64 * 1024 * 1024 || inventory.length > 5000) throw new Error('TRUSTED_RECIPE_LIMIT');
    fs.mkdirSync(join(destination, path, '..'), { recursive: true });
    fs.writeFileSync(join(destination, path), data, { flag: 'wx', mode: 0o644 });
    inventory.push({ path, blob });
  }
  if (!inventory.some(value => value.path === 'scripts/ci/canonical-sdk-isolation.mjs')) throw new Error('TRUSTED_VERIFIER_CLOSURE_REQUIRED');
  return inventory;
}

async function main() {
  const repository = resolve('.'), anchor = resolve('.trusted-main'), destination = resolve('.trusted-verifier');
  const context = await anchoredContext(repository, anchor);
  if (process.argv.includes('--prepare-only')) {
    const files = materializeVerifier(repository, context, destination);
    execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--userconfig=/dev/null', '--globalconfig=/dev/null', '--registry=https://registry.npmjs.org', '--cache', join(destination, '.npm-cache')], { cwd: destination, env: { PATH: process.env.PATH, CI: 'true' }, stdio: 'inherit' });
    fs.writeFileSync(join(destination, 'trusted-context.json'), JSON.stringify({ ...context, files }, null, 2) + '\n');
    return;
  }
  if (JSON.parse(fs.readFileSync(join(destination, 'trusted-context.json'))).verifierSha !== context.verifierSha) throw new Error('TRUSTED_VERIFIER_CHANGED_DURING_JOB');
  const { runSourceVerification } = await import(pathToFileURL(join(destination, 'scripts/ci/canonical-sdk-isolation.mjs')));
  const { aggregateReview } = await import(pathToFileURL(join(destination, 'scripts/ci/canonical-sdk-contract.mjs')));
  const directory = resolve('.artifacts/security-run-evidence');
  fs.mkdirSync(directory, { recursive: true });
  const comparison = JSON.parse(fs.readFileSync(join(directory, 'comparison.json')));
  if (comparison.baseSha !== process.env.BASE_SHA || comparison.reviewedHeadSha !== process.env.HEAD_SHA) throw new Error('EXACT_COMPARISON_REQUIRED');
  const tools = JSON.parse(fs.readFileSync(join(destination, 'tools.json')));
  const source = await runSourceVerification({ repository, candidateSha: process.env.HEAD_SHA, recipe: destination, tools, directory: fs.mkdtempSync(join(process.env.RUNNER_TEMP, 'lythaus-sdk-')), trustedContext: context });
  const licenses = JSON.parse(fs.readFileSync(join(directory, 'licenses.json')));
  const result = applyCandidateCheckGate({ ...comparison, trustedContext: context, source, ...aggregateReview(comparison, source, { native: process.env.NATIVE_OUTCOME, licenses: process.env.LICENSE_OUTCOME === 'success' && licenses.conclusion === 'success' ? 'success' : 'failure' }) }, context.candidateCheck);
  fs.writeFileSync(join(directory, 'run.json'), JSON.stringify(result, null, 2) + '\n');
  if (result.conclusion !== 'success') throw new Error(`DEPENDENCY_REVIEW_INCOMPLETE:${result.reason ?? source.reason}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(); }
  catch (error) {
    const directory = resolve('.artifacts/security-run-evidence');
    fs.mkdirSync(directory, { recursive: true });
    let previous = {};
    try {
      const record = JSON.parse(fs.readFileSync(join(directory, 'run.json')));
      if (record.baseSha === process.env.BASE_SHA && (record.reviewedHeadSha ?? record.candidateSha) === process.env.HEAD_SHA) previous = record;
    } catch {}
    fs.writeFileSync(join(directory, 'run.json'), JSON.stringify({ ...previous, baseSha: process.env.BASE_SHA, candidateSha: process.env.HEAD_SHA, conclusion: 'failure', coverageEligible: false, reason: error.message, cleanupError: error.cleanupError }, null, 2) + '\n');
    process.stderr.write(`SDK verification stopped: ${error.message.replace(/[\r\n]/g, ' ')}\n`);
    process.exitCode = error.exitCode ?? 1;
  }
}
