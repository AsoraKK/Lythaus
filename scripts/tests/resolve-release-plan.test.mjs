import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const script = 'scripts/ci/resolve-release-plan.mjs';
const releaseSha = '0123456789abcdef0123456789abcdef01234567';
const baseSha = 'fedcba9876543210fedcba9876543210fedcba98';

function run({ changedFiles, forceAuthCritical = false, base = baseSha }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-release-plan-'));
  const output = path.join(directory, 'release-plan.json');
  const githubEnv = path.join(directory, 'github.env');
  const githubOutput = path.join(directory, 'github.output');
  try {
    execFileSync(process.execPath, [
      script,
      '--release-sha', releaseSha,
      '--base-sha', base,
      '--output', output,
    ], {
      cwd: root,
      env: {
        ...process.env,
        CHANGED_FILES_JSON: JSON.stringify(changedFiles),
        FORCE_AUTH_CRITICAL: String(forceAuthCritical),
        GITHUB_ENV: githubEnv,
        GITHUB_OUTPUT: githubOutput,
      },
      encoding: 'utf8',
    });
    return {
      plan: JSON.parse(fs.readFileSync(output, 'utf8')),
      env: fs.readFileSync(githubEnv, 'utf8'),
      output: fs.readFileSync(githubOutput, 'utf8'),
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('CLI resolver writes deterministic standard scope and GitHub state outputs', () => {
  const result = run({ changedFiles: ['docs/architecture/runtime.md', 'apps/marketing-site/src/pages/pricing.astro'] });
  assert.equal(result.plan.releaseClass, 'STANDARD_RELEASE');
  assert.deepEqual(result.plan.changedComponents, ['marketing']);
  assert.deepEqual(result.plan.reusedComponents, ['admin', 'control-panel', 'coordinator', 'flutter-web', 'jobs', 'public']);
  assert.deepEqual(result.plan.componentDisposition.marketing, 'NEW_CANDIDATE');
  assert.deepEqual(result.plan.componentDisposition.public, 'REUSED_PRODUCTION');
  assert.match(result.env, /RELEASE_STATE=PREFLIGHT/);
  assert.match(result.env, /RELEASE_CLASS=STANDARD_RELEASE/);
  assert.match(result.output, /release_class=STANDARD_RELEASE/);
  assert.match(result.output, /changed_components_json=\["marketing"\]/);
  assert.match(result.output, /changed_files_json=\["apps\/marketing-site\/src\/pages\/pricing\.astro","docs\/architecture\/runtime\.md"\]/);
  assert.match(result.output, /classification_rules_version=release-classification-v1/);
  assert.match(result.output, /force_auth_critical=false/);
});

test('CLI resolver upgrades only when forced and treats missing baseline as critical', () => {
  const forced = run({ changedFiles: ['docs/architecture/runtime.md'], forceAuthCritical: true });
  assert.equal(forced.plan.releaseClass, 'AUTH_CRITICAL_RELEASE');
  assert.equal(forced.plan.forceAuthCritical, true);

  const missingBaseline = run({ changedFiles: ['docs/architecture/runtime.md'], base: 'NONE' });
  assert.equal(missingBaseline.plan.releaseClass, 'AUTH_CRITICAL_RELEASE');
  assert.equal(missingBaseline.plan.changedComponents.length, 7);
  assert.match(missingBaseline.plan.criticalReasons[0].rule, /missing-release-baseline/);
});
