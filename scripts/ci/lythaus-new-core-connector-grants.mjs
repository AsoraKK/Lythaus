import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APPROVED_SQL_SHA256 = '671a48f6932453e100c63c95c68c02281eed79339d990991a8463a7c478c354e';
const stripComments = (value) => value.replace(/^\s*--.*$/gm, '').replace(/\s+/g, ' ').trim();

export function buildSingleStatementInitialGrants(sql) {
  if (crypto.createHash('sha256').update(sql).digest('hex') !== APPROVED_SQL_SHA256) {
    throw new Error('new_core_approved_grants_source_mismatch');
  }
  const start = sql.indexOf('DO $new_core_owner_setup$');
  const endTag = '$new_core_owner_setup$;';
  const end = sql.indexOf(endTag, start) + endTag.length;
  if (start < 0 || end < start
    || stripComments(sql.slice(0, start)) !== 'BEGIN; SET LOCAL ROLE postgres;'
    || stripComments(sql.slice(end)) !== 'COMMIT;') {
    throw new Error('new_core_approved_grants_transaction_wrapper_mismatch');
  }
  const statement = sql.slice(start, end);
  const guarded = statement.replace('\nBEGIN\n', '\nBEGIN\n  SET LOCAL ROLE postgres;\n');
  if (guarded === statement) throw new Error('new_core_approved_grants_body_missing');
  return `-- Same approved initial grants, packaged for one prepared statement.
-- The DO statement is one atomic transaction; any exception rolls it back.
-- SET LOCAL ROLE is unchanged in authority and expires with this transaction.
${guarded}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = fs.readFileSync(fileURLToPath(new URL('../../database/planetscale/provisioning/new-core-console-initial-grants.sql', import.meta.url)), 'utf8');
  process.stdout.write(buildSingleStatementInitialGrants(source));
}
