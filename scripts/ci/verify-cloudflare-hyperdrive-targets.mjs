import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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

function sourceOrigin(databaseUrl) {
  const url = new URL(databaseUrl);
  const scheme = url.protocol.replace(':', '').toLowerCase() === 'postgresql' ? 'postgres' : url.protocol.replace(':', '').toLowerCase();
  return {
    scheme,
    host: url.hostname.toLowerCase(),
    port: Number(url.port || 5432),
    database: decodeURIComponent(url.pathname.replace(/^\/+/, '')),
  };
}

function assertManifestAndConfigs() {
  if (manifest.productionTargetBranch !== 'main') throw new Error('production Hyperdrive manifest must target main');
  if (!Array.isArray(manifest.bindings) || manifest.bindings.length === 0) throw new Error('production Hyperdrive manifest is empty');
  for (const entry of manifest.bindings) {
    if (entry.targetBranch !== 'main') throw new Error(`undocumented Hyperdrive target branch: ${entry.worker}/${entry.binding}`);
    if (entry.hyperdriveId !== entry.hyperdriveId.toLowerCase() || !/^[a-f0-9]{32}$/.test(entry.hyperdriveId)) throw new Error(`invalid Hyperdrive ID: ${entry.worker}/${entry.binding}`);
    if (entry.expectedConfigName.includes('-main') || entry.expectedConfigName.includes('production')) throw new Error(`do not infer production from a Hyperdrive name: ${entry.expectedConfigName}`);
    const config = parseJsonc(entry.configPath);
    const productionBinding = (config.hyperdrive ?? []).find((binding) => binding.binding === entry.binding);
    if (!productionBinding || productionBinding.id !== entry.hyperdriveId) throw new Error(`production Hyperdrive binding mismatch: ${entry.worker}/${entry.binding}`);
  }
}

assertManifestAndConfigs();
if (manifestOnly) {
  console.log(`Verified ${manifest.bindings.length} documented production Hyperdrive bindings and IDs.`);
  process.exit(0);
}

const apiToken = process.env.CLOUDFLARE_API_TOKEN ?? '';
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? manifest.accountId ?? '';
const databaseUrl = process.env.PLANETSCALE_SCHEMA_READ_DATABASE_URL ?? '';
const developmentDatabaseUrl = process.env.PLANETSCALE_DEVELOPMENT_SCHEMA_READ_DATABASE_URL ?? '';
const planetScaleApiToken = process.env.PLANETSCALE_API_TOKEN ?? '';
const planetScaleOrganization = process.env.PLANETSCALE_ORGANIZATION ?? manifest.planetScaleOrganization ?? '';
const planetScaleDatabase = process.env.PLANETSCALE_DATABASE ?? manifest.planetScaleDatabase ?? '';
if (!apiToken || !accountId || !databaseUrl || !developmentDatabaseUrl || !planetScaleApiToken) throw new Error('Cloudflare and PlanetScale API credentials plus main and development metadata URLs are required');
if ((process.env.PSCALE_BRANCH_NAME ?? '') !== 'main') throw new Error('Hyperdrive target verification requires PSCALE_BRANCH_NAME=main');

const mainOrigin = sourceOrigin(databaseUrl);
if (mainOrigin.scheme !== 'postgres' || !mainOrigin.host.endsWith('.psdb.cloud')) throw new Error('PlanetScale main metadata URL must be a PostgreSQL psdb.cloud origin');
const mainFingerprint = fingerprint(mainOrigin);
if (mainFingerprint !== manifest.expectedMainOriginFingerprint) throw new Error('PlanetScale main origin fingerprint changed without a reviewed manifest update');
const developmentOrigin = sourceOrigin(developmentDatabaseUrl);
if (developmentOrigin.scheme !== 'postgres' || !developmentOrigin.host.endsWith('.psdb.cloud')) throw new Error('PlanetScale development metadata URL must be a PostgreSQL psdb.cloud origin');
const developmentFingerprint = fingerprint(developmentOrigin);
if (developmentFingerprint === mainFingerprint) throw new Error('PlanetScale main and development origin fingerprints must differ');

async function planetScaleBranchMetadata() {
  const response = await fetch(`https://api.planetscale.com/v1/organizations/${encodeURIComponent(planetScaleOrganization)}/databases/${encodeURIComponent(planetScaleDatabase)}/branches/main`, {
    headers: { authorization: `Bearer ${planetScaleApiToken}`, accept: 'application/json' },
  });
  const envelope = await response.json();
  if (!response.ok || !envelope || envelope.name !== 'main' || envelope.production !== true || envelope.ready !== true) {
    throw new Error('PlanetScale main branch metadata is not production-ready');
  }
  return { name: envelope.name, production: envelope.production, ready: envelope.ready, region: envelope.region?.slug ?? null };
}

const branchMetadata = await planetScaleBranchMetadata();

async function planetScaleDevelopmentBranchMetadata() {
  const response = await fetch(`https://api.planetscale.com/v1/organizations/${encodeURIComponent(planetScaleOrganization)}/databases/${encodeURIComponent(planetScaleDatabase)}/branches/development`, {
    headers: { authorization: `Bearer ${planetScaleApiToken}`, accept: 'application/json' },
  });
  const envelope = await response.json();
  if (!response.ok || !envelope || envelope.name !== 'development' || envelope.production === true || envelope.ready !== true) {
    throw new Error('PlanetScale development branch metadata is not a ready non-production branch');
  }
  return { name: envelope.name, production: envelope.production, ready: envelope.ready, region: envelope.region?.slug ?? null };
}

const developmentBranchMetadata = await planetScaleDevelopmentBranchMetadata();

async function cloudflareConfig(id) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/hyperdrive/configs/${id}`, {
    headers: { authorization: `Bearer ${apiToken}`, accept: 'application/json' },
  });
  const envelope = await response.json();
  if (!response.ok || envelope.success !== true || !envelope.result) throw new Error(`Cloudflare Hyperdrive lookup failed for ${id}`);
  return envelope.result;
}

const results = [];
for (const entry of manifest.bindings) {
  const config = await cloudflareConfig(entry.hyperdriveId);
  const origin = config.origin ?? {};
  const observedFingerprint = fingerprint(origin);
  const cacheDisabled = config.caching?.disabled === true;
  const tlsVerified = config.mtls?.sslmode === 'verify-full';
  const schemeValid = String(origin.scheme).toLowerCase() === 'postgres';
  const hostValid = String(origin.host ?? '').toLowerCase().endsWith('.psdb.cloud');
  const fingerprintMatches = observedFingerprint === mainFingerprint;
  if (config.name !== entry.expectedConfigName || !cacheDisabled || !tlsVerified || !schemeValid || !hostValid || !fingerprintMatches) {
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
    branchFingerprint: 'main',
    roleClass: 'runtime-probe-required',
    cacheDisabled,
    tlsMode: config.mtls.sslmode,
    modifiedOn: config.modified_on ?? null,
  });
}
console.log(JSON.stringify({ status: 'pass', targetBranch: 'main', branchMetadata, developmentBranchMetadata, originFingerprint: mainFingerprint, developmentOriginFingerprint: developmentFingerprint, bindings: results }));
