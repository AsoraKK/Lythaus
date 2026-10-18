import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
for(const change of ['version-only','wasm','loader'])test('paired resource contract: '+change,async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'brand-pair-'));
 try{
  for(const name of ['baseline','candidate','output'])await mkdir(path.join(root,name));
  for(const name of ['baseline','candidate']){
   await writeFile(path.join(root,name,'main.dart.js'),name);
   await writeFile(path.join(root,name,'.last_build_id'),name+'-build-marker');
   await writeFile(path.join(root,name,'canvaskit.wasm'),change==='wasm'?name:'same WASM');
   await writeFile(path.join(root,name,'flutter_bootstrap.js'),`loader(${change==='loader'?name:'same'}); serviceWorkerVersion: "${name==='baseline'?123:456}"`);
  }
  const result=spawnSync(process.execPath,['scripts/tests/brand-diagnostic-pair.mjs'],{env:{...process.env,
   BRAND_DIAGNOSTIC_BASELINE:path.join(root,'baseline'),BRAND_DIAGNOSTIC_CANDIDATE:path.join(root,'candidate'),BRAND_DIAGNOSTIC_OUTPUT:path.join(root,'output')},encoding:'utf8'});
  if(change==='version-only'){
   assert.equal(result.status,0,result.stderr);
   const report=JSON.parse(await readFile(path.join(root,'output','paired-resources.json'),'utf8'));
   assert.deepEqual(report.differences,['main.dart.js']);
   assert.notEqual(report.bootstrapOriginal.baseline,report.bootstrapOriginal.candidate);
   assert.equal(await readFile(path.join(root,'output','baseline-last-build-id.txt'),'utf8'),'baseline-build-marker');
   assert.equal(await readFile(path.join(root,'output','candidate-last-build-id.txt'),'utf8'),'candidate-build-marker');
   assert.equal(Object.hasOwn(report.after.baseline,'.last_build_id'),false);
  }else assert.notEqual(result.status,0,'Resource mismatch must stop diagnostic comparison');
 }finally{await rm(root,{recursive:true,force:true});}
});
