import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const output=process.env.BRAND_DIAGNOSTIC_OUTPUT;
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const builds=[
 {name:'direct-brand',sha:source,root:process.env.BRAND_DIAGNOSTIC_CANDIDATE},
 {name:'pinned-svg',sha:source,root:process.env.BRAND_DIAGNOSTIC_SVG},
 {name:'neutral-placeholder',sha:source,root:process.env.BRAND_DIAGNOSTIC_BASELINE},
];
for(const baseline of builds.slice(1)){
 const pairOutput=path.join(output,'resources-'+baseline.name);
 await mkdir(pairOutput,{recursive:true});
 execFileSync(process.execPath,['scripts/tests/brand-diagnostic-pair.mjs'],{stdio:'inherit',env:{...process.env,
  BRAND_DIAGNOSTIC_OUTPUT:pairOutput,BRAND_DIAGNOSTIC_BASELINE:baseline.root,
  BRAND_DIAGNOSTIC_RENDERER_BASE:baseline.name,
  BRAND_DIAGNOSTIC_DESCRIPTION:'Matched full login: same current tree, entry, theme, fonts, form, scrolling, 40px slot and 2x text. Only LythBrand renderer differs. Bootstrap build nonce normalized after checking all other loader bytes.',
 }});
}
await writeFile(path.join(output,'builds.json'),JSON.stringify(builds,null,2));
