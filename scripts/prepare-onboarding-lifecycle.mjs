import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {prepareStaticOnboarding,prepareProductionOnboarding} from './tests/onboarding-lifecycle-source.mjs';
const [root,output,kind]=process.argv.slice(2);
const file=kind==='production-host'?'lib/main.dart':'test/browser/approved_brand_entry.dart';
const original=await readFile(file,'utf8');
const prepared=kind==='production-host'?prepareProductionOnboarding(original):prepareStaticOnboarding(original,kind==='static-host');
await mkdir(output,{recursive:true});
await writeFile(path.join(root,file),prepared);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const helpers={};
for(const name of ['onboarding_lifecycle_host.dart','onboarding_lifecycle_geometry.dart']){
 const bytes=await readFile('test/browser/'+name);helpers[name]=hash(bytes);
 if(kind==='production-host')await writeFile(path.join(root,'lib',name),bytes);
 await writeFile(path.join(output,name),bytes);
}
await writeFile(path.join(output,'prepared-entry.dart'),prepared);
await writeFile(path.join(output,'original-entry.dart'),original);
await writeFile(path.join(output,'construction.json'),JSON.stringify({kind,file,originalSha256:hash(original),preparedSha256:hash(prepared),helpers,
 presentation:kind==='production-host'?'Unmodified real bootstrap, root lifecycle, router and providers; a fixture-only Navigator displays actual OnboardingIntroScreen while the real router remains mounted offstage. No onboarding URL is added.':kind==='static-host'?'Same presentation wrapper around the original static fixture. Original static auth stays unchanged.':'Original static setup, with only a common on-demand read-only layout getter.',
 caveat:'The common read-only geometry probe changes compiled bytes. This is controlled diagnostic evidence, not acceptance or a claim of a production onboarding route.',
},null,2)+'\n');
