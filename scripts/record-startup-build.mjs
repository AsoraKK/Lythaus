import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {prepareBrandLoginSource} from './tests/brand-login-source.mjs';

const [fixtureDirectory,buildDirectory]=process.argv.slice(2);
assert.ok(fixtureDirectory&&buildDirectory,'Pass the instrumented worktree and built directory');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const candidateSha=git('rev-parse','HEAD');
assert.equal(git('-C',fixtureDirectory,'rev-parse','HEAD'),candidateSha);
assert.equal(git('status','--porcelain'),'','Candidate checkout must be clean');
assert.equal(git('-C',fixtureDirectory,'diff','--name-only','HEAD','--','lib','web','assets','pubspec.yaml','pubspec.lock'),'lib/main.dart');
assert.equal(git('-C',fixtureDirectory,'ls-files','--others','--exclude-standard','--','lib','web','assets'),'lib/brand_login_geometry.dart');
const original=await readFile('lib/main.dart','utf8');
const prepared=await readFile(path.join(fixtureDirectory,'lib/main.dart'),'utf8');
const geometry=await readFile('test/browser/brand_login_geometry.dart');
assert.equal(prepared,prepareBrandLoginSource(original));
assert.deepEqual(await readFile(path.join(fixtureDirectory,'lib/brand_login_geometry.dart')),geometry);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const files={};
async function walk(directory,relative='') {
  for(const item of await readdir(directory,{withFileTypes:true})) {
    const name=path.posix.join(relative,item.name);
    if(item.isDirectory())await walk(path.join(directory,item.name),name);
    else if(name!=='startup-build-provenance.json')files[name]=hash(await readFile(path.join(directory,item.name)));
  }
}
await walk(buildDirectory);
const provenance={candidateSha,sourceTree:git('rev-parse','HEAD^{tree}'),
  fixture:{originalMainSha256:hash(original),preparedMainSha256:hash(prepared),geometrySha256:hash(geometry),
    description:'Production main/router/providers with existing fixed-scale wrapper and read-only geometry getter; no focus, repaint, auth override or semantics activation.'},
  files};
await writeFile(path.join(buildDirectory,'startup-build-provenance.json'),JSON.stringify(provenance,null,2)+'\n');
console.log(JSON.stringify({candidateSha,files:Object.keys(files).length,mainSha256:files['main.dart.js']}));
