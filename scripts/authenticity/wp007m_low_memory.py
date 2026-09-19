"""Feature-only continuation; missing SAFE results never become negatives."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import time
import numpy as np
from PIL import Image
from wp007m_probe import OUT,ROOT,CONDITIONS,SAFE_HASH,SAFE_THRESHOLD,load,save,digest,filehash,allowed,resources,transform,measure


def main():
    p=argparse.ArgumentParser();p.add_argument("--media",required=True);p.add_argument("--bulk",required=True);p.add_argument("--sharp",required=True);args=p.parse_args()
    co=load(OUT/"cohort-freeze.json");c=dict(co);h=c.pop("freezeHash")
    if digest(c)!=h:raise ValueError("COHORT_MUTATED")
    rule=load(OUT/"decision-freeze.json");x=dict(rule);rh=x.pop("freezeHash")
    if digest(x)!=rh or rule["cohortHash"]!=h:raise ValueError("RULE_MUTATED")
    bulk=Path(args.bulk);dest=bulk/"heldout-rows.jsonl"
    raw=list(map(json.loads,dest.read_text().splitlines()));done={(r["sampleId"],r["condition"]) for r in raw}
    if len(done)!=len(raw):raise ValueError("DUPLICATE_ROWS")
    start=time.time();added=0;states=[]
    for r in [r for r in co["rows"] if r["role"]=="HELDOUT"]:
        if all((r["sampleId"],c) in done for c in CONDITIONS):continue
        state=resources();states.append(state)
        if state["availableRamBytes"]<4*1024**3 or state["freeDiskBytes"]<1024**3:raise RuntimeError("RESOURCE_GUARD_RESUMABLE_STOP")
        path=allowed(args.media,r["relativePath"],r["sourceFamilyId"])
        if filehash(path)!=r["sha256"]:raise ValueError("SOURCE_CHANGED")
        with Image.open(path) as im:
            x=round((im.width-256)/2);y=round((im.height-256)/2)
            rgb=np.array(im.crop((x,y,x+256,y+256)).convert("RGB"))
        for condition in CONDITIONS:
            if (r["sampleId"],condition) in done:continue
            t=time.perf_counter();a,facts=transform(rgb,condition,args.sharp)
            begin=time.perf_counter();features,null,base=measure(a);ms=(time.perf_counter()-begin)*1000
            row={"sampleId":r["sampleId"],"condition":condition,"cohortHash":h,"codeHash":filehash(Path(__file__).with_name("wp007m_probe.py")),"runnerCodeHash":filehash(__file__),"inputSha256":r["sha256"],"features":features,"spatialNull":null,"baseline":base,"safeScore":None,"safeStatus":"UNAVAILABLE_RESOURCE_GUARD_NOT_NEGATIVE","safeThreshold":SAFE_THRESHOLD,"safeHash":SAFE_HASH,"codec":facts,"featureMs":ms,"safeMs":None,"totalMs":(time.perf_counter()-t)*1000,"missingFeatures":[k for k,v in features.items() if v is None],"productionAuthorization":"NO"}
            with dest.open("a",encoding="utf-8") as f:f.write(json.dumps(row,allow_nan=False)+"\n")
            added+=1
        print("HELDOUT feature parents complete="+str(len(done)//8+added//8),flush=True)
    allrows=list(map(json.loads,dest.read_text().splitlines()))
    save(OUT/"heldout-run.json",{"role":"HELDOUT","rows":len(allrows),"parents":len({r["sampleId"] for r in allrows}),"safeAvailable":sum(r["safeScore"] is not None for r in allrows),"safeMissing":sum(r["safeScore"] is None for r in allrows),"resourceStopsBeforeContinuation":4,"continuation":"FEATURE_ONLY_AFTER_COMBINED_PROCESS_HIT_4GIB_GUARD","cohortHash":h,"ruleHash":rh,"codeHash":filehash(__file__),"featureCodeHash":filehash(Path(__file__).with_name("wp007m_probe.py")),"codeCommit":subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip(),"environmentReference":"discovery-run.json; same approved runtime, no torch imported for continuation","startUnix":start,"endUnix":time.time(),"command":"python scripts/authenticity/wp007m_low_memory.py --media <WP007I_MEDIA> --bulk <EXTERNAL_WP007M> --sharp <EXISTING_SHARP>","outputHash":filehash(dest),"outputLogicalPath":"external/wp007m/heldout-rows.jsonl","resourceSamples":states,"seed":0,"flux2Access":0,"providerCalls":0})


if __name__=="__main__":main()
