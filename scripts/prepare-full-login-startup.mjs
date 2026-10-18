import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {observeFullLoginBrand} from './tests/full-login-source.mjs';
const [directRoot,neutralRoot,evidenceRoot]=process.argv.slice(2);
const file='lib/design_system/widgets/lyth_brand.dart';
const source=await readFile(file,'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
const direct=observeFullLoginBrand(source),neutral=observeFullLoginBrand(source,true);
await writeFile(path.join(directRoot,file),direct);
await writeFile(path.join(neutralRoot,file),neutral);
await writeFile(path.join(evidenceRoot,'direct-brand-source.dart'),direct);
await writeFile(path.join(evidenceRoot,'neutral-brand-source.dart'),neutral);
await writeFile(path.join(evidenceRoot,'source-construction.json'),JSON.stringify({
 originalBrandSha256:sha(source),directBrandSha256:sha(direct),neutralBrandSha256:sha(neutral),
 entry:'Original full login entry plus common pipeline observation; no geometry, transforms or renderer changes.',
 change:'Only direct artwork versus two-color placeholder differs between builds. Capture before semantics activation after first observed Dart frame, then activate semantics and capture again.',
 configuration:{screen:'login',theme:'light',width:320,height:960,textScale:2,brandHeight:40},
},null,2));
