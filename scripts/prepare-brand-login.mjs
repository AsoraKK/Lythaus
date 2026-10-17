import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {prepareBrandLoginSource} from './tests/brand-login-source.mjs';
const [root,output]=process.argv.slice(2);
const original=await readFile('lib/main.dart','utf8'),prepared=prepareBrandLoginSource(original);
const geometry=await readFile('test/browser/brand_login_geometry.dart','utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
await writeFile(path.join(root,'lib/main.dart'),prepared);
await writeFile(path.join(output,'prepared-main.dart'),prepared);
await writeFile(path.join(output,'brand-login-geometry.dart'),geometry);
await writeFile(path.join(output,'source-construction.json'),JSON.stringify({originalMainSha256:hash(original),preparedMainSha256:hash(prepared),geometrySha256:hash(geometry),
 construction:'Original production bootstrap/router/providers, with test-only fixed text-scale wrapper and an on-demand read-only fractional layout getter. No frame callbacks, paint invalidation, semantics activation or artificial auth state.',
},null,2));
