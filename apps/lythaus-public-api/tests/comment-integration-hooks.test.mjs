import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { integratePublicApiComments, integrateJobsCommentNotifications, integrateAdminCommentRevision } from './comment-integration-hooks.mjs';

test('proposed shared comment hooks typecheck with the complete native runtime without editing owned files', { timeout: 30000 }, () => {
  const paths = ['apps/lythaus-public-api/src/index.ts', 'apps/lythaus-jobs/src/index.ts', 'apps/lythaus-admin-api/src/index.ts'];
  const before = paths.map(path => readFileSync(path, 'utf8'));
  const changes = new Map(paths.map((path, index) => [ts.sys.resolvePath(path),
    [integratePublicApiComments, integrateJobsCommentNotifications, integrateAdminCommentRevision][index](before[index])]));
  const config = ts.readConfigFile('tsconfig.native.json', ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const host = ts.createCompilerHost(parsed.options), readFile = host.readFile.bind(host);
  host.readFile = path => changes.get(ts.sys.resolvePath(path)) ?? readFile(path);
  const program = ts.createProgram(parsed.fileNames, parsed.options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: path => path, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
  }));
  assert.deepEqual(paths.map(path => readFileSync(path, 'utf8')), before);
});
