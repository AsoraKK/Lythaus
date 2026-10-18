import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {observeFullLoginBrand} from './tests/full-login-source.mjs';
const [directRoot,svgRoot,neutralRoot,evidenceRoot]=process.argv.slice(2);
const file='lib/design_system/widgets/lyth_brand.dart';
const source=await readFile(file,'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
const direct=observeFullLoginBrand(source),neutral=observeFullLoginBrand(source,true);
const svgRevision='f2c8712de963d6dc8f1d254abe6448f6a397da8f';
const svg=execFileSync('git',['show',svgRevision+':'+file],{encoding:'utf8'});
await writeFile(path.join(directRoot,file),direct);
await writeFile(path.join(svgRoot,file),svg);
await writeFile(path.join(neutralRoot,file),neutral);
await writeFile(path.join(evidenceRoot,'source-construction.json'),JSON.stringify({
 originalBrandSha256:sha(source),directBrandSha256:sha(direct),neutralBrandSha256:sha(neutral),svgBrandSha256:sha(svg),svgRevision,
 entry:'full_login_diagnostic_entry.dart calls approved_brand_entry.main unchanged',
 change:'Direct and two-color placeholder differ only at artwork drawing; same fitted bounds, transforms, size and semantics. SVG uses the pinned LythBrand source unchanged. All three call the same login entry and common pipeline observation.',
 svgReadiness:'No SVG decoded/frame-ready callback instrumented; a blank SVG capture alone cannot prove a compositing regression.',
 configuration:{screen:'login',theme:'light',width:320,height:960,textScale:2,brandHeight:40},
},null,2));
await writeFile(path.join(evidenceRoot,'direct-brand-source.dart'),direct);
await writeFile(path.join(evidenceRoot,'neutral-brand-source.dart'),neutral);
await writeFile(path.join(evidenceRoot,'svg-brand-source.dart'),svg);
