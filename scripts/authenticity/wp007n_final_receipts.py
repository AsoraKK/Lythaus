"""Final allowlist, artifact, code and regression receipts; no reserve inspection."""
import ast
import json
import re
import subprocess
import time
from pathlib import Path
from wp007n_core import OUT,REPO,RUNTIME,file_hash,digest,save_json,SAFE_HASH,resources
from wp007n_analysis import read
from wp007n_freeze import validate_roles
from wp007n_guards import execution_signature,validate_calibrations


def validate_regressions(checks):
    if checks['status']!='COMPLETED_WITH_EXPLICIT_RESULTS':raise ValueError('VALIDATION_INCOMPLETE')
    commands=checks['commands']
    required=('authenticity-full','typecheck-native','validate-native-scope','validate-workflow-action-pins','python-N','independent-known-answers','test_wp007e_policies.py','test_wp007m_probe.py','diff-check','node-syntax')
    if any(commands[name]['exitCode']!=0 for name in required):raise ValueError('REQUIRED_REGRESSION_FAILED')
    if commands['authenticity-full']['counts']!=['# tests 388','# pass 388','# fail 0','# skipped 0']:raise ValueError('AUTHENTICITY_COVERAGE_CHANGED')
    for name in ('test-native-architecture','validate-no-retired-provider-dependencies'):
        current=commands[name];parent=commands['parent-'+name]
        if current['exitCode']==0 or any(current[k]!=parent[k] for k in ('exitCode','counts','failures')):raise ValueError('INHERITED_FAILURE_MISMATCH')
    if commands['test-native-architecture']['counts']!=['# tests 256','# pass 255','# fail 1','# skipped 0']:raise ValueError('ARCHITECTURE_COVERAGE_CHANGED')
    if not all(checks[name]['pass'] for name in ('AST','JSON','privacySecrets')):raise ValueError('STATIC_VALIDATION_FAILED')


def main():
    checks=read(OUT/'validation-summary.json');validate_regressions(checks)
    co=read(OUT/'cohort-freeze.json');validate_roles(co['rows'])
    seal=read(OUT/'protocol-hash.json');validate_calibrations(co,seal['canonicalProtocolHash'])
    models=read(OUT/'checkpoint-freeze.json')
    actual={arm:file_hash(RUNTIME/'models'/name) for arm,name in [('A','dinov2_vitl14_pretrain.pth'),('B','PE-Core-B16-224.pt')]}
    if any(actual[a]!=models[a]['sha256'] for a in actual):raise ValueError('BACKBONE_ARTIFACT_CHANGED')
    safe=RUNTIME.parent/'wp007g-SAFE/checkpoint/checkpoint-best.pth'
    if file_hash(safe)!=SAFE_HASH:raise ValueError('SAFE_CHANGED')
    allowed={r['sampleId'] for r in co['rows']};accessed={};rows={}
    for arm in ('A','B'):
        caches=[read(p) for p in (RUNTIME/'features'/arm).glob('*.json')]
        ids={x['sampleId'] for x in caches}
        if ids!=allowed:raise ValueError('EXTRA_OR_MISSING_PARENT')
        accessed[arm]=sorted(ids);rows[arm]=sum(len(x['records']) for x in caches)
    save_json(OUT/'flux2-zero-access.json',{'claimScope':'N code and recorded allowlisted run artifacts, not a global OS audit','cohortHash':co['freezeHash'],'accessedParentCounts':{k:len(v) for k,v in accessed.items()},'accessedParentIdsHash':digest(accessed),'recordCounts':rows,'FLUX2':{'bytes':0,'pixels':0,'thumbnails':0,'decode':0,'features':0,'inference':0,'providerCalls':0},'sealedEF2FutureReservesAccess':0,'enforcement':'Source path/role/hash allowlists checked; prohibited-name/path tests; exact cache IDs equal authorized cohort. No reserve directory scan or reserve media inspection performed.','disposition':'REMAIN_SEALED','productionAuthorization':'NO'})
    changed=subprocess.check_output(['git','diff','--name-only','e3adbcb3cb2ac0991db231476441d133db3e2cd3'],cwd=REPO,text=True).splitlines()
    untracked=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=REPO,text=True).splitlines()
    files=sorted(set(changed+untracked));flags=[];parsed=0
    for f in files:
        p=REPO/f
        if not p.is_file():continue
        text=p.read_text(encoding='utf-8')
        if p.suffix=='.py':ast.parse(text)
        if p.suffix=='.json':json.loads(text);parsed+=1
        if re.search(r'[A-Za-z]:[\\/]+Users[\\/]|ghp_[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----',text):flags.append(f)
    if flags:raise ValueError('PRIVATE_PATH_OR_SECRET:'+str(flags))
    currentlog=(RUNTIME/'validation/validate-no-retired-provider-dependencies.log').read_text()
    parentlog=(RUNTIME/'validation/parent-validate-no-retired-provider-dependencies.log').read_text()
    if currentlog!=parentlog:raise ValueError('RETIRED_BASELINE_DIFFERENT')
    for rel in ('scripts/tests/production-release-governance.test.mjs','.github/workflows/production-release.yml'):
        if (REPO/rel).exists():
            blob=subprocess.check_output(['git','show','e3adbcb3cb2ac0991db231476441d133db3e2cd3:'+rel],cwd=REPO)
            import hashlib
            normalized=(REPO/rel).read_bytes().replace(b'\r\n',b'\n')
            if normalized!=blob.replace(b'\r\n',b'\n'):raise ValueError('BASELINE_FILE_CHANGED')
    diff=subprocess.run(['git','diff','--check','e3adbcb3cb2ac0991db231476441d133db3e2cd3'],cwd=REPO,capture_output=True,text=True)
    if diff.returncode:raise ValueError('DIFF_CHECK')
    save_json(OUT/'final-reproducibility-receipt.json',{'timeUnix':time.time(),'codeCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip(),'executionSignature':execution_signature(),'protocolHash':seal['canonicalProtocolHash'],'cohortHash':co['freezeHash'],'environmentHash':read(OUT/'runtime-freeze.json')['environmentHash'],'modelHashesAfter':actual,'SAFEhashAfter':SAFE_HASH,'SAFEthreshold':.5864923000335693,'derivedFeatureBytes':sum(p.stat().st_size for p in (RUNTIME/'features').rglob('*') if p.is_file()),'resourcesAfter':resources(),'ASTAndJSONPass':True,'jsonFiles':parsed,'privacySecretsPass':True,'diffCheckPass':True,'retiredCheckIdenticalParentLog':True,'architectureFailure':'Same named CRLF-sensitive production workflow regex failure on unchanged parent;255/256 both','productionAuthorization':'NO'})
    print('FINAL_RECEIPTS_VALIDATED')


if __name__=='__main__':main()
