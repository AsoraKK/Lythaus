import pg from 'pg';
import { classifyMigrationState } from './planetscale-migration-reconciliation.mjs';

const { Client } = pg;
const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '';
if (!connectionString) throw new Error('PLANETSCALE_PG17_TEST_DATABASE_URL is required');

const connection = new URL(connectionString);
if (!['localhost', '127.0.0.1', '::1'].includes(connection.hostname)) {
  throw new Error('local postcondition verification refuses non-local database hosts');
}

const names = [
  '0009_cost_budget_enforcement.sql',
  '0010_native_runtime_parity.sql',
  '0011_email_guest_auth_only.sql',
  '0012_product_integrity_v2.sql',
  '0013_marketing_waitlist.sql',
];

const client = new Client({ connectionString, ssl: false });
await client.connect();
try {
  const states = await classifyMigrationState(client, names);
  const incomplete = states.filter(({ state }) => state !== 'FULLY_APPLIED');
  if (incomplete.length) {
    throw new Error(`local canonical postconditions incomplete: ${incomplete.map(({ name, state, artifacts }) => `${name}=${state}[${artifacts.filter(({ present }) => !present).map(({ artifact }) => artifact).join(',')}]`).join('; ')}`);
  }
  console.log(JSON.stringify(states, null, 2));
} finally {
  await client.end();
}
