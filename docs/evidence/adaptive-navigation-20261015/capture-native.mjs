import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, writeFile, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const git = (...args) => execFileSync('git', args, {cwd:root, encoding:'utf8'}).trim();
assert.equal(git('status', '--porcelain'), '', 'Use a clean committed source tree.');
const sourceCommit = git('rev-parse', 'HEAD');
const output = await mkdtemp(path.join(tmpdir(), 'lythaus-navigation-native-'));
const startedAt = new Date().toISOString();
const args = ['test', '--no-pub', 'test/ui/components/lythaus_side_navigation_test.dart', '--reporter', 'json'];
const run = spawnSync('flutter', args, {cwd:root, encoding:'utf8', env:{...process.env, LYTHAUS_NAV_EVIDENCE:output}});
await writeFile(path.join(output, 'tests.jsonl'), run.stdout ?? '');
assert.equal(run.status, 0, run.stderr || run.stdout || String(run.error));
const events = run.stdout.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
assert.equal(events.findLast(event => event.type === 'done')?.success, true);
const tests = events.filter(event => event.type === 'testDone' && !event.hidden).map(event => ({
  name:events.find(start => start.type === 'testStart' && start.test.id === event.testID).test.name,
  result:event.result, skipped:event.skipped,
}));
assert.equal(tests.length, 9);
assert.ok(tests.every(test => test.result === 'success' && !test.skipped));
const artifacts = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const theme of ['light','dark']) for (const mode of ['compact','expanded']) for (const scale of [1,2]) {
  const name = `${theme}-${mode}-${scale}x.png`;
  const bytes = await readFile(path.join(output, name));
  const metadata = await stat(path.join(output, name));
  assert.ok(metadata.mtime.toISOString() >= startedAt);
  artifacts.push({path:name, bytes:bytes.length, sha256:hash(bytes), capturedAt:metadata.mtime.toISOString(), sourceCommit});
}
assert.equal(git('rev-parse','HEAD'), sourceCommit);
assert.equal(git('status','--porcelain'), '');
const sourceHashes = [];
for (const file of ['lib/ui/components/lythaus_side_navigation.dart','lib/ui/screens/adaptive_shell.dart','test/ui/components/lythaus_side_navigation_test.dart']) {
  sourceHashes.push({path:file, sha256:hash(await readFile(path.join(root,file)))});
}
await writeFile(path.join(output,'results.json'), `${JSON.stringify({
  sourceCommit, cleanTreeAtStartAndEnd:true, startedAt, completedAt:new Date().toISOString(),
  flutter:JSON.parse(execFileSync('flutter',['--version','--machine'],{cwd:root,encoding:'utf8'})),
  command:['flutter',...args].join(' '), textScaling:'TextScaler.linear(1/2), native Flutter',
  tests, logSha256:hash(run.stdout), sourceHashes, artifacts,
}, null, 2)}\n`);
console.log(JSON.stringify({sourceCommit, output, tests:tests.length, artifacts:artifacts.length}));
