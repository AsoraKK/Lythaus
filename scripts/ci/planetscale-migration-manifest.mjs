import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const MIGRATIONS_PATH = 'database/planetscale/migrations';

// This manifest intentionally records the bytes submitted to PostgreSQL, not
// whatever line endings happen to exist in an operator's worktree.
export const APPROVED_MIGRATIONS = [
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
  { name: '0012_product_integrity_v2.sql', repositorySha256: 'b2d4b02030333494b9959b5de040530845a7a97cbef746cb02cb931e7fdbb725', lfOnlyBreaks: [[1, 623]], appliedBytes: 28_673, appliedSha256: 'b2d4b02030333494b9959b5de040530845a7a97cbef746cb02cb931e7fdbb725' },
  { name: '0013_marketing_waitlist.sql', repositorySha256: 'a31d54931bf93bcc7a3518ea77753390a7a7768924de073e6e5711f087bda7e7', lfOnlyBreaks: [[1, 9999]], appliedBytes: 1_434, appliedSha256: 'a31d54931bf93bcc7a3518ea77753390a7a7768924de073e6e5711f087bda7e7' },
  { name: '0014_transactional_email_outbox.sql', repositorySha256: '7d4352cc6f74d8216a9ece9b8e2c5bcef53088b1000e53d1f3303ef09c121222', lfOnlyBreaks: [[1, 9999]], appliedBytes: 2_634, appliedSha256: '7d4352cc6f74d8216a9ece9b8e2c5bcef53088b1000e53d1f3303ef09c121222' },
  { name: '0015_production_auth_acceptance_coordinator.sql', repositorySha256: 'e8db5a46be476750632d1f184eb27aa2c1d9fbf5ecd9969bd7ad880397df4fef', lfOnlyBreaks: [[1, 9999]], appliedBytes: 4_673, appliedSha256: 'e8db5a46be476750632d1f184eb27aa2c1d9fbf5ecd9969bd7ad880397df4fef' },
];

export const EXPECTED_MIGRATION_BYTES = 88_522;
export const EXPECTED_MIGRATION_SET_SHA256 = '9a76fe15d708ee7dcf279e00918589e8ecb0348d7bcb9ee6e87c27d7f57a22f9';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function usesLfOnly(lineBreak, ranges) {
  return ranges.some(([start, end]) => lineBreak >= start && lineBreak <= end);
}

export function approvedPayload(meta, rawContents) {
  const repositoryText = rawContents.toString('utf8').replace(/\r\n/g, '\n');
  if (repositoryText.includes('\r')) throw new Error(`migration contains unexpected carriage returns: ${meta.name}`);
  const repositoryContents = Buffer.from(repositoryText, 'utf8');
  if (sha256(repositoryContents) !== meta.repositorySha256) {
    throw new Error(`approved repository migration payload mismatch: ${meta.name}`);
  }
  let lineBreak = 0;
  const contents = Buffer.from(repositoryText.replace(/\n/g, () => {
    lineBreak += 1;
    return usesLfOnly(lineBreak, meta.lfOnlyBreaks) ? '\n' : '\r\n';
  }), 'utf8');
  if (contents.length !== meta.appliedBytes || sha256(contents) !== meta.appliedSha256) {
    throw new Error(`approved applied migration payload mismatch: ${meta.name}`);
  }
  return { name: meta.name, contents, checksum: meta.appliedSha256 };
}

export function loadApprovedMigrations({ root = process.cwd(), committedOnly = false } = {}) {
  const names = committedOnly
    ? execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', MIGRATIONS_PATH], { cwd: root, encoding: 'utf8' })
      .split(/\r?\n/).filter((file) => file.endsWith('.sql')).map((file) => path.posix.basename(file)).sort()
    : fs.readdirSync(path.join(root, MIGRATIONS_PATH)).filter((file) => file.endsWith('.sql')).sort();
  const expectedNames = APPROVED_MIGRATIONS.map(({ name }) => name);
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    throw new Error(`production migration file set mismatch: ${names.join(', ')}`);
  }
  const migrations = APPROVED_MIGRATIONS.map((meta) => approvedPayload(meta, committedOnly
    ? execFileSync('git', ['show', `HEAD:${MIGRATIONS_PATH}/${meta.name}`], { cwd: root, encoding: null })
    : fs.readFileSync(path.join(root, MIGRATIONS_PATH, meta.name))));
  const payload = Buffer.concat(migrations.flatMap(({ contents }, index) => index === 0 ? [contents] : [Buffer.from([0x0a]), contents]));
  if (payload.length !== EXPECTED_MIGRATION_BYTES || sha256(payload) !== EXPECTED_MIGRATION_SET_SHA256) {
    throw new Error('approved migration-set payload mismatch');
  }
  return { migrations, bytes: payload.length, checksum: sha256(payload) };
}

export function expectedMigrationPrefix(version) {
  const index = APPROVED_MIGRATIONS.findIndex((migration) => migration.name === version);
  if (index < 0) throw new Error(`unknown canonical migration: ${version}`);
  return APPROVED_MIGRATIONS.slice(0, index + 1);
}
