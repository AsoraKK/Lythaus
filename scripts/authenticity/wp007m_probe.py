"""Research-only spatial cross-scale dependence; no authorship verdict."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import time
import ctypes
from collections import Counter

import numpy as np
from PIL import Image
from scipy.stats import rankdata
from sklearn.metrics import roc_auc_score
from wp007k_codec_specialist import measure as baseline_measure

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "research/wp007m"
SAFE_HASH = "b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e"
SAFE_THRESHOLD = 0.5864923000335693
CANDIDATES = ["dependency12", "dependency23", "dependencyDecay", "tailExcess12"]
CONDITIONS = ["ORIGINAL", "JPEG95", "JPEG85", "JPEG75", "RESIZE75", "RESIZE75_JPEG95", "SHARP95", "PNG_STRIP"]
DENIED = ("flux2", "flux.2", "flux_2", "flux-2", "reserve", "sealed", "future", "lge")


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def filehash(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for b in iter(lambda: f.read(1024 * 1024), b""):
            h.update(b)
    return h.hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def resources():
    class Memory(ctypes.Structure):
        _fields_=[("length",ctypes.c_ulong),("load",ctypes.c_ulong)]+[(n,ctypes.c_ulonglong) for n in ["total","available","pageTotal","pageAvailable","virtualTotal","virtualAvailable","extended"]]
    m=Memory();m.length=ctypes.sizeof(m)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)):raise RuntimeError("MEMORY_TELEMETRY_FAILED")
    return {"availableRamBytes":m.available,"freeDiskBytes":shutil.disk_usage(ROOT).free}


def save(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n", encoding="utf-8")


def allowed(root, relative, identity=""):
    if any(x in (relative + " " + identity).lower() for x in DENIED):
        raise ValueError("RESERVE_ACCESS_DENIED")
    root = Path(root).resolve()
    p = (root / relative).resolve()
    if not p.is_relative_to(root) or not relative or Path(relative).is_absolute():
        raise ValueError("PATH_ESCAPE")
    return p


def haar(a):
    if a.ndim != 2 or min(a.shape) < 2 or any(n % 2 for n in a.shape):
        raise ValueError("HAAR_SHAPE")
    x,y,z,w = a[::2,::2], a[::2,1::2], a[1::2,::2], a[1::2,1::2]
    return (x+y+z+w)/2, [(x-y+z-w)/2, (x+y-z-w)/2, (x-y-z+w)/2]


def corr(x, y):
    x,y=np.asarray(x).ravel(),np.asarray(y).ravel()
    if x.size != y.size or not np.isfinite(x).all() or not np.isfinite(y).all():
        raise ValueError("INVALID_CORRELATION_INPUT")
    x,y=x-x.mean(),y-y.mean()
    d=np.sqrt(np.dot(x,x)*np.dot(y,y))
    return float(np.dot(x,y)/d) if d > 1e-15 else None


def dependence(fine, coarse, shift=False):
    cs,ts=[],[]
    for f,c in zip(fine,coarse):
        if shift:
            c=np.roll(c,(c.shape[0]//3,c.shape[1]//5),(0,1))
        parent=np.repeat(np.repeat(np.abs(c),2,axis=0),2,axis=1)
        child=np.abs(f)
        a,b=rankdata(child).reshape(child.shape),rankdata(parent).reshape(parent.shape)
        v=corr(a,b)
        if v is not None:
            cs.append(v)
            hi,lo=a>np.quantile(a,.75),b>np.quantile(b,.75)
            ts.append(float(np.mean(hi*lo)-np.mean(hi)*np.mean(lo)))
    return (float(np.mean(cs)) if cs else None, float(np.mean(ts)) if ts else None)


def measure(rgb):
    if rgb.shape != (256,256,3) or not np.isfinite(rgb).all():
        raise ValueError("INVALID_MEASUREMENT_SHAPE_OR_VALUES")
    a=np.dot(rgb.astype(float)/255,[.299,.587,.114])
    low1,b1=haar(a);low2,b2=haar(low1);_,b3=haar(low2)
    d12,t=dependence(b1,b2);d23,_=dependence(b2,b3)
    n12,nt=dependence(b1,b2,True);n23,_=dependence(b2,b3,True)
    out={"dependency12":d12,"dependency23":d23,"dependencyDecay":None if d12 is None or d23 is None else d12-d23,"tailExcess12":t}
    null={"dependency12":n12,"dependency23":n23,"dependencyDecay":None if n12 is None or n23 is None else n12-n23,"tailExcess12":nt}
    base=baseline_measure(a)
    base["haarMarginalEnergyRatio"]=float(np.mean(np.square(b1))/(np.mean(np.square(b2))+1e-12))
    return out, null, base


def wilson(k,n):
    if not n:return {"k":k,"n":n,"rate":None,"ci95":None}
    z=1.959963984540054;p=k/n;d=1+z*z/n
    c=(p+z*z/(2*n))/d;h=z*np.sqrt(p*(1-p)/n+z*z/(4*n*n))/d
    return {"k":k,"n":n,"rate":p,"ci95":[max(0,float(c-h)),min(1,float(c+h))]}


def validate_roles(rows):
    for key in ["sampleId","sha256","sourceFamilyId","splitGroup"]:
        seen={}
        for r in rows:
            if r["role"] == "DIAGNOSTIC":continue
            v=r[key]
            if v in seen and seen[v] != r["role"]:raise ValueError("SPLIT_LEAKAGE:"+key)
            seen[v]=r["role"]
    if len({r["sampleId"] for r in rows}) != len(rows):raise ValueError("DUPLICATE_ID")
    if len({r["sha256"] for r in rows}) != len(rows):raise ValueError("DUPLICATE_BYTES")


def freeze(args):
    media=Path(args.media);rows=[];excluded=[]
    negatives=load(ROOT/"research/wp007i/negative-data-freeze.json")["records"]
    syn=load(ROOT/"research/wp007i/fresh-synthetic-freeze.json")["records"]
    dev_hard={"CGI","CHART","UI_SCREENSHOT","PROCEDURAL_PATTERN"}
    selected=[]
    for role,target in [("DISCOVERY",40),("HELDOUT",60)]:
        pool=[r for r in negatives if r["sourceSubtype"]=="CAMERA_NATIVE" and (int(digest(r["cameraDeviceFamily"]),16)%2==0)==(role=="DISCOVERY")]
        selected += [(r,role,"PHOTO","camera-model:"+r["cameraDeviceFamily"]) for r in sorted(pool,key=lambda r:r["selectionHash"])[:target]]
    for role,categories in [("DISCOVERY",dev_hard),("HELDOUT",set(r["sourceSubtype"] for r in negatives)-dev_hard-{"CAMERA_NATIVE"})]:
        for cat in sorted(categories):
            pool=sorted([r for r in negatives if r["sourceSubtype"]==cat],key=lambda r:r["selectionHash"])
            selected += [(r,role,"HARD","procedural-template:"+cat) for r in pool[:5]]
    dev_families={"SD-3.5-Large","Gemini-2.0-Flash"}
    dev_prompts={r["sampleId"].split("__")[-1].rsplit("-",1)[0] for r in syn if r["generatorFamily"] in dev_families}
    for r in syn:
        role="DISCOVERY" if r["generatorFamily"] in dev_families else "HELDOUT"
        prompt=r["sampleId"].split("__")[-1].rsplit("-",1)[0]
        if role=="HELDOUT" and prompt in dev_prompts:
            excluded.append({"sampleId":r["sampleId"],"reason":"CROSS_ROLE_PROMPT_OVERLAP"});continue
        selected.append((r,role,"SYNTHETIC","generator:"+r["generatorFamily"]))
    fingerprints=[]
    for r,role,kind,group in selected:
        rights=r.get("sourceRights",r.get("rightsClass"))
        if not rights:raise ValueError("RIGHTS_MISSING")
        p=allowed(media,r["localRelativePath"],r["sourceFamilyId"])
        if not p.is_file():raise ValueError("APPROVED_FILE_UNAVAILABLE:"+r["sampleId"])
        h=filehash(p)
        if r.get("lfsSha256") and h!=r["lfsSha256"]:raise ValueError("HASH_MISMATCH")
        with Image.open(p) as im:
            w,hh=im.size;fmt=im.format
            thumb=np.asarray(im.convert("L").resize((9,8)),dtype=float)
            dh=(thumb[:,1:]>thumb[:,:-1]).ravel()
        if min(w,hh)<256:
            excluded.append({"sampleId":r["sampleId"],"reason":"TOO_SMALL"});continue
        dup=next((q for q,v in fingerprints if q["role"]!=role and np.count_nonzero(v!=dh)<=4),None)
        if dup:
            excluded.append({"sampleId":r["sampleId"],"reason":"CROSS_ROLE_NEAR_DUPLICATE_DHASH_LE4","with":dup["sampleId"]});continue
        row={"sampleId":r["sampleId"],"sourceFamilyId":r["sourceFamilyId"],"splitGroup":group,"role":role,"kind":kind,"label":r["label"],"generatorFamily":r.get("generatorFamily"),"subtype":r["sourceSubtype"],"sha256":h,"relativePath":r["localRelativePath"],"rootKey":"WP007I_MEDIA","rights":rights,"use":"PRIVATE_EVALUATION_NO_TRAINING","historicalExposure":"CONSUMED_BEFORE_WP007M","width":w,"height":hh,"format":fmt,"sourceDataset":r["sourceDataset"]}
        rows.append(row);fingerprints.append((row,dh))
    validate_roles(rows)
    payload={"schemaVersion":"wp007m-cohort-v1","rows":rows,"exclusions":excluded,"scoreBlind":True,"trainingAllowed":False,"selectionCodeHash":filehash(__file__),"planHash":filehash(OUT/"experiment-plan.md"),"counts":dict(Counter(r["role"]+":"+r["kind"] for r in rows)),"flux2Access":0}
    payload["freezeHash"]=digest(payload)
    save(OUT/"cohort-freeze.json",payload)
    print(json.dumps({"counts":payload["counts"],"excluded":len(excluded),"freezeHash":payload["freezeHash"]}),flush=True)


def transform(rgb,condition,sharp):
    im=Image.fromarray(rgb)
    if condition.startswith("RESIZE75"):
        im=im.resize((192,192),Image.Resampling.BICUBIC).resize((256,256),Image.Resampling.BICUBIC)
    buf=io.BytesIO();facts={}
    if "JPEG" in condition:
        q=int(condition[-2:]);im.save(buf,format="JPEG",quality=q,subsampling=2)
    elif condition=="SHARP95":
        p=subprocess.run(["node",str(ROOT/"scripts/authenticity/wp007m_sharp.cjs"),str(sharp)],input=rgb.tobytes(),capture_output=True,check=True)
        buf=io.BytesIO(p.stdout)
    else:im.save(buf,format="PNG")
    data=buf.getvalue()
    with Image.open(io.BytesIO(data)) as dec:
        facts={"format":dec.format,"dqt":getattr(dec,"quantization",None),"sampling":getattr(dec,"layer",None)}
        arr=np.asarray(dec.convert("RGB")).copy()
    facts["encodedHash"]=hashlib.sha256(data).hexdigest();facts["pixelHash"]=hashlib.sha256(arr.tobytes()).hexdigest()
    return arr,facts


def extract(args):
    import PIL,scipy,sklearn,torch
    from wp007jr1_safe_representation_probe import load_model
    cohort=load(OUT/"cohort-freeze.json");h=cohort.pop("freezeHash")
    if digest(cohort)!=h:raise ValueError("COHORT_MUTATED")
    if filehash(OUT/"experiment-plan.md")!=cohort["planHash"]:raise ValueError("PLAN_MUTATED")
    if args.role!="DISCOVERY" and not (OUT/"decision-freeze.json").is_file():raise ValueError("RULE_NOT_FROZEN")
    if shutil.disk_usage(ROOT).free < 1024**3:raise ValueError("DISK_SAFETY_STOP")
    torch.set_num_threads(2);torch.set_num_interop_threads(1);torch.use_deterministic_algorithms(True)
    model=load_model(Path(args.safe),Path(args.safe)/"checkpoint/checkpoint-best.pth")
    bulk=Path(args.bulk);bulk.mkdir(parents=True,exist_ok=True)
    dest=bulk/(args.role.lower()+"-rows.jsonl")
    existing=[json.loads(s) for s in dest.read_text().splitlines()] if dest.exists() else []
    codehash=filehash(__file__)
    if any(r["codeHash"]!=codehash or r["cohortHash"]!=h for r in existing):raise ValueError("RESUME_VERSION_MISMATCH")
    done={(r["sampleId"],r["condition"]) for r in existing}
    start=time.time();fail=0;timings=[];resource_samples=[]
    for i,r in enumerate([r for r in cohort["rows"] if r["role"]==args.role]):
        state=resources();resource_samples.append(state)
        if state["availableRamBytes"]<4*1024**3:raise RuntimeError("FREE_RAM_BELOW_4GIB_RESUMABLE_STOP")
        if state["freeDiskBytes"]<1024**3:raise RuntimeError("DISK_SAFETY_STOP")
        p=allowed(args.media,r["relativePath"],r["sourceFamilyId"])
        if filehash(p)!=r["sha256"]:raise ValueError("SOURCE_CHANGED")
        with Image.open(p) as im:
            im=im.convert("RGB");w,hh=im.size;x=round((w-256)/2);y=round((hh-256)/2)
            rgb=np.asarray(im.crop((x,y,x+256,y+256))).copy()
        for c in CONDITIONS:
            if (r["sampleId"],c) in done:continue
            began=time.perf_counter()
            arr,facts=transform(rgb,c,args.sharp)
            t=time.perf_counter();feat,null,base=measure(arr);ms=(time.perf_counter()-t)*1000
            tensor=torch.from_numpy(arr.copy()).permute(2,0,1).float().div(255).unsqueeze(0)
            t=time.perf_counter()
            with torch.inference_mode():score=float(torch.softmax(model(tensor),dim=1)[0,1])
            safems=(time.perf_counter()-t)*1000
            if not np.isfinite(score):raise ValueError("SAFE_INVALID")
            row={"sampleId":r["sampleId"],"condition":c,"cohortHash":h,"codeHash":codehash,"inputSha256":r["sha256"],"features":feat,"spatialNull":null,"baseline":base,"safeScore":score,"safeThreshold":SAFE_THRESHOLD,"safeHash":SAFE_HASH,"codec":facts,"featureMs":ms,"safeMs":safems,"totalMs":(time.perf_counter()-began)*1000,"missingFeatures":[k for k,v in feat.items() if v is None],"productionAuthorization":"NO"}
            with dest.open("a",encoding="utf-8") as f:f.write(json.dumps(row,allow_nan=False)+"\n")
            timings.append(ms)
        if i%10==0:print(args.role+" parents="+str(i+1),flush=True)
    allrows=[json.loads(s) for s in dest.read_text().splitlines()]
    save(OUT/(args.role.lower()+"-resources.json"),resource_samples)
    env={"python":platform.python_version(),"numpy":np.__version__,"scipy":scipy.__version__,"pillow":PIL.__version__,"sklearn":sklearn.__version__,"torch":torch.__version__,"threads":2,"workers":1,"safeHash":filehash(Path(args.safe)/"checkpoint/checkpoint-best.pth")}
    save(OUT/(args.role.lower()+"-run.json"),{"cohortHash":h,"codeHash":codehash,"codeCommit":subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip(),"environment":env,"environmentHash":digest(env),"command":["python","scripts/authenticity/wp007m_probe.py","extract","--role",args.role,"--media","<APPROVED_WP007I_MEDIA>","--bulk","<EXTERNAL_WP007M>","--safe","<PINNED_SAFE>","--sharp","<EXISTING_SHARP>"],"startUnix":start,"endUnix":time.time(),"rows":len(allrows),"failures":fail,"outputHash":filehash(dest),"outputLogicalPath":"external/wp007m/"+dest.name,"featureMs":{"p50":float(np.median(timings)) if timings else None,"p95":float(np.quantile(timings,.95)) if timings else None},"flux2Access":0,"providerCalls":0,"seed":0})


def joined(bulk,role):
    meta={r["sampleId"]:r for r in load(OUT/"cohort-freeze.json")["rows"]}
    return [{**meta[r["sampleId"]],**r} for r in map(json.loads,(Path(bulk)/(role.lower()+"-rows.jsonl")).read_text().splitlines())]


def select(args):
    if (OUT/"decision-freeze.json").exists():raise ValueError("CONFIRM_RULE_IMMUTABLE")
    rows=joined(args.bulk,"DISCOVERY");choices={}
    for group,key,absolute in [("features","dependencyDecay",True),("baseline","dctDcStd",False)]:
        neg=[abs(r[group][key]) if absolute else r[group][key] for r in rows if not r["label"] and r[group][key] is not None]
        choices[group]={"key":key,"absolute":absolute,"direction":1,"threshold":float(max(neg)),"comparison":"STRICT_GREATER","missing":"NO_EVIDENCE","selection":"PRESELECTED_NO_SYNTHETIC_LABEL_SELECTION"}
    data={"cohortHash":load(OUT/"cohort-freeze.json")["freezeHash"],"discoveryRowsHash":filehash(Path(args.bulk)/"discovery-rows.jsonl"),"choices":choices,"training":False,"status":"EXPLORATORY_REFERENCE_RULE_NOT_QUALIFIED","timestamp":time.time()}
    data["freezeHash"]=digest(data);save(OUT/"decision-freeze.json",data)
    print(json.dumps(choices),flush=True)


def main():
    p=argparse.ArgumentParser();p.add_argument("command",choices=["freeze","extract","select"])
    p.add_argument("--media");p.add_argument("--bulk");p.add_argument("--role",choices=["DISCOVERY","HELDOUT"]);p.add_argument("--safe");p.add_argument("--sharp")
    a=p.parse_args();{"freeze":freeze,"extract":extract,"select":select}[a.command](a)


if __name__=="__main__":main()
