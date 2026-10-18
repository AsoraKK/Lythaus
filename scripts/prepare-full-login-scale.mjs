import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {wrapProductionTextScale} from './tests/full-login-scale-source.mjs';
const [root,output]=process.argv.slice(2),file='lib/main.dart';
const original=await readFile(file,'utf8'),wrapped=wrapProductionTextScale(original);
const hash=value=>createHash('sha256').update(value).digest('hex');
await writeFile(path.join(root,file),wrapped);
await writeFile(path.join(output,'wrapped-main.dart'),wrapped);
await writeFile(path.join(output,'source-construction.json'),JSON.stringify({
 originalMainSha256:hash(original),wrappedMainSha256:hash(wrapped),
 construction:'Only the original runApp root is wrapped under ProviderScope in MediaQuery.withClampedTextScaling. Identical source and flags build both production twins except DIAGNOSTIC_TEXT_SCALE=1 or 2. Bootstrap, auth, router, provider and reload code remain intact. No frame hooks or artificial state transitions.',
},null,2));
