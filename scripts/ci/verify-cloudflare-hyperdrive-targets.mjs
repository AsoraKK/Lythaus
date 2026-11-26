import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createReadOnlyClient, TARGET } from './lythaus-new-core-isolation-review.mjs';
import { WORKER_VERSION_ID } from './resolve-production-version-state.mjs';
import { pathToFileURL } from 'node:url';
import { loadFirstFullAdminReceipt } from './first-full-admin-receipt.mjs';
import { transition, prepareReplacementAdminUpload, verifyFirstFullStageEvidence, verifyReplacementAdminUpload, validateProductionDatabaseMap, verifyIsolatedAdminVersions, verifyRollbackPlane } from './production-database-cutover.mjs';

const root = process.cwd();
const manifestPath = path.join(root, 'infrastructure', 'cloudflare', 'native-hyperdrive-production.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const manifestOnly = process.argv.includes('--manifest-only');

function parseJsonc(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1'));
}

function fingerprint(origin) {
  const normalized = {
    scheme: String(origin.scheme).toLowerCase() === 'postgresql' ? 'postgres' : String(origin.scheme).toLowerCase(),
    host: String(origin.host).toLowerCase(),
    port: Number(origin.port ?? 5432),
    database: String(origin.database ?? ''),
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function sourceMetadata(databaseUrl) {
  const url = new URL(databaseUrl);
  const scheme = url.protocol.replace(':', '').toLowerCase() === 'postgresql' ? 'postgres' : url.protocol.replace(':', '').toLowerCase();
  const username = decodeURIComponent(url.username);
  const separator = username.lastIndexOf('.');
  if (separator <= 0 || separator === username.length - 1) {
    throw new Error('PlanetScale main metadata URL must use a branch-qualified username');
  }
  const branchId = username.slice(separator + 1);
  if (!/^[a-z0-9]+$/.test(branchId)) throw new Error('PlanetScale main metadata URL has an invalid branch identifier');
  return {
    origin: {
      scheme,
      host: url.hostname.toLowerCase(),
      port: Number(url.port || 5432),
      database: decodeURIComponent(url.pathname.replace(/^\/+/, '')),
    },
    branchId,
  };
}

function assertManifestAndConfigs() {
  if (manifest.productionTargetBranch !== 'main') throw new Error('production Hyperdrive manifest must target main');
  if (!Array.isArray(manifest.bindings) || manifest.bindings.length === 0) throw new Error('production Hyperdrive manifest is empty');
  for (const entry of manifest.bindings) {
    if (entry.targetBranch !== 'main') throw new Error(`undocumented Hyperdrive target branch: ${entry.worker}/${entry.binding}`);
    if (entry.hyperdriveId !== entry.hyperdriveId.toLowerCase() || !/^[a-f0-9]{32}$/.test(entry.hyperdriveId)) throw new Error(`invalid Hyperdrive ID: ${entry.worker}/${entry.binding}`);
    if (entry.expectedConfigName.includes('-main') || entry.expectedConfigName.includes('production')) throw new Error(`do not infer production from a Hyperdrive name: ${entry.expectedConfigName}`);
    if (!['lythaus_runtime', 'lythaus_admin', 'lythaus_jobs', 'lythaus_privacy'].includes(entry.expectedRoleKey)) {
      throw new Error(`invalid expected role class: ${entry.worker}/${entry.binding}`);
    }
    const config = parseJsonc(entry.configPath);
    const productionBinding = (config.hyperdrive ?? []).find((binding) => binding.binding === entry.binding);
    if (!productionBinding || productionBinding.id !== entry.hyperdriveId) throw new Error(`production Hyperdrive binding mismatch: ${entry.worker}/${entry.binding}`);
  }
}

export function productionConfigs() {
  const configs = new Map();
  for (const entry of fs.readdirSync(path.join(root, 'apps'), { withFileTypes: true })) {
    const file = 'apps/' + entry.name + '/wrangler.jsonc';
    if (entry.isDirectory() && fs.existsSync(path.join(root, file))) configs.set(file, parseJsonc(file));
  }
  return configs;
}

function validRole(role, label) {
  if (manifest.planetScaleDatabase === transition.destination.database) {
    return manifest.planetScaleDatabaseId === transition.destination.databaseId
      && manifest.productionBranchId === transition.destination.branchId
      && manifest.expectedMainOriginFingerprint === transition.destination.originSha256 && role === label;
  }
  return manifest.planetScaleDatabase === transition.rollback.database && /^pscale_api_[a-z0-9]+$/.test(role);
}

export async function verifyHyperdriveTargets({ environment = process.env, fetchImpl = fetch, readOnlyGetOnly: exactReadsRequested = false } = {}) {
  const readOnlyGetOnly = exactReadsRequested || manifest.planetScaleDatabase === transition.destination.database;
  assertManifestAndConfigs();

  const apiToken = environment.CLOUDFLARE_API_TOKEN ?? '';
  const accountId = environment.CLOUDFLARE_ACCOUNT_ID ?? manifest.accountId ?? '';
  const databaseUrl = environment.PLANETSCALE_SCHEMA_READ_DATABASE_URL ?? '';
  const roleIdentifiers = JSON.parse(environment.PSCALE_ROLE_IDENTIFIERS ?? '{}');
  const expectedRuntimeRole = roleIdentifiers.lythaus_runtime ?? '';
  if (!apiToken || !accountId || !databaseUrl) throw new Error('Cloudflare API credentials and the PlanetScale main metadata URL are required');
  if (accountId !== manifest.accountId) throw new Error('Cloudflare account differs from the production manifest');
  if ((environment.PLANETSCALE_DATABASE && environment.PLANETSCALE_DATABASE !== manifest.planetScaleDatabase)
    || (environment.PLANETSCALE_ORGANIZATION && environment.PLANETSCALE_ORGANIZATION !== manifest.planetScaleOrganization)) {
    throw new Error('release database coordinates differ from the production manifest');
  }
  if ((environment.PSCALE_BRANCH_NAME ?? '') !== 'main') throw new Error('Hyperdrive target verification requires PSCALE_BRANCH_NAME=main');
  if (!validRole(expectedRuntimeRole, 'lythaus_runtime')) throw new Error('canonical runtime role identifier is required');

  const mainSource = sourceMetadata(databaseUrl);
  if (mainSource.branchId !== manifest.productionBranchId) throw new Error('PlanetScale branch ID differs from the production manifest');
  const mainOrigin = mainSource.origin;
  const expectedRuntimeConnectionUser = `${expectedRuntimeRole}.${mainSource.branchId}`;
  if (mainOrigin.scheme !== 'postgres' || !mainOrigin.host.endsWith('.psdb.cloud')) throw new Error('PlanetScale main metadata URL must be a PostgreSQL psdb.cloud origin');
  const mainFingerprint = fingerprint(mainOrigin);
  if (mainFingerprint !== manifest.expectedMainOriginFingerprint) throw new Error('PlanetScale main origin fingerprint changed without a reviewed manifest update');

  const requestedIds = new Set(
    (environment.HYPERDRIVE_VERIFY_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  for (const id of requestedIds) {
    if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('HYPERDRIVE_VERIFY_IDS contains an invalid Hyperdrive ID');
  }
  const selectedBindings = requestedIds.size > 0
    ? manifest.bindings.filter((entry) => requestedIds.has(entry.hyperdriveId))
    : manifest.bindings;
  if (requestedIds.size > 0) {
    const selectedIds = new Set(selectedBindings.map((entry) => entry.hyperdriveId));
    if (selectedIds.size !== requestedIds.size || [...requestedIds].some((id) => !selectedIds.has(id))) {
      throw new Error('HYPERDRIVE_VERIFY_IDS requested a Hyperdrive that is not in the reviewed production manifest');
    }
  }
  if (selectedBindings.length === 0) throw new Error('Hyperdrive target verification selected no bindings');

  function sanitizeCloudflareErrors(envelope) {
    return Array.isArray(envelope?.errors)
      ? envelope.errors.map((error) => ({
          code: error?.code ?? null,
          message: typeof error?.message === 'string' ? error.message.slice(0, 240) : null,
        }))
      : [];
  }

  async function cloudflareRequest(resourcePath) {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}${resourcePath}`, {
      method: 'GET',
      redirect: 'error',
      headers: { authorization: `Bearer ${apiToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (readOnlyGetOnly && !response.ok) throw new Error('hyperdrive_read_failed');
    let envelope = null;
    try {
      envelope = await response.json();
    } catch {
      envelope = null;
    }
    return { response, envelope };
  }

  async function cloudflareConfig(id, expectedConfigName) {
    const lookup = await cloudflareRequest(`/hyperdrive/configs/${id}`);
    if (lookup.response.ok && lookup.envelope?.success === true && lookup.envelope?.result) return lookup.envelope.result;
    if (readOnlyGetOnly) throw new Error('hyperdrive_read_failed');

    const list = await cloudflareRequest('/hyperdrive/configs?per_page=100');
    const nameMatches = list.response.ok && list.envelope?.success === true && Array.isArray(list.envelope?.result)
      ? list.envelope.result
          .filter((config) => config?.name === expectedConfigName)
          .map((config) => ({ id: config?.id ?? null, name: config?.name ?? null }))
      : [];

    const diagnostic = {
      requestedId: id,
      expectedConfigName,
      lookupStatus: lookup.response.status,
      lookupErrors: sanitizeCloudflareErrors(lookup.envelope),
      listStatus: list.response.status,
      listErrors: sanitizeCloudflareErrors(list.envelope),
      nameMatches,
    };
    throw new Error(`Cloudflare Hyperdrive lookup failed: ${JSON.stringify(diagnostic)}`);
  }

  if (manifest.planetScaleDatabase === transition.destination.database) {
    await verifyIsolatedAdminVersions(transition.destination, async path => {
      const {response,envelope} = await cloudflareRequest(path);
      if (!response.ok || envelope?.success !== true) throw new Error('isolated Admin version read unavailable');
      return envelope.result;
    });
  }
  const results = [];
  for (const entry of selectedBindings) {
    const expectedRole = roleIdentifiers[entry.expectedRoleKey] ?? '';
    if (!validRole(expectedRole, entry.expectedRoleKey)) {
      throw new Error(`canonical ${entry.expectedRoleKey} role identifier is required`);
    }
    const expectedConnectionUser = `${expectedRole}.${mainSource.branchId}`;
    const config = await cloudflareConfig(entry.hyperdriveId, entry.expectedConfigName);
    const origin = config.origin ?? {};
    const observedFingerprint = fingerprint(origin);
    const cacheDisabled = config.caching?.disabled === true;
    const tlsVerified = config.mtls?.sslmode === 'verify-full';
    const caCertificatePresent = typeof config.mtls?.ca_certificate_id === 'string' && config.mtls.ca_certificate_id.length > 0;
    const schemeValid = String(origin.scheme).toLowerCase() === 'postgres';
    const hostValid = String(origin.host ?? '').toLowerCase().endsWith('.psdb.cloud');
    const fingerprintMatches = observedFingerprint === mainFingerprint;
    const roleMatches = origin.user === expectedConnectionUser && (origin.username === undefined || origin.username === origin.user);
    // Legacy source invariant retained for regression tests: origin.user === expectedRuntimeRole.
    const runtimeRoleMatches = entry.expectedRoleKey === 'lythaus_runtime' ? origin.user === expectedRuntimeConnectionUser : true;
    if (config.id !== entry.hyperdriveId || config.name !== entry.expectedConfigName || !cacheDisabled || !tlsVerified || !caCertificatePresent || !schemeValid || !hostValid || !fingerprintMatches || !roleMatches || !runtimeRoleMatches) {
      throw new Error(`Hyperdrive production target check failed for ${entry.worker}/${entry.binding}`);
    }
    results.push({
      worker: entry.worker,
      binding: entry.binding,
      hyperdriveId: entry.hyperdriveId,
      databaseHost: origin.host ?? null,
      databaseName: origin.database ?? null,
      originFingerprint: observedFingerprint,
      branch: 'main',
      roleClass: entry.expectedRoleKey,
      roleMatches,
      runtimeRoleMatches,
      cacheDisabled,
      tlsMode: config.mtls.sslmode,
      caCertificatePresent,
      modifiedOn: config.modified_on ?? null,
    });
  }
  return { status: 'pass', targetBranch: 'main', originFingerprint: mainFingerprint, bindings: results };
}

// A fresh run first observes its newly staged deployment. Resume and final activation must
// re-read the exact previously observed deployment, without replacing the rollback snapshot.
export async function verifyAdminZeroStage({action, options, versionId, resumed, receipt, fetchImpl = fetch, loadFirstFullReceipt}) {
  if (!WORKER_VERSION_ID.test(versionId)) throw new Error('replacement Admin candidate version ID missing');
  let zeroDeploymentId;
  if (action === '--record-admin-zero-stage') {
    if (resumed) {
      zeroDeploymentId = options.snapshot.observedDeployment?.id;
    } else {
      const deploymentsPath = '/accounts/' + TARGET.account + '/workers/scripts/' + TARGET.worker + '/deployments';
      const client = createReadOnlyClient(options.token, fetchImpl, false, new Set([deploymentsPath]));
      const {result} = await client.get(deploymentsPath);
      const rows = Array.isArray(result) ? result : result?.deployments;
      zeroDeploymentId = rows?.[0]?.id;
    }
  } else if (action === '--recheck-admin-zero-stage') {
    if (receipt?.versionId !== versionId || receipt.sourceSha !== options.releaseSha) {
      throw new Error('replacement Admin zero-stage receipt differs from candidate');
    }
    zeroDeploymentId = receipt.zeroDeploymentId;
  } else {
    throw new Error('unknown replacement Admin zero-stage operation');
  }
  if (!WORKER_VERSION_ID.test(zeroDeploymentId)) throw new Error('replacement Admin zero-stage deployment ID missing');
  const snapshot = {...options.snapshot, observedDeployment: {id: zeroDeploymentId}};
  const verified = await verifyReplacementAdminUpload({...options, versionId, snapshot, requireZeroTraffic: true, fetchImpl});
  const destination = options.destination ?? transition.destination;
  if (action === '--record-admin-zero-stage' && resumed && loadFirstFullReceipt &&
      verified.servingVersionId === destination.isolatedAdminVersions.servingVersionId) {
    const first = await loadFirstFullReceipt();
    if (first) await verifyFirstFullStageEvidence({...options,receipt:first,versionId,snapshot,resumed:true,fetchImpl});
  }
  if (action === '--record-admin-zero-stage' && !resumed && verified.previousDeploymentId !== options.snapshot.observedDeployment?.id) {
    throw new Error('replacement Admin zero-stage predecessor differs from the pre-upload observation');
  }
  const current = {
    workerId: verified.workerId,
    versionId: verified.versionId,
    sourceSha: verified.sourceSha,
    servingVersionId: verified.servingVersionId,
    previousDeploymentId: verified.previousDeploymentId,
    zeroDeploymentId,
  };
  if (action === '--recheck-admin-zero-stage' && !isDeepStrictEqual(receipt, current)) {
    throw new Error('replacement Admin zero-stage receipt changed');
  }
  return current;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const requireDestination = process.argv.includes('--new-core-candidate');
  const workerArg = process.argv.indexOf('--release-admin-worker');
  const releaseAdminWorker = workerArg < 0 ? undefined : process.argv[workerArg + 1];
  if (workerArg >= 0 && !releaseAdminWorker) throw new Error('canonical release Admin Worker missing');
  const configs = productionConfigs();
  const target = validateProductionDatabaseMap(manifest, configs, transition, requireDestination, releaseAdminWorker);
  const adminActions = ['--prepare-admin-upload','--verify-admin-upload','--record-admin-zero-stage','--recheck-admin-zero-stage'];
  const actions = process.argv.filter(arg => adminActions.includes(arg));
  if (actions.length) {
    if (actions.length !== 1) throw new Error('Admin candidate operation is ambiguous');
    const [action] = actions;
    const argument = process.argv[process.argv.indexOf(action) + 1];
    const canonicalPath = 'apps/lythaus-admin-api/wrangler.jsonc';
    const releaseSha = process.env.RELEASE_SHA;
    if (!releaseAdminWorker || !/^[a-f0-9]{40}$/.test(releaseSha ?? '')) throw new Error('canonical Admin upload release is unverified');
    if (target === transition.rollback) {
      if (action === '--prepare-admin-upload') console.log(JSON.stringify({configPath:canonicalPath,message:`Lythaus candidate ${releaseSha}`,temporary:false}));
    } else {
      const dir = path.join(process.env.RUNNER_TEMP,'production-cutover');
      const readJson = file => JSON.parse(fs.readFileSync(file,'utf8'));
      const snapshot = {
        observedDeployment:readJson(path.join(dir,'admin-observed-deployment.json')),
        deployment:readJson(path.join(dir,'admin-before.json')),
        versions:readJson(path.join(dir,'admin-before-versions.json')),
      };
      const options = {releaseSha,snapshot,config:configs.get(canonicalPath),token:process.env.CLOUDFLARE_API_TOKEN};
      const resumed = Boolean(process.env.ACCEPTANCE_RUN_SUMMARY_PATH);
      const normalRelease = process.env.OWNER_TESTING_DEPLOYMENT !== 'true' &&
        process.env.OWNER_TESTING_SUBJECT_DIAGNOSTIC !== 'true' && process.env.ENABLE_SUBJECT_DIAGNOSTIC !== 'true';
      const loadFirstFullReceipt = normalRelease ? () => loadFirstFullAdminReceipt(process.env) : undefined;
      if (action === '--verify-admin-upload') {
        console.log(JSON.stringify(await verifyReplacementAdminUpload({...options,versionId:argument,resumeZeroTraffic:resumed})));
      } else if (action === '--record-admin-zero-stage' || action === '--recheck-admin-zero-stage') {
        const receipt = action === '--recheck-admin-zero-stage' ? JSON.parse(process.env.ADMIN_ZERO_STAGE_RECEIPT || 'null') : undefined;
        const verified = await verifyAdminZeroStage({action,options,versionId:argument,resumed,receipt,loadFirstFullReceipt});
        if (action === '--record-admin-zero-stage') console.log('admin_zero_stage='+JSON.stringify(verified));
      } else {
        let secretFile;
        try { secretFile = readJson(argument); } catch { throw new Error('Admin candidate secret input is unreadable'); }
        if (!secretFile || Object.getPrototypeOf(secretFile) !== Object.prototype ||
          !Object.values(secretFile).every(value => typeof value === 'string' && value.trim().length > 0)) throw new Error('Admin candidate secret input is unverified');
        const prepared = await prepareReplacementAdminUpload({...options,secretNames:Object.keys(secretFile),loadFirstFullReceipt});
        if (prepared.adoptedVersionId) {
          console.log(JSON.stringify(prepared));
        } else {
          // Keep relative assets and entry points rooted at the original config location.
          const configPath = path.join(path.dirname(canonicalPath),`.wrangler-admin-${crypto.randomUUID()}.json`);
          fs.writeFileSync(configPath,JSON.stringify(prepared.config),{flag:'wx',mode:0o600});
          console.log(JSON.stringify({configPath,message:prepared.message,temporary:true}));
        }
      }
    }
  } else if (process.argv.includes('--rollback-database')) {
    if (target === transition.destination) {
      const dir = path.join(process.env.RUNNER_TEMP, 'production-cutover');
      const read = file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      await verifyRollbackPlane({manifest,token:process.env.CLOUDFLARE_API_TOKEN,snapshot:component=>({
        deployment:read(component+'-before.json'),versions:read(component+'-before-versions.json'),
      })});
    }
  } else if (manifestOnly || requireDestination) {
    assertManifestAndConfigs();
    console.log(`Verified ${manifest.bindings.length} documented production Hyperdrive bindings, IDs and role classes.`);
  } else {
    console.log(JSON.stringify(await verifyHyperdriveTargets()));
  }
}
