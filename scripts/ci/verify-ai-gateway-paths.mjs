import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceRoots = ['apps', 'packages'];
const sourceFiles = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'worker-configuration.d.ts') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) sourceFiles.push(fullPath);
  }
}

for (const directory of sourceRoots) walk(path.join(root, directory));

const failures = [];
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(?:env\.)?AI(?:!|\?)?\.run\s*\(/g)) {
    const context = source.slice(match.index, match.index + 1_500);
    if (!/gateway\s*:\s*\{/.test(context) || !/id\s*:\s*env\.AI_GATEWAY_ID/.test(context)) {
      failures.push(`${path.relative(root, file)}: Workers AI calls must use env.AI_GATEWAY_ID through the gateway binding`);
    }
  }
  if (/gateway\.ai\.cloudflare\.com\/v1\/[^\s"']+\/[^\s"']+\/workers-ai/i.test(source)) {
    failures.push(`${path.relative(root, file)}: direct Workers AI Gateway REST paths are forbidden`);
  }
}

for (const file of ['apps/lythaus-public-api/wrangler.jsonc', 'apps/lythaus-admin-api/wrangler.jsonc', 'apps/lythaus-jobs/wrangler.jsonc']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const match of source.matchAll(/"AI_GATEWAY_ID"\s*:\s*"([^"]+)"/g)) {
    if (match[1] !== 'lythaus-ai') failures.push(`${file}: unsupported AI gateway ${match[1]}`);
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Verified ${sourceFiles.length} source files for gateway-bound Workers AI paths.`);
}
