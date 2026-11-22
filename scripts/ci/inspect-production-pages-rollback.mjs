import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const registry = JSON.parse(readFileSync(new URL('../../infrastructure/lythaus-resource-registry.json', import.meta.url))).liveInventory.cloudflare;
const projects = [registry.pages.admin, registry.pages.flutterWeb, registry.pages.marketing];
const base = 'https://api.cloudflare.com/client/v4/accounts/' + registry.accountId + '/pages/projects/';
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const sha = /^[0-9a-f]{40}$/;

class InspectionError extends Error {}

async function get(token, fetchImpl, path, stage) {
  const response = await fetchImpl(base + path, {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { accept: 'application/json', authorization: 'Bearer ' + token },
  });
  if (response.status !== 200) throw new InspectionError(stage + '_http_' + response.status);
  const payload = await response.json();
  if (payload?.success !== true || payload.errors?.length || !payload.result) {
    throw new InspectionError(stage + '_response_invalid');
  }
  return payload.result;
}

async function observeProject(project, token, fetchImpl) {
  const path = encodeURIComponent(project.name);
  const detail = await get(token, fetchImpl, path, 'project');
  const deployment = detail.canonical_deployment;
  const metadata = deployment?.deployment_trigger?.metadata;
  if (detail.id !== project.id || detail.name !== project.name || detail.production_branch !== 'main'
    || deployment?.project_id !== project.id || deployment.project_name !== project.name
    || deployment.environment !== 'production' || deployment.latest_stage?.name !== 'deploy'
    || deployment.latest_stage.status !== 'success' || (deployment.is_skipped != null && deployment.is_skipped !== false)
    || typeof deployment.id !== 'string' || !uuid.test(deployment.id) || metadata?.branch !== 'main'
    || metadata.commit_dirty !== false || typeof metadata.commit_hash !== 'string' || !sha.test(metadata.commit_hash)) {
    throw new InspectionError('canonical_deployment_unverified');
  }

  // Some Pages responses omit aliases. An active custom domain alone cannot attribute a browser request.
  const aliases = deployment.aliases;
  if (aliases != null && (!Array.isArray(aliases) || !aliases.every(value => typeof value === 'string'))) {
    throw new InspectionError('canonical_aliases_invalid');
  }
  const domains = [];
  for (const host of project.domains) {
    const domain = await get(token, fetchImpl, path + '/domains/' + encodeURIComponent(host), 'domain');
    if (domain.name !== host || domain.status !== 'active') throw new InspectionError('domain_unverified');
    const listed = aliases == null ? null : aliases.some(value =>
      value === host || value === 'https://' + host || value === 'https://' + host + '/');
    domains.push({ host, active: true, listedOnCanonicalDeployment: listed });
  }
  return { project: project.name, projectId: project.id, deploymentId: deployment.id, sourceSha: metadata.commit_hash, domains };
}

export async function inspectProductionPages({ token, fetchImpl = fetch } = {}) {
  if (typeof token !== 'string' || !token.trim()) return { status: 'token_unavailable', projects: [] };
  // Bracket the complete set so a change while observing another project invalidates its pin.
  const snapshot = () => Promise.all(projects.map(async project => {
    try { return await observeProject(project, token, fetchImpl); }
    catch (error) {
      return { project: project.name, error: error instanceof InspectionError ? error.message : 'provider_response_unavailable' };
    }
  }));
  const before = await snapshot();
  if (before.some(project => project.error)) return { status: 'incomplete', projects: before };
  const after = await snapshot();
  if (after.some(project => project.error)) return { status: 'incomplete', projects: after };
  if (JSON.stringify(before) !== JSON.stringify(after)) return { status: 'changed_during_observation', projects: [] };
  return { status: 'canonical_rollback_pins_observed', projects: after };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const receipt = await inspectProductionPages({ token: process.env.CLOUDFLARE_API_TOKEN });
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.status !== 'canonical_rollback_pins_observed') process.exitCode = 1;
}
