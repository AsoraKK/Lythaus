import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { buildNewCoreOwnerGrantSql, buildNewCoreSqlConsoleGrantsSql } from '../ci/lythaus-new-core-owner-grants.mjs';
import { NEW_CORE_ROLE_LABELS, NEW_CORE_LOGIN_ROLE_LABELS } from '../ci/lythaus-new-core-role-profile.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const script = path.join(root, 'scripts/ci/lythaus-new-core-owner-grants.mjs');
const roleMap = Object.fromEntries(NEW_CORE_ROLE_LABELS.map((label) => [label,
  NEW_CORE_LOGIN_ROLE_LABELS.includes(label) ? `pscale_api_fixture${label.slice(8)}` : label]));
const run = (args) => spawnSync(process.execPath, [script, ...args], {
  cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH ?? '' },
});

test('SQL generation rejects role aliasing and SQL injection before producing a script', () => {
  for (const map of [
    { ...roleMap, lythaus_admin: 'postgres' },
    { ...roleMap, lythaus_admin: roleMap.lythaus_migrations },
    { ...roleMap, lythaus_admin: 'pscale_api_x"; GRANT postgres TO PUBLIC; --' },
    { ...roleMap, lythaus_jobs: 'pscale_api_unnecessarycredential' },
  ]) assert.throws(() => buildNewCoreOwnerGrantSql(map));
});

test('SQL-created login mapping requires explicit console mode and rejects managed identifiers in that mode', () => {
  const consoleRoles = Object.fromEntries(NEW_CORE_ROLE_LABELS.map((label) => [label, label]));
  assert.throws(() => buildNewCoreOwnerGrantSql(consoleRoles));
  assert.throws(() => buildNewCoreOwnerGrantSql(roleMap, { sqlConsole: true }));
  assert.equal(buildNewCoreOwnerGrantSql(consoleRoles, { sqlConsole: true }), buildNewCoreSqlConsoleGrantsSql());
});

test('CLI generates private SQL only outside the repository, refuses overwrites, and never executes it', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-new-core-owner-'));
  const input = path.join(directory, 'roles.json');
  const output = path.join(directory, 'roles.sql');
  try {
    const plan = run(['--plan']);
    assert.equal(plan.status, 0);
    assert.equal(JSON.parse(plan.stdout).sqlExecutionSupported, false);
    fs.writeFileSync(input, JSON.stringify(roleMap), { mode: 0o600 });
    const result = run(['--write-private-sql', input, output]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'PRIVATE_SQL_WRITTEN_NOT_EXECUTED');
    assert.equal(fs.statSync(output).mode & 0o077, 0);
    const original = fs.readFileSync(output, 'utf8');
    assert.equal(run(['--write-private-sql', input, output]).status, 1);
    assert.equal(fs.readFileSync(output, 'utf8'), original);
    assert.equal(run(['--write-private-sql', input, path.join(root, 'scripts/tests/forbidden-private-role-output.sql')]).status, 1);
    fs.chmodSync(input, 0o644);
    assert.equal(run(['--write-private-sql', input, path.join(directory, 'not-written.sql')]).status, 1);
    assert.equal(fs.existsSync(path.join(directory, 'not-written.sql')), false);
    assert.equal(result.stdout.includes(roleMap.lythaus_admin), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
