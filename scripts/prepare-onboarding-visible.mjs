import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {prepareVisibleOnboardingSource} from './tests/onboarding-visible-source.mjs';
const [root,output]=process.argv.slice(2),original=await readFile('lib/main.dart','utf8'),prepared=prepareVisibleOnboardingSource(original);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(output,{recursive:true});await writeFile(path.join(root,'lib/main.dart'),prepared);
const helpers={};
for(const name of ['brand_login_geometry.dart','onboarding_visible_geometry.dart','onboarding_visible_route.dart','onboarding_visible_probe.dart']){
 const bytes=await readFile('test/browser/'+name);helpers[name]=hash(bytes);
 await writeFile(path.join(root,'lib',name),bytes);await writeFile(path.join(output,name),bytes);
}
await writeFile(path.join(output,'original-entry.dart'),original);await writeFile(path.join(output,'prepared-entry.dart'),prepared);
await writeFile(path.join(output,'construction.json'),JSON.stringify({originalSha256:hash(original),preparedSha256:hash(prepared),helpers,presentation:'Real visible login bootstrap; after verified original paint and completed signed-out refresh, a fixture-only zero-transition route uses its existing Navigator to present the actual onboarding component. No production GoRoute, duplicate app or Navigator is added.'},null,2)+'\n');
