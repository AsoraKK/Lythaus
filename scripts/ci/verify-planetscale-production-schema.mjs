import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;
const root = process.cwd();
const branch = process.env.PSCALE_BRANCH_NAME ?? '';
const databaseUrl = process.env.PLANETSCALE_SCHEMA_READ_DATABASE_URL ?? '';
const manifestOnly = process.argv.includes('--manifest-only');
const committedOnly = process.argv.includes('--committed') || process.env.CI === 'true';
const requireBudgetMigration = process.env.REQUIRE_BUDGET_MIGRATION === 'true';
const migrationsPath = 'database/planetscale/migrations';
const expectedMigrations = [
  { name: '0000_preflight.sql', repositorySha256: '813a3bc7d2ff3c5f332ceefac17791b3916e62ade69f5e377fbe31f48b8cfc87', lfOnlyBreaks: [], appliedBytes: 195, appliedSha256: '8d4466de2ffa8c1fb3f6cb46464045e5ef199a64fcba312682623945636eaf33' },
  { name: '0001_extensions_and_schemas.sql', repositorySha256: '49139ae2435dc9cd232e0b7c8d7799de103a8fc966a6f1eea69335d262bfbfdc', lfOnlyBreaks: [[1, 3]], appliedBytes: 817, appliedSha256: '30ed94cab4f9aae8b5ca9701214c0ec6e1b7a8182daa1c4a76bca8f37e7da610' },
  { name: '0002_core_tables.sql', repositorySha256: 'bf806834f6b03dd7de4f63b2d440a74defbc39c9c25be6ccce206afdfbd2249e', lfOnlyBreaks: [[3, 3], [93, 97], [246, 259], [267, 275]], appliedBytes: 14_232, appliedSha256: '81e3ad9f8f6253219384164c5f36cdc15ad91442371e62497aa27f9e326c0070' },
  { name: '0003_domain_extensions.sql', repositorySha256: '8e5a86ed2432a5072dc203367bf8c678363c778d761617ba3e6c65771e052587', lfOnlyBreaks: [], appliedBytes: 2_550, appliedSha256: '71b5afe5a01158cc437e75bb82cebbfced6921fc815ad35a647e3da4e1c2818d' },
  { name: '0004_launch_contract.sql', repositorySha256: '2eb196c98476bee621bda364322ca8d91d3c1b75c486c0607e57fd1a78a0c262', lfOnlyBreaks: [[28, 36], [300, 307]], appliedBytes: 23_422, appliedSha256: '962ccce035cac919de65101c713f4d0db079760550e646af32b794a4c76e8020' },
  { name: '0005_auth_revocation.sql', repositorySha256: '1abeab5b18a2f55fd995a5a225e8f992c4a49f52136b46a94023d7ee6dec77fd', lfOnlyBreaks: [], appliedBytes: 668, appliedSha256: '47cd39f391a296009bda9abede39dbeddef6519ecffeda3a58b50e0742f09961' },
  { name: '0006_admin_role_expansion.sql', repositorySha256: '235acb9b66c5a7803bd50cb3309dda12dfaeb0ea05ef9069809ead9dda94b989', lfOnlyBreaks: [], appliedBytes: 295, appliedSha256: 'aa3ba8a9aa252ff250dd5ea9e4c7c975c23b04ff8eef40ee30c2137b98d917a7' },
  { name: '0007_contact_emails.sql', repositorySha256: 'b6bb0a30b7cc42de61c89fee153d99ab662ccb7271d98ac63b6376f9153c6fa9', lfOnlyBreaks: [[1, 77]], appliedBytes: 3_071, appliedSha256: 'b6bb0a30b7cc42de61c89fee153d99ab662ccb7271d98ac63b6376f9153c6fa9' },
  { name: '0008_legacy_relink_status.sql', repositorySha256: 'ae74550e61dcd93aebaae29ed4ec91587284524a0f6b6ef3e35b36467dec891a', lfOnlyBreaks: [[1, 9]], appliedBytes: 389, appliedSha256: 'ae74550e61dcd93aebaae29ed4ec91587284524a0f6b6ef3e35b36467dec891a' },
  { name: '0009_cost_budget_enforcement.sql', repositorySha256: 'b7e0c47f38e1169c4c07558229137f739687133566478474ca6b174dd4bdee2b', lfOnlyBreaks: [[1, 50]], appliedBytes: 2_544, appliedSha256: 'f01612bd36151317d08c3dc7d9903e1c46e62ec076876fc3e4890ad794c7602b' },
  { name: '0010_native_runtime_parity.sql', repositorySha256: '4dba201af44a2c9fad06a8b4c0706bd2a6ee4181aca0d7145f3d57e00b046ce6', lfOnlyBreaks: [], appliedBytes: 2_304, appliedSha256: '01bd4c8fc4548fed3d6504f242ca146504fe60c8b49eed868880f82d8d0c0c94' },
  { name: '0011_email_guest_auth_only.sql', repositorySha256: '427afd1ad035b35f998ab2316a47f73556a1a49e66a2f92fce1c05926236f72d', lfOnlyBreaks: [], appliedBytes: 606, appliedSha256: '0536054f579e4f0bad3f459a19abeae3706b45d1c488a205aa8a1274632f356e' },
];
const expectedMigrationBytes = 51_104;
const expectedMigrationSetSha256 = 'da6cd97b29ab5ea26dd0237e413fbe868d696df4c082ede81ed950faa3f34ced';

function gitOutput(args) {
  return execFileSync('git', args, { cwd: root, encoding: null, maxBuffer: 4 * 1024 * 1024 });
}

const trackedMigrationNames = committedOnly
  ? gitOutput(['ls-tree', '-r', '--name-only', 'HEAD', '--', migrationsPath])
    .toString('utf8')
    .split(/\r?\n/)
    .filter((file) => file.endsWith('.sql'))
    .map((file) => path.posix.basename(file))
    .sort()
  : fs.readdirSync(path.join(root, migrationsPath))
    .filter((file) => file.endsWith('.sql'))
    .sort();
const expectedMigrationNames = expectedMigrations.map(({ name }) => name);

if (JSON.stringify(trackedMigrationNames) !== JSON.stringify(expectedMigrationNames)) {
  throw new Error(`production migration file set mismatch: ${trackedMigrationNames.join(', ')}`);
}

const migrations = expectedMigrations.map((expected) => {
  const rawContents = committedOnly
    ? gitOutput(['show', `HEAD:${migrationsPath}/${expected.name}`])
    : fs.readFileSync(path.join(root, migrationsPath, expected.name));
  const repositoryText = rawContents.toString('utf8').replace(/\r\n/g, '\n');
  const repositoryContents = Buffer.from(repositoryText, 'utf8');
  const repositorySha256 = createHash('sha256').update(repositoryContents).digest('hex');
  if (repositorySha256 !== expected.repositorySha256) {
    throw new Error(`${committedOnly ? 'committed' : 'working-tree'} migration SHA-256 mismatch: ${expected.name}`);
  }
  if (repositoryText.includes('\r')) {
    throw new Error(`migration contains unexpected carriage returns: ${expected.name}`);
  }
  const lfOnlyBreaks = new Set(expected.lfOnlyBreaks.flatMap(([start, end]) => (
    Array.from({ length: end - start + 1 }, (_, offset) => start + offset)
  )));
  let breakIndex = 0;
  const appliedContents = Buffer.from(repositoryText.replace(/\n/g, () => {
    breakIndex += 1;
    return lfOnlyBreaks.has(breakIndex) ? '\n' : '\r\n';
  }), 'utf8');
  const appliedSha256 = createHash('sha256').update(appliedContents).digest('hex');
  if (appliedContents.length !== expected.appliedBytes || appliedSha256 !== expected.appliedSha256) {
    throw new Error(`approved applied migration payload mismatch: ${expected.name}`);
  }
  return {
    name: expected.name,
    contents: appliedContents,
    checksum: appliedSha256,
  };
});

const migrationPayload = Buffer.concat(migrations.flatMap(({ contents }, index) => (
  index === 0 ? [contents] : [Buffer.from([0x0a]), contents]
)));
const migrationSetSha256 = createHash('sha256').update(migrationPayload).digest('hex');

if (migrationPayload.length !== expectedMigrationBytes) {
  throw new Error(`production migration payload is ${migrationPayload.length} bytes; expected ${expectedMigrationBytes}`);
}
if (migrationSetSha256 !== expectedMigrationSetSha256) {
  throw new Error(`production migration-set SHA-256 mismatch: ${migrationSetSha256}`);
}

if (manifestOnly) {
  console.log(`Verified ${migrations.length} committed production migrations, ${migrationPayload.length} bytes.`);
  console.log(`Approved migration-set SHA-256: ${migrationSetSha256}`);
  process.exit(0);
}

if (branch !== 'main') throw new Error('production schema verification requires PSCALE_BRANCH_NAME=main');
if (!databaseUrl) throw new Error('PLANETSCALE_SCHEMA_READ_DATABASE_URL is required');

const connection = new URL(databaseUrl);
if (connection.searchParams.get('sslmode') !== 'verify-full') {
  throw new Error('production schema verification requires sslmode=verify-full');
}
if (connection.searchParams.get('sslrootcert') === 'system') {
  connection.searchParams.delete('sslrootcert');
}

const client = new Client({ connectionString: connection.toString(), ssl: { rejectUnauthorized: true } });
await client.connect();
try {
  await client.query('BEGIN READ ONLY');
  const registry = await client.query(
    'SELECT version, checksum FROM system.schema_migrations ORDER BY version'
  );
  const recorded = new Map(registry.rows.map((row) => [row.version, row.checksum]));
  const appliedThrough = requireBudgetMigration
    ? '0009_cost_budget_enforcement.sql'
    : '0008_legacy_relink_status.sql';
  const appliedThroughIndex = migrations.findIndex(({ name }) => name === appliedThrough);
  if (appliedThroughIndex < 0) throw new Error(`production migration manifest is missing ${appliedThrough}`);
  const expectedAppliedMigrations = migrations.slice(0, appliedThroughIndex + 1);

  for (const migration of expectedAppliedMigrations) {
    if (recorded.get(migration.name) !== migration.checksum) {
      throw new Error(`production migration registry mismatch: ${migration.name}`);
    }
  }
  if (recorded.size !== expectedAppliedMigrations.length) {
    throw new Error(`production migration registry contains ${recorded.size} entries; expected ${expectedAppliedMigrations.length} for ${requireBudgetMigration ? 'post-budget' : 'current-baseline'} state`);
  }

  await client.query('ROLLBACK');
  console.log(`Verified read-only PlanetScale migration registry on ${branch} (${requireBudgetMigration ? 'post-budget' : 'current-baseline'} state).`);
  console.log(`Approved migration-set SHA-256: ${migrationSetSha256}`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
