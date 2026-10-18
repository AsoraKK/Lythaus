import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {prepareAnimationSource} from './tests/onboarding-animation-source.mjs';

const [root,output,policy]=process.argv.slice(2);
if(!['disabled','enabled'].includes(policy))throw Error('Unknown animation policy');
const file='test/browser/approved_brand_entry.dart';
const original=await readFile(file,'utf8'),prepared=prepareAnimationSource(original,policy==='disabled');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(output,{recursive:true});await writeFile(path.join(root,file),prepared);
await writeFile(path.join(output,'original-entry.dart'),original);await writeFile(path.join(output,'prepared-entry.dart'),prepared);
await writeFile(path.join(output,'construction.json'),JSON.stringify({policy,originalSha256:hash(original),preparedSha256:hash(prepared),difference:'Only the existing MediaQuery.disableAnimations literal varies between controls; identical common read-only geometry getter and original static auth/analytics setup. No presentation wrapper.'},null,2)+'\n');
