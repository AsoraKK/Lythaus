#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { dependencyGraphChanged } from './dependency-review-policy.mjs';
import { classifyRelease } from '../release/release-classification.mjs';
import { componentDisposition } from '../release/component-deployment-plan.mjs';

const argv = process.argv.slice(2);
const argument = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};
const outputPath = path.resolve(argument('--output') ?? process.env.RELEASE_PLAN_OUTPUT ?? path.join(process.cwd(), '.artifacts', 'release', 'release-plan.json'));
const releaseSha = argument('--release-sha') ?? process.env.RELEASE_SHA ?? process.env.GITHUB_SHA ?? '';
const baseSha = argument('--base-sha') ?? process.env.PREVIOUS_PRODUCTION_SHA ?? '';
const changedFilesJson = process.env.CHANGED_FILES_JSON;
const forceAuthCritical = process.env.FORCE_AUTH_CRITICAL ?? '';

if (!/^[0-9a-f]{40}$/.test(releaseSha)) throw new Error('release SHA must be a full 40-character commit SHA');
if (baseSha && baseSha !== 'NONE' && !/^[0-9a-f]{40}$/.test(baseSha)) throw new Error('base SHA must be a full 40-character commit SHA or NONE');

function gitFiles(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
}

let changedFiles;
let comparisonBase = baseSha && baseSha !== 'NONE' ? baseSha : null;
if (changedFilesJson) {
  changedFiles = JSON.parse(changedFilesJson);
  if (!Array.isArray(changedFiles)) throw new Error('CHANGED_FILES_JSON must be an array');
} else if (comparisonBase) {
  changedFiles = gitFiles(['diff', '--name-only', `${comparisonBase}..${releaseSha}`]);
} else {
  changedFiles = gitFiles(['ls-tree', '-r', '--name-only', releaseSha]);
  comparisonBase = null;
}

function manifestAt(sha, manifest) {
  try {
    return JSON.parse(execFileSync('git', ['show', `${sha}:${manifest}`], { encoding: 'utf8' }));
  } catch {
    return null;
  }
}

const rootPackageDependencyChanged = changedFiles.includes('package.json')
  ? (comparisonBase === null
    ? true
    : (() => {
      const before = manifestAt(comparisonBase, 'package.json');
      const after = manifestAt(releaseSha, 'package.json');
      return before === null || after === null || dependencyGraphChanged(before, after);
    })())
  : false;

const classification = classifyRelease({
  changedFiles,
  baseSha: comparisonBase,
  forceAuthCritical,
  rootPackageDependencyChanged,
});
const plan = {
  schemaVersion: 'lythaus-release-plan-v1',
  generatedAt: new Date().toISOString(),
  releaseSha,
  baseSha: comparisonBase ?? 'NONE',
  releaseClass: classification.releaseClass,
  forceAuthCritical: classification.forceAuthCritical,
  changedFiles: classification.changedFiles,
  changedComponents: classification.changedComponents,
  reusedComponents: classification.reusedComponents,
  rootPackageDependencyChanged: classification.rootPackageDependencyChanged,
  componentDisposition: componentDisposition(classification.changedComponents),
  criticalReasons: classification.criticalReasons,
  standardReasons: classification.standardReasons,
  rulesVersion: classification.rulesVersion,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

const githubEnv = process.env.GITHUB_ENV;
if (githubEnv) {
  fs.appendFileSync(githubEnv, `RELEASE_STATE=PREFLIGHT\nRELEASE_STATE_HISTORY_JSON=${JSON.stringify([{ state: 'PREFLIGHT', at: new Date().toISOString() }])}\n`, 'utf8');
  fs.appendFileSync(githubEnv, `RELEASE_CLASS=${plan.releaseClass}\n`, 'utf8');
  fs.appendFileSync(githubEnv, `RELEASE_PLAN_PATH=${outputPath}\n`, 'utf8');
  fs.appendFileSync(githubEnv, `RELEASE_CLASSIFICATION_RULES_VERSION=${plan.rulesVersion}\n`, 'utf8');
  fs.appendFileSync(githubEnv, `CHANGED_FILES_JSON=${JSON.stringify(plan.changedFiles)}\n`, 'utf8');
  fs.appendFileSync(githubEnv, `CHANGED_COMPONENTS_JSON=${JSON.stringify(plan.changedComponents)}\n`, 'utf8');
  fs.appendFileSync(githubEnv, `REUSED_COMPONENTS_JSON=${JSON.stringify(plan.reusedComponents)}\n`, 'utf8');
}
const githubOutput = process.env.GITHUB_OUTPUT;
if (githubOutput) {
  fs.appendFileSync(githubOutput, `release_class=${plan.releaseClass}\n`, 'utf8');
  fs.appendFileSync(githubOutput, `changed_components_json=${JSON.stringify(plan.changedComponents)}\n`, 'utf8');
  fs.appendFileSync(githubOutput, `reused_components_json=${JSON.stringify(plan.reusedComponents)}\n`, 'utf8');
  fs.appendFileSync(githubOutput, `changed_files_json=${JSON.stringify(plan.changedFiles)}\n`, 'utf8');
  fs.appendFileSync(githubOutput, `classification_rules_version=${plan.rulesVersion}\n`, 'utf8');
  fs.appendFileSync(githubOutput, `force_auth_critical=${plan.forceAuthCritical}\n`, 'utf8');
  fs.appendFileSync(githubOutput, `release_plan_path=${outputPath}\n`, 'utf8');
}

console.log(JSON.stringify({
  status: 'PLAN_READY',
  releaseSha,
  baseSha: plan.baseSha,
  releaseClass: plan.releaseClass,
  changedComponents: plan.changedComponents,
  reusedComponents: plan.reusedComponents,
  changedFileCount: plan.changedFiles.length,
  output: path.relative(process.cwd(), outputPath),
}));
