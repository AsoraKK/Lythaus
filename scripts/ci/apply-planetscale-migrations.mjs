import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const root = process.cwd();
const branch = process.env.PSCALE_BRANCH_NAME ?? '';
const databaseUrl = process.env.PLANETSCALE_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
if (!/^ci-[a-z0-9-]+$/.test(branch)) throw new Error('refusing to run outside a ci-* PlanetScale branch');
if (!databaseUrl) throw new Error('PLANETSCALE_ADMIN_DATABASE_URL or DATABASE_URL is required');

const migrationsDir = path.join(root, 'database', 'planetscale', 'migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
const files = [
  ...migrationFiles.map((file) => path.join(migrationsDir, file)),
  path.join(root, 'database', 'planetscale', 'grants', 'roles.sql'),
  path.join(root, 'database', 'planetscale', 'seeds', '0001_feature_flags.sql'),
];

async function withClient(connectionString, callback) {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: true } });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

await withClient(databaseUrl, async (client) => {
  for (const file of files) {
    process.stdout.write(`Applying ${path.relative(root, file)}\n`);
    await client.query(fs.readFileSync(file, 'utf8'));
  }
});

const roleUrls = JSON.parse(process.env.PSCALE_ROLE_URLS ?? '{}');
const roleIdentifiers = JSON.parse(process.env.PSCALE_ROLE_IDENTIFIERS ?? '{}');
const quoteIdentifier = (value) => {
  if (!/^pscale_api_[a-z0-9]+$/.test(value)) throw new Error(`invalid PlanetScale role identifier: ${value}`);
  return `"${value}"`;
};
const grantsTemplate = fs.readFileSync(path.join(root, 'database', 'planetscale', 'grants', 'roles.sql'), 'utf8');
const grantsSql = grantsTemplate.replace(/\blythaus_(runtime|admin|jobs|privacy|migrations)\b/g, (label) => {
  const identifier = roleIdentifiers[label];
  if (!identifier) throw new Error(`missing PSCALE_ROLE_IDENTIFIERS entry for ${label}`);
  return quoteIdentifier(identifier);
});
await withClient(databaseUrl, async (client) => {
  await client.query(grantsSql);
});
const checks = {
  lythaus_runtime: [
    ['table', 'privacy.legal_holds', 'SELECT', false],
    ['table', 'marketing.waitlist_signups', 'SELECT', false],
    ['schema', 'content', 'CREATE', false],
    ['schema', 'marketing', 'CREATE', false],
    ['database', 'postgres', 'CREATE', false],
  ],
  lythaus_jobs: [
    ['schema', 'content', 'CREATE', false],
    ['schema', 'privacy', 'CREATE', false],
    ['role', 'current', 'CREATEROLE', false],
  ],
  lythaus_admin: [
    ['table', 'marketing.waitlist_signups', 'INSERT', false],
    ['schema', 'marketing', 'CREATE', false],
    ['database', 'postgres', 'CREATE', false],
    ['role', 'current', 'CREATEROLE', false],
  ],
  lythaus_privacy: [
    ['table', 'identity.email_credentials', 'SELECT', false],
  ],
  lythaus_migrations: [
    ['schema', 'content', 'CREATE', true],
  ],
};
for (const [role, roleChecks] of Object.entries(checks)) {
  if (!roleUrls[role]) throw new Error(`missing connection URL for ${role}`);
  await withClient(roleUrls[role], async (client) => {
    for (const [kind, target, privilege, expected] of roleChecks) {
      const expression = kind === 'table'
        ? 'has_table_privilege(current_user, $1, $2)'
        : kind === 'schema'
          ? 'has_schema_privilege(current_user, $1, $2)'
          : kind === 'role'
            ? '(SELECT COALESCE(rolcreaterole, false) FROM pg_roles WHERE rolname = current_user)'
          : 'has_database_privilege(current_user, current_database(), $1)';
      const params = kind === 'database' ? [privilege] : kind === 'role' ? [] : [target, privilege];
      let allowed = false;
      try {
        const result = await client.query(`SELECT ${expression} AS allowed`, params);
        allowed = result.rows[0]?.allowed === true;
      } catch (error) {
        if (expected) throw error;
      }
      if (allowed !== expected) throw new Error(`${role} privilege check failed: ${kind} ${target} ${privilege} expected ${expected} got ${allowed}`);
    }
  });
}

console.log(`Validated direct PlanetScale migrations and role-negative checks on ${branch}.`);
