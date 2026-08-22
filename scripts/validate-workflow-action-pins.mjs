import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ACTION_REF_PATTERN = /^\s*-\s+uses:\s*([^\s#]+)\s*$/gm;

export function findUnpinnedActions(source, file = '<workflow>') {
  const failures = [];
  for (const match of source.matchAll(ACTION_REF_PATTERN)) {
    const reference = match[1];
    if (reference.startsWith('./') || reference.startsWith('docker://')) continue;
    const at = reference.lastIndexOf('@');
    const sha = at === -1 ? '' : reference.slice(at + 1);
    if (!/^[0-9a-f]{40}$/i.test(sha)) {
      failures.push(`${file}: ${reference} is not pinned to a 40-character commit SHA`);
    }
  }
  return failures;
}

export function collectWorkflowActionPinFailures(root = process.cwd()) {
  const workflowsDir = path.join(root, '.github', 'workflows');
  const files = fs.readdirSync(workflowsDir)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .sort();
  return files.flatMap((file) => findUnpinnedActions(
    fs.readFileSync(path.join(workflowsDir, file), 'utf8'),
    `.github/workflows/${file}`,
  ));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = collectWorkflowActionPinFailures();
  if (failures.length > 0) {
    console.error(failures.map((failure) => `- ${failure}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Validated every external GitHub Action is pinned to an immutable commit SHA.');
  }
}
