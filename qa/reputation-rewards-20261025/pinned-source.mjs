import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const MAIN = 'c0963c36693476ecc49ab1fcba0572454926b4d3';
export const INTERVAL_HEAD = 'ef288ef2819382afd571256d3f9e31e8bb8383bb';

export function gitSource(path, revision = MAIN) {
  assert.match(revision, /^[0-9a-f]{40}$/);
  assert.match(path, /^(apps|packages|database|scripts|docs)\/[a-zA-Z0-9_./-]+$/);
  return execFileSync('git', ['show', `${revision}:${path}`], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
}
export function requireUnchanged(path) {
  assert.equal(readFileSync(join(ROOT, path), 'utf8'), gitSource(path), `reviewed source changed: ${path}`);
}

export function reputationFixtureClass() {
  const path = 'packages/db/tests/reputation-persistence.test.mjs';
  requireUnchanged(path);
  const text = gitSource(path);
  const ast = ts.createSourceFile(path, text, ts.ScriptTarget.ESNext, true);
  const classes = ast.statements.filter(node => ts.isClassDeclaration(node) && node.name?.text === 'FakeClient');
  assert.equal(classes.length, 1);
  // Reuse the repository's SQL fake, with no production SQL or sockets.
  return new Function(`${classes[0].getText(ast)}; return FakeClient;`)();
}

export async function intervalCandidate() {
  const directory = mkdtempSync(join(tmpdir(), 'lythaus-interval-qa-'));
  for (const name of ['monthly-security-choice.ts', 'monthly-security-grace.ts',
    'monthly-maintenance-policy.ts', 'monthly-reputation-policy.ts', 'monthly-reputation-decisions.ts']) {
    writeFileSync(join(directory, name), gitSource(`packages/contracts/src/${name}`, INTERVAL_HEAD));
  }
  return { directory,
    ...(await import(pathToFileURL(join(directory, 'monthly-security-choice.ts')).href)),
    ...(await import(pathToFileURL(join(directory, 'monthly-security-grace.ts')).href)),
  };
}
