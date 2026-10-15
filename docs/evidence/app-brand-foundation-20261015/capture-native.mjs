import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
assert.equal(git('status', '--porcelain'), '', 'Capture requires a clean source tree.');
const sourceCommit = git('rev-parse', 'HEAD');
const output = await mkdtemp(path.join(tmpdir(), 'lythaus-brand-native-'));
const startedAt = new Date().toISOString();
const runs = [];
const artifacts = [];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

for (const [folder, file] of [
  ['headers', 'test/design_system/brand_foundation_test.dart'],
  ['icons', 'test/design_system/brand_accessibility_test.dart'],
]) {
  const args = ['test', '--no-pub', file, '--reporter', 'json'];
  const run = spawnSync('flutter', args, {
    cwd: root,
    env: {...process.env, LYTHAUS_BRAND_EVIDENCE: path.join(output, folder)},
    encoding: 'utf8',
  });
  await writeFile(path.join(output, `${folder}-test.jsonl`), run.stdout ?? '');
  assert.equal(run.status, 0, run.stderr || run.stdout || String(run.error));
  const events = run.stdout.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
  assert.equal(events.findLast(event => event.type === 'done')?.success, true);
  const starts = events.filter(event => event.type === 'testStart');
  const tests = events.filter(event => event.type === 'testDone' && !event.hidden).map(event => ({
    name: starts.find(start => start.test.id === event.testID).test.name,
    result: event.result,
    skipped: event.skipped,
  }));
  assert.equal(tests.length, 14);
  assert.ok(tests.every(test => test.result === 'success' && !test.skipped));
  runs.push({command: ['flutter', ...args].join(' '), tests, logSha256: sha256(run.stdout)});
  const names = folder === 'headers'
    ? ['light', 'dark'].flatMap(theme => [320, 390, 1440].map(width => `${theme}-${width}-2x.png`))
    : ['light', 'dark'].flatMap(theme => ['standard', 'filled', 'outlined'].map(variant => `${theme}-${variant}-focus.png`));
  for (const name of names) {
    const relative = `${folder}/${name}`;
    const bytes = await readFile(path.join(output, relative));
    const metadata = await stat(path.join(output, relative));
    assert.ok(metadata.mtime.toISOString() >= startedAt, `Fresh output required: ${relative}`);
    artifacts.push({path: relative, bytes: bytes.length, sha256: sha256(bytes), capturedAt: metadata.mtime.toISOString(), sourceCommit});
  }
}
assert.equal(git('rev-parse', 'HEAD'), sourceCommit);
assert.equal(git('status', '--porcelain'), '', 'Source must stay clean during capture.');
const sourceFiles = [
  'lib/ui/components/lythaus_top_bar.dart',
  'lib/design_system/widgets/lyth_brand.dart',
  'lib/design_system/components/lyth_icon_button.dart',
  'lib/design_system/theme/lyth_theme.dart',
  'test/design_system/brand_foundation_test.dart',
  'test/design_system/brand_accessibility_test.dart',
];
const sourceHashes = await Promise.all(sourceFiles.map(async file => ({path: file, sha256: sha256(await readFile(path.join(root, file)))})));
await mkdir(path.join(output, 'native'));
await writeFile(path.join(output, 'native/results.json'), `${JSON.stringify({
  sourceCommit, cleanTreeAtStartAndEnd: true, startedAt, completedAt: new Date().toISOString(),
  flutter: JSON.parse(execFileSync('flutter', ['--version', '--machine'], {cwd: root, encoding: 'utf8'})),
  textScaling: 'Native Flutter TextScaler.linear(2); no browser zoom',
  sourceHashes, runs, artifacts,
}, null, 2)}\n`);
console.log(JSON.stringify({sourceCommit, output, tests: 28, artifacts: artifacts.length}));
