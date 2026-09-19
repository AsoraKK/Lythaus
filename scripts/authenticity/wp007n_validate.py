"""Bounded repository regressions; logs external, inherited failures explicit."""
import ast
import json
import re
import shlex
import subprocess
import sys
import time
from pathlib import Path
from wp007n_analysis import OUT,REPO,RUNTIME,save,sha


def main():
    parent=RUNTIME.parent/'lythaus-wp007m-discovery'
    if subprocess.check_output(['git','rev-parse','HEAD'],cwd=parent,text=True).strip()!='e3adbcb3cb2ac0991db231476441d133db3e2cd3':raise ValueError('PARENT_CHANGED')
    if subprocess.check_output(['git','diff','--name-only','HEAD'],cwd=parent,text=True).strip():raise ValueError('PARENT_DIRTY')
    logs=RUNTIME/'validation';logs.mkdir(exist_ok=True)
    results={};pkg=json.loads((REPO/'package.json').read_text())
    def run(name,command,cwd=REPO):
        start=time.time();p=subprocess.run(command,cwd=cwd,capture_output=True,text=True,encoding='utf-8',errors='replace')
        log=logs/(name+'.log');log.write_text(p.stdout+'\n'+p.stderr,encoding='utf-8')
        results[name]={'exitCode':p.returncode,'command':command,'checkout':'N' if cwd==REPO else 'UNCHANGED_M_PARENT','seconds':time.time()-start,'logHash':sha(log),'log':'external/wp007n/validation/'+log.name,'counts':re.findall(r'# (?:tests|pass|fail|skipped) \d+',p.stdout),'failures':re.findall(r'^not ok .+$',p.stdout,re.M)}
        save(OUT/'validation-summary.json',{'commands':results,'status':'RUNNING'})
        print(name+': '+str(p.returncode)+' '+str(results[name]['counts']),flush=True)
    tests=sorted(str(p.relative_to(REPO)) for p in (REPO/'packages/authenticity/tests').glob('*.test.mjs'))
    run('authenticity-full',['node','--experimental-strip-types','--test-concurrency=2','--test',*tests])
    for name in ('typecheck:native','validate:native-scope','validate:workflow-action-pins','validate:no-retired-provider-dependencies','test:native-architecture'):
        command=shlex.split(pkg['scripts'][name])
        if command[0]=='tsc':command=['node','node_modules/typescript/bin/tsc',*command[1:]]
        if name=='test:native-architecture':command.insert(1,'--test-concurrency=2')
        key=name.replace(':','-');run(key,command)
        if results[key]['exitCode']:run('parent-'+key,command,parent)
    run('python-N',['C:/Python313/python.exe','-m','unittest','discover','-s','scripts/authenticity','-p','test_wp007n*.py'])
    run('independent-known-answers',['C:/Python313/python.exe','scripts/authenticity/wp007n_independent_audit.py','--self-test'])
    for name in ('test_wp007e_policies.py','test_wp007m_probe.py'):
        run(name,['C:/Python313/python.exe','scripts/authenticity/'+name])
    run('diff-check',['git','diff','--check','e3adbcb3cb2ac0991db231476441d133db3e2cd3'])
    run('node-syntax',['node','--check','packages/authenticity/tests/wp007n.test.mjs'])
    files=list((REPO/'scripts/authenticity').glob('*wp007n*.py'))
    for p in files:ast.parse(p.read_text())
    jsons=list(OUT.glob('*.json'))
    for p in jsons:json.loads(p.read_text())
    flags=[]
    for p in list(OUT.glob('*'))+files+[REPO/'packages/authenticity/tests/wp007n.test.mjs']:
        if p.is_file() and re.search(r'[A-Za-z]:[\\/]+Users[\\/]|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----',p.read_text(encoding='utf-8')):flags.append(str(p.relative_to(REPO)))
    save(OUT/'validation-summary.json',{'commands':results,'status':'COMPLETED_WITH_EXPLICIT_RESULTS','AST':{'pass':True,'files':len(files)},'JSON':{'pass':True,'files':len(jsons)},'privacySecrets':{'pass':not flags,'flags':flags},'dependencyHydration':'Reused locked L node_modules root junction; checkout-local workspace package links; unchanged package-lock; no new repository dependencies. Transient missing-link failures preserved in validation-runtime-recovery.md','parent':'e3adbcb3cb2ac0991db231476441d133db3e2cd3'})


if __name__=='__main__':main()
