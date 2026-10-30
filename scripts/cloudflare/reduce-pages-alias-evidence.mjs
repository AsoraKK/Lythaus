const PROJECT = 'lythaus-web';
const PROJECT_ID = 'd00dfa8e-e4e1-47e0-8387-e3bc24de3493';
const ACCOUNT_ID = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
const HOST = 'app.lythaus.co';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{40}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) {
    throw new Error('unexpected_or_sensitive_input_field');
  }
}

function completePages(pages) {
  if (!Array.isArray(pages) || pages.length === 0 || pages.length > 100) throw new Error('pagination_incomplete');
  const first = pages[0];
  exactKeys(first, ['page', 'perPage', 'totalPages', 'totalCount', 'records']);
  const { perPage, totalPages, totalCount } = first;
  if (!Number.isSafeInteger(perPage) || perPage < 1 || perPage > 100
    || !Number.isSafeInteger(totalPages) || totalPages < 1 || totalPages > 100
    || !Number.isSafeInteger(totalCount) || totalCount < 0
    || totalPages !== Math.max(1, Math.ceil(totalCount / perPage)) || pages.length !== totalPages) {
    throw new Error('pagination_incomplete');
  }
  const records = [];
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index];
    exactKeys(page, ['page', 'perPage', 'totalPages', 'totalCount', 'records']);
    const expected = index === totalPages - 1 ? totalCount - index * perPage : perPage;
    if (page.page !== index + 1 || page.perPage !== perPage || page.totalPages !== totalPages
      || page.totalCount !== totalCount || !Array.isArray(page.records) || page.records.length !== expected) {
      throw new Error('pagination_incomplete');
    }
    records.push(...page.records);
  }
  return records;
}

function normalizeAlias(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('aliases_invalid');
  let url;
  try { url = new URL(value); } catch { throw new Error('aliases_invalid'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error('aliases_invalid');
  }
  const host = url.hostname.toLowerCase();
  if (host.replace(/\.$/, '') === HOST && (host !== HOST || url.href !== `https://${HOST}/`)) {
    throw new Error('target_alias_ambiguous');
  }
  if (url.href.includes('?') || url.href.includes('#')) throw new Error('aliases_invalid');
  return url.href;
}

function normalizeDeploymentUrl(value, subdomain) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('deployment_invalid');
  let url;
  try { url = new URL(value); } catch { throw new Error('deployment_invalid'); }
  const suffix = `.${subdomain}`, host = url.hostname.toLowerCase();
  const label = host.endsWith(suffix) ? host.slice(0, -suffix.length) : '';
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
    || url.href.includes('?') || url.href.includes('#') || url.pathname !== '/'
    || !/^[a-z0-9-]{1,63}$/.test(label)) throw new Error('deployment_invalid');
  return url.origin;
}

/** Fixed-category diagnostics for already sanitized snapshots; never authorizes a match. */
export function diagnosePagesAliasEvidence(input) {
  const issues = new Set();
  for (const snapshot of [input?.first, input?.second]) {
    const ids = new Set(), urls = new Set();
    let matches = 0;
    const pages = Array.isArray(snapshot?.deploymentPages) ? snapshot.deploymentPages : [];
    for (const page of pages) {
      const records = Array.isArray(page?.records) ? page.records : [];
      for (const deployment of records) {
        if (!deployment || typeof deployment !== 'object' || Array.isArray(deployment)) {
          issues.add('deployment_record_invalid');
          continue;
        }
        if (typeof deployment.id !== 'string' || !UUID.test(deployment.id)) issues.add('deployment_id_format_invalid');
        else if (ids.has(deployment.id)) issues.add('deployment_id_duplicate');
        else ids.add(deployment.id);
        if (deployment.projectId !== PROJECT_ID || deployment.projectName !== PROJECT) issues.add('deployment_project_binding_invalid');
        if (!['production', 'preview'].includes(deployment.environment)) issues.add('deployment_environment_value_invalid');
        if (deployment.isSkipped !== null && typeof deployment.isSkipped !== 'boolean') issues.add('deployment_is_skipped_invalid');
        if (deployment.stageName !== null && !['queued', 'initialize', 'clone_repo', 'build', 'deploy'].includes(deployment.stageName)) issues.add('deployment_stage_name_value_invalid');
        if (deployment.stageStatus !== null && !['success', 'idle', 'active', 'failure', 'canceled', 'skipped'].includes(deployment.stageStatus)) issues.add('deployment_stage_status_value_invalid');
        if (deployment.branch !== null && deployment.branch !== '' && (typeof deployment.branch !== 'string' || !BRANCH.test(deployment.branch))) issues.add('deployment_branch_format_invalid');
        if (deployment.commitSha !== null && deployment.commitSha !== '' && (typeof deployment.commitSha !== 'string' || !SHA.test(deployment.commitSha))) issues.add('deployment_commit_sha_format_invalid');
        if (deployment.commitDirty !== null && typeof deployment.commitDirty !== 'boolean') issues.add('deployment_commit_dirty_invalid');
        try {
          const url = normalizeDeploymentUrl(deployment.url, snapshot?.project?.subdomain);
          if (urls.has(url)) issues.add('deployment_url_duplicate');
          else urls.add(url);
        } catch { issues.add('deployment_url_format_invalid'); }
        if (deployment.aliases === null) continue;
        if (!Array.isArray(deployment.aliases) || deployment.aliases.length > 1000) {
          issues.add('deployment_aliases_invalid');
          continue;
        }
        const aliases = new Set();
        for (const value of deployment.aliases) {
          try {
            const alias = normalizeAlias(value);
            if (aliases.has(alias)) issues.add('deployment_alias_duplicate');
            aliases.add(alias);
            if (alias === `https://${HOST}/`) {
              matches++;
              if (deployment.environment !== 'production' || deployment.isSkipped !== false
                || deployment.stageName !== 'deploy' || deployment.stageStatus !== 'success'
                || deployment.branch !== 'main' || typeof deployment.commitSha !== 'string' || !SHA.test(deployment.commitSha)
                || deployment.commitDirty !== false) issues.add('alias_match_invalid');
            }
          } catch (error) {
            issues.add(error?.message === 'target_alias_ambiguous' ? 'target_alias_ambiguous' : 'deployment_alias_url_invalid');
          }
        }
      }
    }
    if (matches > 1) issues.add('alias_match_ambiguous');
  }
  return [...issues].sort();
}

function inspect(snapshot) {
  exactKeys(snapshot, ['at', 'project', 'domain', 'deploymentPages']);
  if (typeof snapshot.at !== 'string' || !ISO_UTC.test(snapshot.at) || !Number.isFinite(Date.parse(snapshot.at))
    || new Date(snapshot.at).toISOString() !== snapshot.at.replace(/(?<!\.\d{3})Z$/, '.000Z')) {
    throw new Error('timestamp_invalid');
  }
  exactKeys(snapshot.project, ['accountId', 'id', 'name', 'productionBranch', 'subdomain']);
  if (snapshot.project.accountId !== ACCOUNT_ID || snapshot.project.id !== PROJECT_ID
    || snapshot.project.name !== PROJECT || snapshot.project.productionBranch !== 'main'
    || typeof snapshot.project.subdomain !== 'string'
    || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.pages\.dev$/.test(snapshot.project.subdomain)) {
    throw new Error('project_binding_invalid');
  }
  exactKeys(snapshot.domain, ['name', 'status']);
  if (snapshot.domain.name !== HOST) throw new Error('domain_binding_invalid');
  if (snapshot.domain.status !== 'active') throw new Error('domain_inactive');
  const domainIndex = [snapshot.domain.name, snapshot.domain.status];

  const deployments = completePages(snapshot.deploymentPages);
  const ids = new Set(), urls = new Set(), index = [], matches = [];
  let aliasesUnavailable = false;
  for (const deployment of deployments) {
    exactKeys(deployment, ['id', 'projectId', 'projectName', 'environment', 'isSkipped', 'stageName',
      'stageStatus', 'branch', 'commitSha', 'commitDirty', 'url', 'aliases']);
    if (typeof deployment.id !== 'string' || !UUID.test(deployment.id) || ids.has(deployment.id) || deployment.projectId !== PROJECT_ID
      || deployment.projectName !== PROJECT || (deployment.aliases !== null && !Array.isArray(deployment.aliases))
      || (Array.isArray(deployment.aliases) && deployment.aliases.length > 1000) || !['production', 'preview'].includes(deployment.environment)
      || (deployment.isSkipped !== null && typeof deployment.isSkipped !== 'boolean')
      || (deployment.stageName !== null && !['queued', 'initialize', 'clone_repo', 'build', 'deploy'].includes(deployment.stageName))
      || (deployment.stageStatus !== null && !['success', 'idle', 'active', 'failure', 'canceled', 'skipped'].includes(deployment.stageStatus))
      || (deployment.branch !== null && deployment.branch !== '' && (typeof deployment.branch !== 'string' || !BRANCH.test(deployment.branch)))
      || (deployment.commitSha !== null && deployment.commitSha !== '' && (typeof deployment.commitSha !== 'string' || !SHA.test(deployment.commitSha)))
      || (deployment.commitDirty !== null && typeof deployment.commitDirty !== 'boolean')) {
      throw new Error('deployment_invalid');
    }
    const url = normalizeDeploymentUrl(deployment.url, snapshot.project.subdomain);
    if (urls.has(url)) throw new Error('deployment_invalid');
    urls.add(url);
    ids.add(deployment.id);
    const aliases = deployment.aliases === null ? null : deployment.aliases.map(normalizeAlias).sort();
    if (aliases === null) aliasesUnavailable = true;
    if (aliases !== null && new Set(aliases).size !== aliases.length) throw new Error('aliases_invalid');
    const count = aliases === null ? 0 : aliases.filter(alias => alias === `https://${HOST}/`).length;
    index.push([deployment.id, deployment.environment, deployment.isSkipped, deployment.stageName,
      deployment.stageStatus, deployment.branch, deployment.commitSha, deployment.commitDirty, url, aliases]);
    if (count) {
      if (count !== 1 || deployment.environment !== 'production' || deployment.isSkipped !== false
        || deployment.stageName !== 'deploy' || deployment.stageStatus !== 'success'
        || deployment.branch !== 'main' || typeof deployment.commitSha !== 'string' || !SHA.test(deployment.commitSha)
        || deployment.commitDirty !== false) {
        throw new Error('alias_match_invalid');
      }
      matches.push({ deploymentId: deployment.id, deploymentUrl: url,
        commitSha: deployment.commitSha, branch: 'main' });
    }
  }
  index.sort((a, b) => a[0].localeCompare(b[0]));
  if (matches.length > 1) throw new Error('alias_match_ambiguous');
  return { at: snapshot.at, subdomain: snapshot.project.subdomain, domainIndex,
    deploymentCount: deployments.length, index, aliasesUnavailable, match: matches[0] ?? null };
}

/** Accepts only pre-sanitized snapshots; performs no network or credential access. */
export function reducePagesAliasEvidence(input) {
  exactKeys(input, ['first', 'second']);
  const { first, second } = input;
  const a = inspect(first), b = inspect(second);
  if (Date.parse(b.at) < Date.parse(a.at)) throw new Error('timestamp_invalid');
  if (a.subdomain !== b.subdomain || JSON.stringify(a.domainIndex) !== JSON.stringify(b.domainIndex)
    || JSON.stringify(a.index) !== JSON.stringify(b.index) || JSON.stringify(a.match) !== JSON.stringify(b.match)) {
    throw new Error('observation_changed');
  }
  const match = !a.aliasesUnavailable && a.match
    ? { deploymentId: a.match.deploymentId, commitSha: a.match.commitSha, branch: 'main' } : null;
  return Object.freeze({ schemaVersion: 'lythaus-pages-alias-observation-v1',
    status: match ? 'OBSERVED_UNIQUE_ALIAS' : 'INCONCLUSIVE', authorization: 'NONE',
    project: PROJECT, hostname: HOST, firstObservedAt: a.at, secondObservedAt: b.at,
    deploymentCount: a.deploymentCount, match,
    ...(match ? {} : { reason: a.aliasesUnavailable ? 'aliases_unavailable' : 'hostname_alias_absent' }) });
}
