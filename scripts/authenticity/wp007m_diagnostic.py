"""Post-freeze consumed CSAFE/FLUX1 diagnostic, never a tuning population."""
import argparse
from collections import Counter
import time
from pathlib import Path
import numpy as np
from PIL import Image
from wp007m_probe import OUT,ROOT,load,save,digest,filehash,allowed,measure,transform,resources


def main():
    p=argparse.ArgumentParser();p.add_argument("--camera",required=True);p.add_argument("--flux",required=True);p.add_argument("--bulk",required=True);args=p.parse_args()
    rule=load(OUT/"decision-freeze.json");r=rule["choices"]["features"]
    rows=[]
    camera=load(Path(args.camera)/"runtime-manifest.json")
    for x in camera["records"]:
        if x.get("kind")=="ORIGINAL" and x.get("role")=="DEVELOPMENT_NATIVE_CAMERA":
            rows.append({"sampleId":x["sampleId"],"group":"CSAFE_CONSUMED","sourceFamilyId":x["sourceFamilyId"],"sha256":x["sourceSha256"],"root":"camera","relativePath":x["relativePath"],"rights":"INHERITED_CSAFE_CC_BY_4_EVALUATION"})
    src=load(ROOT/"research/wp007j-r1/representation-cohort-freeze.json")["records"]
    for x in sorted([x for x in src if x["rootKey"]=="CLOUDFLARE_FLUX1"],key=lambda x:x["sampleId"])[:10]:
        rows.append({"sampleId":x["sampleId"],"group":"CLOUDFLARE_FLUX1_CONSUMED","sourceFamilyId":x["sourceFamilyId"],"sha256":x["sha256"],"root":"flux","relativePath":x["relativePath"],"rights":"INHERITED_ALREADY_CONSUMED_RESEARCH_EVALUATION"})
    frozen={"role":"DIAGNOSTIC_ONLY_NO_TUNING","rows":rows,"ruleHash":rule["freezeHash"],"selection":"All36 consumed L development CSAFE originals; first10 registered consumed CloudflareFLUX1 IDs; no feature or SAFE-score selection","conditions":["ORIGINAL","JPEG95","RESIZE75"],"createdUnix":time.time()}
    frozen["freezeHash"]=digest(frozen)
    save(OUT/"diagnostic-cohort-freeze.json",frozen)
    output=[];start=time.time()
    for row in rows:
        if resources()["availableRamBytes"]<4*1024**3:raise RuntimeError("RAM_SAFETY_STOP")
        root=args.camera if row["root"]=="camera" else args.flux
        path=allowed(root,row["relativePath"],row["sourceFamilyId"])
        if filehash(path)!=row["sha256"]:raise ValueError("DIAGNOSTIC_HASH_MISMATCH")
        with Image.open(path) as im:
            x=round((im.width-256)/2);y=round((im.height-256)/2)
            arr=np.asarray(im.crop((x,y,x+256,y+256)).convert("RGB")).copy()
        for c in frozen["conditions"]:
            a,facts=transform(arr,c,None);feat,null,base=measure(a)
            s=None if feat[r["key"]] is None else abs(feat[r["key"]])
            output.append({"sampleId":row["sampleId"],"sourceFamilyId":row["sourceFamilyId"],"group":row["group"],"condition":c,"score":s,"high":s is not None and s>r["threshold"],"features":feat,"spatialNull":null,"codec":facts,"safeComparison":"NOT_RUN_IN_DIAGNOSTIC_MEMORY_BUDGET; historical domain gap unchanged"})
    save(Path(args.bulk)/"diagnostic-rows.json",output)
    summary={}
    for group in sorted({x["group"] for x in output}):
        summary[group]={}
        for c in frozen["conditions"]:
            part=[x for x in output if x["group"]==group and x["condition"]==c];v=[x["score"] for x in part if x["score"] is not None]
            summary[group][c]={"n":len(part),"sourceFamilies":len({x["sourceFamilyId"] for x in part}),"high":sum(x["high"] for x in part),"median":float(np.median(v)),"min":float(min(v)),"max":float(max(v))}
    save(OUT/"diagnostic-results.json",{"results":summary,"rowsHash":filehash(Path(args.bulk)/"diagnostic-rows.json"),"cohortHash":frozen["freezeHash"],"codeHash":filehash(__file__),"startUnix":start,"endUnix":time.time(),"command":"python scripts/authenticity/wp007m_diagnostic.py --camera <CONSUMED_WP007L> --flux <CONSUMED_FLUX1> --bulk <EXTERNAL_WP007M>","tuning":False,"freshConfirmation":False,"flux2Access":0})
    print(summary)


if __name__=="__main__":main()
