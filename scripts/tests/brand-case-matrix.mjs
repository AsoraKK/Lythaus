import assert from 'node:assert/strict';
export const brandCaseKeys=['light','dark'].flatMap(theme=>[320,390,1440].flatMap(width=>['login','onboarding','shell','admin'].map(screen=>`${screen}-${theme}-${width}`)));
export function assertBrandCaseMatrix(results,selectedCase){
 const keys=results.map(r=>`${r.screen}-${r.theme}-${r.width}`);
 assert.equal(new Set(keys).size,keys.length,'Brand cases must be unique');
 assert.deepEqual([...keys].sort(),(selectedCase?[selectedCase]:[...brandCaseKeys]).sort(),'Every required brand case must run');
}
