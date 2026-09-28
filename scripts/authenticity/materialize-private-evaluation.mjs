import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error('EVALUATION_ARGUMENT_REQUIRED');
  return args[index + 1];
};

const approvalPath = path.resolve(value('--approval'));
const root = path.resolve(value('--root'));
const outputPath = path.resolve(value('--output'));
const sourceSha = value('--source-sha');
if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error('SOURCE_IDENTITY_REQUIRED');

const approval = JSON.parse(fs.readFileSync(approvalPath, 'utf8'));
if (!approval || typeof approval !== 'object' || Array.isArray(approval) || approval.sourceSha !== sourceSha) throw new Error('SOURCE_IDENTITY_MISMATCH');
if (!approval.fixtures || typeof approval.fixtures !== 'object' || Array.isArray(approval.fixtures)) throw new Error('FIXTURE_MAPPING_REQUIRED');

const materialized = structuredClone(approval);
for (const fixture of Object.values(materialized.fixtures)) {
  if (!fixture || typeof fixture !== 'object' || typeof fixture.path !== 'string' || path.isAbsolute(fixture.path)) throw new Error('FIXTURE_PATH_INVALID');
  const resolved = path.resolve(root, fixture.path);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('FIXTURE_PATH_OUTSIDE_BUNDLE');
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('FIXTURE_FILE_MISSING');
  fixture.path = resolved;
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
fs.writeFileSync(outputPath, JSON.stringify(materialized), { encoding: 'utf8', mode: 0o600 });
