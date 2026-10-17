import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {observeFullLoginBrand} from './tests/full-login-source.mjs';
const [root,output]=process.argv.slice(2),file='lib/design_system/widgets/lyth_brand.dart';
const original=await readFile(file,'utf8'),instrumented=observeFullLoginBrand(original);
const hash=value=>createHash('sha256').update(value).digest('hex');
await writeFile(path.join(root,file),instrumented);
await writeFile(path.join(output,'direct-brand-source.dart'),instrumented);
await writeFile(path.join(output,'source-construction.json'),JSON.stringify({
 originalBrandSha256:hash(original),instrumentedBrandSha256:hash(instrumented),
 construction:'One direct build shared by two fresh no-semantics arms. Only one arm invokes the fixture-only scheduleFrame bridge, once after initial capture. No geometry or renderer changes.',
},null,2));
