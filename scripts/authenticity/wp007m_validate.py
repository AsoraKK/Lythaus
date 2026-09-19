"""Bounded regression runner; preserve logs outside Git and summarize exits."""
import argparse
import ast
import hashlib
import importlib.metadata as md
import json
from pathlib import Path
import re
import shlex
import subprocess
import time

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"research/wp007m"


def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--bulk",required=True);ap.add_argument("--parent",required=True);args=ap.parse_args()
    logs=Path(args.bulk)/"validation";logs.mkdir(parents=True,exist_ok=True)
    pkg=json.loads((ROOT/"package.json").read_text());results={}
    def run(name,cmd,cwd=ROOT):
        start=time.time();p=subprocess.run(cmd,cwd=cwd,capture_output=True,text=True,encoding="utf-8",errors="replace")
        log=logs/(name+".log");log.write_text(p.stdout+"\n"+p.stderr,encoding="utf-8")
        results[name]={"exitCode":p.returncode,"command":cmd,"cwdRole":"WP007M" if cwd==ROOT else "UNCHANGED_PARENT","seconds":time.time()-start,"logSha256":sha(log),"logicalLog":"external/wp007m/validation/"+log.name,"tapSummary":re.findall(r"# (?:tests|pass|fail|skipped) \d+",p.stdout),"failures":re.findall(r"^not ok .+$",p.stdout,re.M)}
        print(name+": "+str(p.returncode)+" "+str(results[name]["tapSummary"]),flush=True)
    tests=sorted(str(p.relative_to(ROOT)) for p in (ROOT/"packages/authenticity/tests").glob("*.test.mjs"))
    run("authenticity-full",["node","--experimental-strip-types","--test-concurrency=2","--test",*tests])
    for name in ["typecheck:native","validate:native-scope","validate:workflow-action-pins","validate:no-retired-provider-dependencies","test:native-architecture"]:
        command=shlex.split(pkg["scripts"][name])
        if command[0]=="tsc":command=["node","node_modules/typescript/bin/tsc",*command[1:]]
        if name=="test:native-architecture":command.insert(1,"--test-concurrency=2")
        run(name.replace(":","-"),command)
        if name in ["test:native-architecture","validate:no-retired-provider-dependencies"] and results[name.replace(":","-")]["exitCode"]:
            run("parent-"+name.replace(":","-"),command,Path(args.parent))
    run("diff-check",["git","diff","--check","63d5daf05243673ad65f2b59dbdb81e94290180b"])
    run("node-syntax",["node","--check","scripts/authenticity/wp007m_sharp.cjs"])
    run("python-focused",[__import__("sys").executable,"scripts/authenticity/test_wp007m_probe.py"])
    files=list((ROOT/"scripts/authenticity").glob("*wp007m*.py"))
    for p in files:ast.parse(p.read_text())
    jf=list(OUT.glob("*.json"))
    for p in jf:json.loads(p.read_text())
    scans=[]
    for p in list(OUT.glob("*"))+files+[ROOT/"packages/authenticity/tests/wp007m.test.mjs"]:
        if not p.is_file():continue
        txt=p.read_text(encoding="utf-8")
        if re.search(r"[A-Za-z]:[\\/]+Users[\\/]|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----",txt):scans.append(str(p.relative_to(ROOT)))
    licenses=[]
    for name in ["numpy","scipy","Pillow","scikit-learn","PyWavelets","torch","torchvision","kornia","pytorch-wavelets"]:
        d=md.distribution(name);meta=d.metadata
        dist_files=d.files or [];record=next((d.locate_file(f) for f in dist_files if str(f).endswith(".dist-info/RECORD")),None)
        licenses.append({"name":name,"version":d.version,"licenseExpression":meta.get("License-Expression"),"licenseField":(meta.get("License") or "NOT_STATED")[:500],"recordHash":sha(record) if record else None,"source":meta.get_all("Project-URL",[]),"use":"EXISTING_LOCAL_RUNTIME_NO_NEW_DOWNLOAD"})
    sharp=ROOT/"node_modules/sharp/package.json";sp=json.loads(sharp.read_text())
    licenses.append({"name":"sharp","version":sp["version"],"license":sp["license"],"packageHash":sha(sharp),"repositoryLockHash":sha(ROOT/"package-lock.json")})
    save={"commands":results,"pythonAst":{"pass":True,"files":len(files)},"jsonParse":{"pass":True,"files":len(jf)},"privacySecretScan":{"pass":not scans,"flaggedFiles":scans,"scope":"WP007M artifacts and changed Python/test source; no sensitive source metadata written"},"dependencies":"Reused previous locked node_modules through root junction and worktree-local declared npm workspace junctions; no package version, install or lockfile mutation","createdUnix":time.time()}
    (OUT/"validation-summary.json").write_text(json.dumps(save,indent=2)+"\n")
    (OUT/"runtime-rights-freeze.json").write_text(json.dumps({"packages":licenses,"sourceCopying":"No third-party method code copied; algebra implemented locally; no GPL/AGPL code imported","deployment":"SAFE checkpoint and dataset output rights remain separate, no commercial clearance","codeHash":sha(__file__)},indent=2)+"\n")


if __name__=="__main__":main()
