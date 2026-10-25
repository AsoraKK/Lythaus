import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { integratePublicApiComments, integrateJobsCommentNotifications } from './comment-integration-hooks.mjs';

const base = '868be4ee163ba5f7968212230d731682ff005e45';
const security = '6270c2b95c808b33b3bc115c0e3066d8d00d6296';
const detection = '0f4a122e4109b1b0f834c3067488dde9c3a63201';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
const overlays = new Map();
const directory = mkdtempSync(join(tmpdir(), 'lythaus-comment-compat-'));
try {
  for (const ref of [security, detection]) {
    const paths = git('diff', '--name-only', base, ref, '--', '*.ts').trim().split('\n').filter(Boolean);
    for (const path of paths) {
      let source = git('show', ref + ':' + path);
      if (overlays.has(path)) {
        writeFileSync(join(directory, 'current'), overlays.get(path));
        writeFileSync(join(directory, 'base'), git('show', base + ':' + path));
        writeFileSync(join(directory, 'next'), source);
        const merge = spawnSync('git', ['merge-file', '-p', join(directory, 'current'), join(directory, 'base'), join(directory, 'next')], { encoding: 'utf8' });
        assert.equal(merge.status, 0, 'Pending branches conflict at ' + path + '\n' + merge.stdout);
        source = merge.stdout;
      }
      overlays.set(path, source);
    }
  }
  const apiPath = 'apps/lythaus-public-api/src/index.ts';
  const jobsPath = 'apps/lythaus-jobs/src/index.ts';
  overlays.set(apiPath, integratePublicApiComments(overlays.get(apiPath)));
  overlays.set(jobsPath, integrateJobsCommentNotifications(overlays.get(jobsPath)));
  assert.ok(overlays.get(apiPath).includes('await consumeRecentAccountProof('));
  assert.ok(overlays.get(jobsPath).includes('MEMBER_SECURITY_EVIDENCE_MAPPING?: string;'));
  assert.ok(overlays.get(jobsPath).includes('image-review-privacy'));
  const currentFiles = new Map([...overlays].map(([path, source]) => [ts.sys.resolvePath(path), source]));
  const config = ts.readConfigFile('tsconfig.native.json', ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const host = ts.createCompilerHost(parsed.options);
  const readFile = host.readFile.bind(host), fileExists = host.fileExists.bind(host);
  host.readFile = path => currentFiles.get(ts.sys.resolvePath(path)) ?? readFile(path);
  host.fileExists = path => currentFiles.has(ts.sys.resolvePath(path)) || fileExists(path);
  const files = [...new Set([...parsed.fileNames, ...currentFiles.keys()])];
  const program = ts.createProgram(files, parsed.options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: path => path, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
  }));
  assert.ok(readFileSync(apiPath, 'utf8').includes('const body = await readCommentThread('));
  console.log('Pinned security + detection + applied comment hooks compile; source branches remain unchanged.');
  const blob = source => execFileSync('git', ['hash-object', '--stdin'], { input: source, encoding: 'utf8' }).trim();
  console.log(JSON.stringify({ base, security, detection, overlaidFiles: overlays.size,
    combinedApiBlob: blob(overlays.get(apiPath)), combinedJobsBlob: blob(overlays.get(jobsPath)) }));
} finally { rmSync(directory, { recursive: true, force: true }); }
