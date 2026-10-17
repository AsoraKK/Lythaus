import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const candidate=process.env.BRAND_DIAGNOSTIC_CANDIDATE, baseline=process.env.BRAND_DIAGNOSTIC_BASELINE;
const output=process.env.BRAND_DIAGNOSTIC_OUTPUT;
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function inventory(root,prefix=''){
 const result={};
 for(const entry of await readdir(path.join(root,prefix),{withFileTypes:true})){
  const name=path.join(prefix,entry.name);
  if(entry.isDirectory())Object.assign(result,await inventory(root,name));
  else if(entry.isFile())result[name]=hash(await readFile(path.join(root,name)));
 }return result;
}
const before={baseline:await inventory(baseline),candidate:await inventory(candidate)};
// Flutter's hidden incremental-build marker is not a browser resource. Preserve
// both originals in the evidence directory and keep it out of both served roots.
for(const [name,root] of [['baseline',baseline],['candidate',candidate]]){
 if(Object.hasOwn(before[name],'.last_build_id'))
  await rename(path.join(root,'.last_build_id'),path.join(output,name+'-last-build-id.txt'));
}
// Flutter embeds a build-specific service-worker version in otherwise identical
// loader bytes. Record both originals and use exactly the candidate loader for
// both synthetic fixtures only after validating this is the sole difference.
const a=await readFile(path.join(baseline,'flutter_bootstrap.js'),'utf8');
const b=await readFile(path.join(candidate,'flutter_bootstrap.js'),'utf8');
const normalize=value=>value.replace(/(serviceWorkerVersion\s*:\s*)["']?\d+["']?/g,'$1BUILD_VERSION');
assert.equal(normalize(a),normalize(b),'Unexpected bootstrap difference');
await writeFile(path.join(baseline,'flutter_bootstrap.js'),b);
const after={baseline:await inventory(baseline),candidate:await inventory(candidate)};
const differences=[...new Set([...Object.keys(after.baseline),...Object.keys(after.candidate)])].filter(k=>after.baseline[k]!==after.candidate[k]);
await writeFile(path.join(output,'paired-resources.json'),JSON.stringify({source:sha,reviewHead:process.env.DIAGNOSTIC_REVIEW_HEAD,
 baselineRenderer:process.env.BRAND_DIAGNOSTIC_RENDERER_BASE,construction:'Same current tree; only baseline LythBrand replaced with the pinned SVG renderer. Same fixture/dependencies/resources.',
 bootstrapOriginal:{baseline:hash(a),candidate:hash(b)},before,after,differences},null,2));
assert.deepEqual(differences,['main.dart.js'],'Non-application resources must match exactly');
await writeFile(path.join(output,'builds.json'),JSON.stringify([
 {name:'baseline-renderer',sha,renderer:process.env.BRAND_DIAGNOSTIC_RENDERER_BASE,root:baseline},
 {name:'candidate',sha,root:candidate},
]));
