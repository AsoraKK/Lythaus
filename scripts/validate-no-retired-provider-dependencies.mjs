import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const retiredBrand = ['as', 'ora'].join('');
const retiredProvider = ['az', 'ure'].join('');
const retiredDatabase = ['cos', 'mos'].join('');
const retiredClassifier = ['hi', 've'].join('');
const retiredVault = ['key', 'vault'].join('');
const retiredInsights = ['application', 'insights'].join('');
const allowlistPath = 'scripts/retired-reference-allowlist.json';
const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
  cwd: root,
  encoding: 'utf8',
}).split('\0').filter(Boolean);

const allowlist = JSON.parse(fs.readFileSync(path.join(root, allowlistPath), 'utf8'));
if (allowlist.version !== 1 || !Array.isArray(allowlist.entries)) {
  throw new Error(`${allowlistPath} must contain version 1 entries`);
}

const approvedAllowlistPaths = new Set([
  'docs/history/**',
  'docs/evidence/**',
  'docs/security/azure-github-secret-removal-2026-08-06.md',
  'docs/security/github-credential-purpose-inventory.md',
  'docs/security/provider-decommission-follow-up.md',
  'docs/architecture/email-guest-authentication-adr.md',
  'docs/architecture/adr-003-lythaus-current-state.md',
  'README.md',
  'AGENTS.md',
  '.github/copilot-instructions.md',
  'apps/lythaus-public-api/src/worker-configuration.d.ts',
  'apps/lythaus-admin-api/src/worker-configuration.d.ts',
  'apps/lythaus-jobs/src/worker-configuration.d.ts',
  'apps/lythaus-authenticity-container-proof/src/worker-configuration.d.ts',
  'database/planetscale/migrations/0002_core_tables.sql',
  'database/planetscale/migrations/0007_contact_emails.sql',
  'scripts/retired-reference-allowlist.json',
  'scripts/ci/build-release-manifest.mjs',
  '.github/workflows/production-release.yml',
  'scripts/cloudflare/audit-account.mjs',
  'scripts/cloudflare/execute-lythaus-pages-cutover.mjs',
  '.github/workflows/cloudflare-lythaus-pages-cutover.yml',
  'scripts/tests/cloudflare-pages-cutover.test.mjs',
  'scripts/validate-no-retired-provider-dependencies.mjs',
]);

for (const entry of allowlist.entries) {
  if (!entry || typeof entry.path !== 'string' || !approvedAllowlistPaths.has(entry.path)) {
    throw new Error(`${allowlistPath} contains an unapproved path: ${entry?.path ?? '<missing>'}`);
  }
  if (typeof entry.kind !== 'string' || typeof entry.reason !== 'string' || !entry.reason.trim()) {
    throw new Error(`${allowlistPath} entries require kind and reason: ${entry.path}`);
  }
}

const allowlisted = (relative) => allowlist.entries.some(({ path: pattern }) => (
  pattern.endsWith('/**')
    ? relative.startsWith(pattern.slice(0, -2))
    : relative === pattern
));

const forbidden = [
  { name: 'retired brand', pattern: new RegExp(`\\b${retiredBrand}\\b|${retiredBrand}(?=[A-Z_])|_${retiredBrand}|package:${retiredBrand}|com\\.${retiredBrand}|${retiredBrand}\\.co\\.za|${retiredBrand}:\\/\\/`, 'i') },
  { name: 'retired provider', pattern: new RegExp(`\\b${retiredProvider}\\b|${retiredProvider}_|${retiredProvider}websites|@${retiredProvider}\\/|${retiredProvider}-functions|${retiredProvider}webjobsstorage|${retiredVault}|${retiredInsights}`, 'i') },
  { name: 'retired database', pattern: new RegExp(`\\b${retiredDatabase}\\b|${retiredDatabase}client`, 'i') },
  { name: 'retired classifier', pattern: new RegExp(`\\b${retiredClassifier}\\b|${retiredClassifier}[-_]client|${retiredClassifier}_ai|the${retiredClassifier}`, 'i') },
  { name: 'retired authentication', pattern: /flutter_appauth|google[_ -]?sign[_ -]?in|apple[_ -]?sign[_ -]?in|world[ _-]?(?:id|auth)|google_auth_enabled|apple_auth_enabled|world_id_auth_enabled|oauth2_/i },
];

const failures = [];
const scannedFiles = trackedFiles.filter((relative) => !allowlisted(relative));

for (const relative of scannedFiles) {
  const normalized = relative.replaceAll('\\', '/');

  for (const rule of forbidden) {
    if (rule.pattern.test(normalized)) {
      failures.push(`${normalized}: ${rule.name} appears in active path`);
    }
  }

  const file = path.join(root, relative);
  let contents;
  try {
    contents = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (contents.includes('\0')) continue;

  for (const rule of forbidden) {
    if (rule.pattern.test(contents)) {
      failures.push(`${normalized}: ${rule.name} appears in active content`);
    }
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${scannedFiles.length} active files contain no retired brand, provider, database, classifier, or authentication references; ${trackedFiles.length - scannedFiles.length} files are covered by the explicit allowlist.`);
}
