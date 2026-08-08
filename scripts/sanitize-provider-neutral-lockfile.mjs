import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/sanitize-provider-neutral-lockfile.mjs <package-lock.json>');
  process.exit(1);
}

const file = path.resolve(process.cwd(), input);
const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
const retiredScope = ['@', 'az', 'ure', '/'].join('');
let removed = 0;

for (const [packagePath, entry] of Object.entries(lock.packages ?? {})) {
  for (const dependency of Object.keys(entry.peerDependencies ?? {})) {
    if (!dependency.startsWith(retiredScope)) continue;
    if (entry.peerDependenciesMeta?.[dependency]?.optional !== true) {
      throw new Error(`${packagePath || '<root>'}: refusing to remove required dependency ${dependency}`);
    }
    delete entry.peerDependencies[dependency];
    delete entry.peerDependenciesMeta[dependency];
    removed += 1;
  }
}

const output = `${JSON.stringify(lock, null, 2)}\n`;
if (output.includes(retiredScope)) {
  throw new Error('Lockfile still contains a retired provider package after optional-peer sanitization');
}

fs.writeFileSync(file, output);
console.log(`Removed ${removed} optional retired-provider peer declarations from ${path.relative(process.cwd(), file)}.`);
