import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { readRegularSource } from '../../ml/datasets/tools/materialise/read-source.mjs';

const require = createRequire(import.meta.url);
const { walk } = require('../trim-trailing-whitespace.js');
const noFollowUnavailable = fs.constants.O_NOFOLLOW === undefined;

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-file-io-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('trimming preserves UTF-8 and permissions, removes old bytes, and remains idempotent', { skip: noFollowUnavailable }, (t) => {
  const directory = fixture(t);
  const target = path.join(directory, 'source.json');
  fs.writeFileSync(target, 'café \t\nnext  \n\n', { mode: 0o640 });
  const mode = fs.statSync(target).mode & 0o777;
  walk(directory);
  assert.equal(fs.readFileSync(target, 'utf8'), 'café\nnext\n');
  assert.equal(fs.statSync(target).mode & 0o777, mode);
  walk(directory);
  assert.equal(fs.readFileSync(target, 'utf8'), 'café\nnext\n');
});

test('trimming rejects symbolic links and leaves their targets unchanged', { skip: noFollowUnavailable }, (t) => {
  const directory = fixture(t);
  const target = path.join(directory, 'target.json');
  const link = path.join(directory, 'link.json');
  fs.writeFileSync(target, 'keep  \n');
  fs.symlinkSync(target, link);
  assert.throws(() => walk(link), /symbolic_link_input_rejected/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'keep  \n');
});

test('trimming continues on the opened file when its pathname changes', { skip: noFollowUnavailable }, (t) => {
  const directory = fixture(t);
  const target = path.join(directory, 'source.json');
  const held = path.join(directory, 'held.json');
  const other = path.join(directory, 'other.json');
  fs.writeFileSync(target, 'trim  \n\n');
  fs.writeFileSync(other, 'keep  \n');
  const originalStat = fs.fstatSync;
  t.mock.method(fs, 'fstatSync', (descriptor) => {
    const stat = originalStat(descriptor);
    fs.renameSync(target, held);
    fs.symlinkSync(other, target);
    return stat;
  });
  walk(target);
  assert.equal(fs.readFileSync(held, 'utf8'), 'trim\n');
  assert.equal(fs.readFileSync(other, 'utf8'), 'keep  \n');
});

test('manifest source reads reject symbolic links and directories', { skip: noFollowUnavailable }, async (t) => {
  const directory = fixture(t);
  const source = path.join(directory, 'source.jpg');
  const link = path.join(directory, 'link.jpg');
  fs.writeFileSync(source, 'synthetic media');
  fs.symlinkSync(source, link);
  await assert.rejects(readRegularSource(link), { code: 'ELOOP' });
  await assert.rejects(readRegularSource(directory), /regular_file_input_required/);
});

test('manifest source reads stay on the opened file after pathname replacement', { skip: noFollowUnavailable }, async (t) => {
  const directory = fixture(t);
  const source = path.join(directory, 'source.jpg');
  const held = path.join(directory, 'held.jpg');
  const other = path.join(directory, 'other.jpg');
  fs.writeFileSync(source, 'synthetic media');
  fs.writeFileSync(other, 'other bytes');
  const originalOpen = fs.promises.open;
  t.mock.method(fs.promises, 'open', async (...args) => {
    const file = await originalOpen(...args);
    fs.renameSync(source, held);
    fs.symlinkSync(other, source);
    return file;
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  const bytes = await readRegularSource(source);
  assert.equal(bytes.toString(), 'synthetic media');
  assert.equal(bytes.byteLength, 15);
});
