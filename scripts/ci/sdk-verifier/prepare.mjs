import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const { parse } = createRequire('/recipe/package.json')('yaml');

function run(command, args, cwd = '/work') {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`ISOLATED_PREPARATION_FAILED:${command}:${result.status}:${String(result.stderr).slice(-4000)}`);
  return result.stdout;
}

const recipe = '/recipe/scripts/ci/sdk-verifier';
const dart = '/tools/flutter/bin/cache/dart-sdk/bin/dart';
if (!process.argv.includes('--prepare-only')) {
  fs.cpSync('/inputs', '/work', { recursive: true });
  for (const file of fs.readdirSync('/work/api/openapi').filter(file => file.endsWith('.yaml'))) {
    const value = parse(fs.readFileSync(`/work/api/openapi/${file}`, 'utf8'));
    const visit = node => {
      if (!node || typeof node !== 'object') return;
      for (const [key, child] of Object.entries(node)) {
        if (key === '$ref' && (typeof child !== 'string' || (!child.startsWith('#/') && !/^(?:\.\/)?[a-zA-Z0-9_-]+\.yaml#\//.test(child)))) throw new Error('EXTERNAL_OPENAPI_REFERENCE_REJECTED');
        visit(child);
      }
    };
    visit(value);
  }
  run('/tools/node/bin/node', ['/recipe/node_modules/@redocly/cli/bin/cli.js', 'bundle', '/work/api/openapi/openapi.yaml', '-o', '/work/bundled.json', `--config=${recipe}/redocly.yaml`]);
  run('/tools/node/bin/node', ['/recipe/scripts/trim-trailing-whitespace.js', '/work/bundled.json']);
  const api = JSON.parse(fs.readFileSync('/work/api/openapi/dist/openapi.json', 'utf8'));
  function requireInternalRefs(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === '$ref' && (typeof child !== 'string' || !child.startsWith('#/'))) throw new Error('EXTERNAL_OPENAPI_REFERENCE_REJECTED');
      requireInternalRefs(child);
    }
  }
  requireInternalRefs(api);
  run('/tools/java/bin/java', ['-jar', '/tools/generator.jar', 'generate', '-g', 'dart-dio', '-i', '/work/api/openapi/dist/openapi.json', '-o', '/work/regenerated', '--additional-properties=pubName=lythaus_api_client,nullableFields=true,hideGenerationTimestamp=true']);
  for (const script of ['fix-openapi-dart-nested-builder-assignment.mjs', 'remove-openapi-oauth-support.mjs', 'trim-trailing-whitespace.js']) run('/tools/node/bin/node', [`/recipe/scripts/${script}`, '/work/regenerated']);
}
if (process.argv.includes('--regenerate-only')) process.exit(0);
const sdk = '/work/sdk';
fs.mkdirSync(sdk);
fs.cpSync('/inputs/lib/generated/api_client/lib', join(sdk, 'lib'), { recursive: true });
fs.copyFileSync(`${recipe}/toolchain.pubspec.yaml`, join(sdk, 'pubspec.yaml'));
fs.copyFileSync(`${recipe}/toolchain.pubspec.lock`, join(sdk, 'pubspec.lock'));
run(dart, ['pub', 'get', '--enforce-lockfile', '--offline'], sdk);
run(dart, ['run', 'build_runner', 'build'], sdk);
fs.mkdirSync('/work/prepared');
fs.copyFileSync('/inputs/lib/generated/api_client/pubspec.yaml', '/work/prepared/pubspec.yaml');
fs.cpSync(join(sdk, 'lib'), '/work/prepared/lib', { recursive: true });
fs.mkdirSync('/work/build/api_client', { recursive: true });
fs.cpSync('/work/prepared', '/work/build/api_client', { recursive: true });
const rootLock = fs.readFileSync('/work/pubspec.lock');
run(dart, ['pub', 'get', '--enforce-lockfile', '--offline']);
if (!rootLock.equals(fs.readFileSync('/work/pubspec.lock'))) throw new Error('APP_LOCK_CHANGED');
fs.writeFileSync('/work/runtime-graph.json', run(dart, ['pub', 'deps', '--json']));
fs.writeFileSync('/work/toolchain-graph.json', run(dart, ['pub', 'deps', '--json'], sdk));
fs.writeFileSync('/work/toolchain-version.txt', run(dart, ['--version']));
