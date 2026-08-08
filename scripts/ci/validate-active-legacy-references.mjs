import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const policyPath = path.join(root, 'infrastructure', 'legacy-reference-policy.json');
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const patterns = [
  ['asora.co.za', /asora\.co\.za/i],
  ['azurewebsites.net', /azurewebsites\.net/i],
  ['AZURE_CLIENT_ID', /AZURE_CLIENT_ID/],
  ['AZURE_TENANT_ID', /AZURE_TENANT_ID/],
  ['AZURE_SUBSCRIPTION_ID', /AZURE_SUBSCRIPTION_ID/],
  ['AzureWebJobsStorage', /AzureWebJobsStorage/],
  ['@azure/functions', /@azure\/functions/],
];

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString('utf8').split('\0').filter(Boolean);
const isPrefix = (file, prefixes) => prefixes.some((prefix) => file === prefix || file.startsWith(prefix));
const guardLine = new RegExp(policy.guardLinePatterns.join('|'), 'i');
function classify(file) {
  if (policy.activeFiles.includes(file)) return 'active';
  if (policy.historicalFiles.includes(file)) return 'historical';
  if (policy.plannedFiles.includes(file)) return 'planned';
  if (policy.deprecatedFiles.includes(file)) return 'deprecated';
  if (isPrefix(file, policy.activePrefixes)) return 'active';
  if (isPrefix(file, policy.historicalPrefixes)) return 'historical';
  if (isPrefix(file, policy.plannedPrefixes)) return 'planned';
  if (isPrefix(file, policy.deprecatedPrefixes)) return 'deprecated';
  return 'unclassified';
}
const failures = [];
const inventory = {
  activeReferences: 0,
  ignoredGuards: 0,
  files: { active: 0, historical: 0, planned: 0, deprecated: 0, unclassified: 0 },
};

for (const file of trackedFiles) {
  if (classify(file) !== 'active') continue;
  if (!fs.existsSync(path.join(root, file))) continue;
  const contents = fs.readFileSync(path.join(root, file), 'utf8');
  for (const [label, pattern] of patterns) {
    for (const [index, line] of contents.split(/\r?\n/).entries()) {
      if (!pattern.test(line)) continue;
      if (policy.policyFiles.includes(file) || guardLine.test(line)) {
        inventory.ignoredGuards += 1;
        continue;
      }
      inventory.activeReferences += 1;
      failures.push({ file, line: index + 1, reference: label });
    }
  }
}

for (const file of trackedFiles) {
  inventory.files[classify(file)] += 1;
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: 'fail', failures, inventory }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: 'pass', inventory, policy: 'active runtime references are clean; historical, planned, and deprecated files remain classified by path policy' }));
}
