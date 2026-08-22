import fs from 'node:fs';
import path from 'node:path';

const organization = process.env.PLANETSCALE_ORGANIZATION ?? 'lythaus';
const database = process.env.PLANETSCALE_DATABASE ?? 'lythaus-core';
const token = process.env.PLANETSCALE_API_TOKEN ?? '';
const outputPath = process.env.PLANETSCALE_AUDIT_OUTPUT ?? '.artifacts/provider-inventory/planetscale.json';

if (!token) throw new Error('PLANETSCALE_API_TOKEN is required');
if (!/^[a-z0-9-]+$/i.test(organization) || !/^[a-z0-9-]+$/i.test(database)) throw new Error('invalid PlanetScale organization/database name');

const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

async function request(url) {
  const response = await fetch(url, { headers });
  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  return {
    status: response.status,
    ok: response.ok,
    payload,
  };
}

function safeError(response) {
  if (response.ok) return null;
  const message = response.payload?.error?.message ?? response.payload?.message ?? response.payload?.error ?? '';
  return String(message).slice(0, 240) || `HTTP ${response.status}`;
}

const base = `https://api.planetscale.com/v1/organizations/${encodeURIComponent(organization)}/databases/${encodeURIComponent(database)}`;
const [databaseResponse, branchesResponse] = await Promise.all([
  request(base),
  request(`${base}/branches`),
]);

if (!databaseResponse.ok) throw new Error(`PlanetScale database inventory failed: ${databaseResponse.status} ${safeError(databaseResponse)}`);
if (!branchesResponse.ok) throw new Error(`PlanetScale branch inventory failed: ${branchesResponse.status} ${safeError(branchesResponse)}`);

const db = databaseResponse.payload ?? {};
const branchPayload = branchesResponse.payload;
const rawBranches = Array.isArray(branchPayload?.data) ? branchPayload.data : Array.isArray(branchPayload) ? branchPayload : [];

const branches = rawBranches.map((branch) => ({
  id: branch.id ?? null,
  name: branch.name ?? null,
  production: branch.production ?? false,
  ready: branch.ready ?? null,
  schemaReady: branch.schema_ready ?? null,
  createdAt: branch.created_at ?? null,
  updatedAt: branch.updated_at ?? null,
  schemaLastUpdatedAt: branch.schema_last_updated_at ?? null,
  parentBranch: typeof branch.parent_branch === 'string' ? branch.parent_branch : branch.parent_branch?.name ?? null,
  region: branch.region ? {
    slug: branch.region.slug ?? null,
    provider: branch.region.provider ?? null,
    postgresqlSupported: branch.region.postgresql_supported ?? null,
  } : null,
}));

const productionBranches = branches.filter((branch) => branch.production).map((branch) => branch.name);
const unexpectedBranches = branches.filter((branch) => !['main', 'development'].includes(branch.name)).map((branch) => branch.name);

const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  organization,
  database: {
    name: db.name ?? database,
    id: db.id ?? null,
    kind: db.kind ?? null,
    region: db.region?.slug ?? db.region ?? null,
    branchesCount: db.branches_count ?? branches.length,
    openSchemaRecommendationsCount: db.open_schema_recommendations_count ?? null,
    schemaLastUpdatedAt: db.schema_last_updated_at ?? null,
  },
  branches,
  assertions: {
    mainExists: branches.some((branch) => branch.name === 'main'),
    productionBranches,
    exactlyOneProductionMain: productionBranches.length === 1 && productionBranches[0] === 'main',
    unexpectedBranches,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Wrote sanitized PlanetScale inventory to ${outputPath}; branches=${branches.length}; unexpected=${unexpectedBranches.length}.`);
if (!report.assertions.mainExists || !report.assertions.exactlyOneProductionMain) process.exitCode = 1;
