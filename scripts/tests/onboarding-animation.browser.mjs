import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepareAnimationObserver} from './onboarding-animation-source.mjs';

const output='build/onboarding-animation';await mkdir(output,{recursive:true});
const original=await readFile(new URL('./onboarding-lifecycle.browser.mjs',import.meta.url),'utf8');
const adapted=prepareAnimationObserver(original);
const generated=new URL(`./.onboarding-animation-generated-${process.pid}.mjs`,import.meta.url);
await writeFile(output+'/original-observer.mjs',original);await writeFile(output+'/adapted-observer.mjs',adapted);
await writeFile(output+'/observer-hashes.json',JSON.stringify({original:createHash('sha256').update(original).digest('hex'),adapted:createHash('sha256').update(adapted).digest('hex')},null,2)+'\n');
await writeFile(generated,adapted);
try{await import(generated.href);}finally{await unlink(generated);}
const engine=process.env.ONBOARDING_ENGINE??'chromium';
const resources=JSON.parse(await readFile(`${output}/${engine}/resources.json`));
assert.equal(resources.resources['animations-disabled-1']['main.dart.js'],'f3c2ac03fe03ad2e4a09371765e34f42c92b996a1eb941482502915c3b85e521','Disabled policy preserves the exact PR1046 configured-static binary');
const result=JSON.parse(await readFile(`${output}/${engine}/results.json`));
const geometries=result.results.flatMap(r=>r.snapshots.map(s=>{const {disableAnimations,...geometry}=s.before.layout.screens[0];return geometry;}));
const identicalGeometry=geometries.every(g=>JSON.stringify(g)===JSON.stringify(geometries[0]));
await writeFile(`${output}/${engine}/control-verification.json`,JSON.stringify({identicalGeometry,baselineConfiguredBinaryMatched:true,policies:result.results.map(r=>({kind:r.kind,disableAnimations:r.snapshots[0].before.layout.screens[0].disableAnimations,requests:r.requests,outcomes:r.snapshots.map(s=>({dwell:s.dwell,rendered:s.rendered}))}))},null,2)+'\n');
assert.ok(identicalGeometry,'All visible geometry remains identical across policy values and capture times');
for(const row of result.results)assert.deepEqual(row.requests,[],'No application API traffic in either static control');
