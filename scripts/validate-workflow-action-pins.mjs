import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

export function findUnpinnedActions(source, file = '<workflow>') {
  const failures = [];
  let document;
  try {
    const parsed = parseDocument(source, { uniqueKeys: true });
    if (parsed.errors.length > 0) throw parsed.errors[0];
    document = parsed.toJS({ maxAliasCount: 100 });
  } catch (error) {
    return [`${file}: invalid YAML: ${error.message.split('\n')[0]}`];
  }
  const visited = new Set();
  const inspect = (value) => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    for (const [key, reference] of Object.entries(value)) {
      if (key === 'uses') {
        if (typeof reference !== 'string') {
          failures.push(`${file}: uses must be a string action reference`);
        } else if (!reference.startsWith('./') && !reference.startsWith('docker://')) {
          const at = reference.lastIndexOf('@');
          const sha = at === -1 ? '' : reference.slice(at + 1);
          if (!/^[0-9a-f]{40}$/i.test(sha)) {
            failures.push(`${file}: ${reference} is not pinned to a 40-character commit SHA`);
          }
        }
      }
      inspect(reference);
    }
  };
  inspect(document);
  return failures;
}

export function collectWorkflowActionPinFailures(root = process.cwd()) {
  const workflowsDir = path.join(root, '.github', 'workflows');
  const files = fs.readdirSync(workflowsDir)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .sort();
  const failures = files.flatMap((file) => findUnpinnedActions(
    fs.readFileSync(path.join(workflowsDir, file), 'utf8'),
    `.github/workflows/${file}`,
  ));
  const actionsDir = path.join(root, '.github', 'actions');
  const inspectActions = (directory) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const actionPath = path.join(directory, entry.name);
      if (entry.isDirectory()) inspectActions(actionPath);
      else if (entry.isFile() && ['action.yml', 'action.yaml'].includes(entry.name)) {
        failures.push(...findUnpinnedActions(
          fs.readFileSync(actionPath, 'utf8'),
          path.relative(root, actionPath).split(path.sep).join('/'),
        ));
      }
    }
  };
  if (fs.existsSync(actionsDir)) inspectActions(actionsDir);
  return failures;
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
