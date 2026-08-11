import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = resolve('lib/generated/api_client');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'lythaus-openapi-dart-'));
const validationPackage = join(temporaryRoot, 'api_client');
const dart = process.platform === 'win32' ? 'dart.bat' : 'dart';

function run(arguments_) {
  const result = spawnSync(dart, arguments_, {
    cwd: validationPackage,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    throw new Error(`dart ${arguments_.join(' ')} failed`);
  }
}

try {
  cpSync(source, validationPackage, { recursive: true });
  run(['pub', 'get']);
  run(['run', 'build_runner', 'build']);
  run(['analyze', '--no-fatal-warnings']);
  run(['test', '--reporter', 'compact']);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
