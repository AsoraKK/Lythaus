"""Split-pass frozen extraction with parent-atomic caches and total arm budgets."""
import argparse
import json
import os
import subprocess
import time
from pathlib import Path
import numpy as np
import torch
from PIL import Image, ImageOps, JpegImagePlugin
from wp007n_core import REPO, OUT, RUNTIME, canonical, digest, file_hash, array_hash, save_json, guard, configure, load_model, transform_for, controlled, response, preprocessing_contract
from wp007n_freeze import safe_path, validate_roles, rank
from wp007n_guards import ForwardBudget, execution_signature, validate_calibrations, validate_cache, derived_admission


def read(path):
    return json.loads(Path(path).read_text())


def freezes():
    co=read(OUT/"cohort-freeze.json")
    bare=dict(co);h=bare.pop("freezeHash")
    if digest(bare)!=h:
        raise RuntimeError("COHORT_CHANGED")
    protocol=read(OUT/"protocol.json")
    seal=read(OUT/"protocol-hash.json")
    if digest(protocol)!=seal["canonicalProtocolHash"] or protocol["cohortHash"]!=h:
        raise RuntimeError("PROTOCOL_CHANGED")
    validate_roles(co["rows"])
    execution_signature()
    return co,protocol,seal


def nuisance(image,facts,source_format):
    x=np.asarray(image.resize((224,224),Image.Resampling.BILINEAR),dtype=np.float64)/255
    gray=x.mean(2)
    dqt=facts.get("dqt")
    quant=float(np.mean([v for table in dqt.values() for v in table])) if dqt else 0.
    sharp=float(np.mean(np.diff(gray,axis=0)**2)+np.mean(np.diff(gray,axis=1)**2))
    return [float(np.log(image.width)),float(np.log(image.height)),image.width/image.height,float(source_format=="JPEG" or "jpeg" in facts["condition"]),quant,float(gray.std()),sharp,float(np.mean((x<=0.01)|(x>=.99))),*x.mean((0,1)).tolist()]


def requests(row,arm,matched):
    conditions=row["conditions"]
    if arm=="A" and row["role"] in ("FIT","DEV"):
        conditions=["original"]
    result=[(c,"reference") for c in conditions]
    if row["sampleId"] in matched:
        result += [(c,"matched256") for c in ("original","jpeg75")]
    return result


def run(arm,roles,limit=None):
    configure()
    co,protocol,seal=freezes()
    signature=execution_signature()
    if not roles or not set(roles).issubset({"FIT","DEV","CALIBRATION","EVAL_N","HISTORICAL_CHALLENGE"}):
        raise ValueError("UNDECLARED_ROLE")
    scientific_eval=bool(set(roles)&{"EVAL_N","HISTORICAL_CHALLENGE"})
    if scientific_eval:
        validate_calibrations(co,seal["canonicalProtocolHash"])
    matched=set()
    for kind in ("PHOTO_CSAFE","PHOTO_UNSPLASH","Seedream-4","SD-3.5-Large"):
        eligible=[r for r in co["rows"] if r["role"] in ("EVAL_N","HISTORICAL_CHALLENGE") and (r["kind"]==kind or r["generatorFamily"]==kind)]
        matched.add(rank(eligible)[0]["sampleId"])
    rows=[r for r in co["rows"] if r["role"] in roles]
    if limit:
        rows=rows[:limit]
    dest=RUNTIME/"features"/arm
    dest.mkdir(parents=True,exist_ok=True)
    budget=ForwardBudget(arm,protocol)
    old_forwards=budget.initial_forwards
    start=time.time()
    forwards=0;cached=0;new=0;minimum=10**20;failure=None
    model=None;raw_model=None
    try:
        raw_model,identity=load_model(arm)
        model=budget.wrap(raw_model)
        for parent in rows:
            wanted=requests(parent,arm,matched)
            key=digest({"cohort":co["freezeHash"],"model":identity["checkpointSha256"],"preprocess":identity["preprocessing"],"input":parent["sha256"],"requests":wanted,"protocol":seal["canonicalProtocolHash"],"executionSignature":signature})
            metadata=dest/(key+".json")
            arrays=dest/(key+".npz")
            if not metadata.exists() and parent["role"] in ("FIT","DEV","CALIBRATION"):
                prior=[p for p in dest.glob("*.json") if read(p).get("sampleId")==parent["sampleId"]]
                if len(prior)>1:
                    raise RuntimeError("AMBIGUOUS_PARENT_CACHE")
                if prior:
                    validate_cache(prior[0],parent,wanted,signature)
                    cached+=1
                    continue
            if metadata.exists():
                existing=validate_cache(metadata,parent,wanted,signature)
                if existing["cacheKey"]!=key:
                    raise RuntimeError("CACHE_CORRUPTION")
                cached+=1
                continue
            state=guard();minimum=min(minimum,state["availableBytes"])
            path=safe_path(parent)
            if file_hash(path)!=parent["sha256"]:
                raise RuntimeError("SOURCE_CHANGED")
            with Image.open(path) as source:
                fmt=source.format
                current_dqt=getattr(source,"quantization",None)
                source_sampling=JpegImagePlugin.get_sampling(source) if fmt=="JPEG" else None
                metadata_state={"exifPresent":bool(source.info.get("exif")),"iccPresent":bool(source.info.get("icc_profile")),"orientationHandling":"EXIF_TRANSPOSE_NO_RAW_METADATA_PERSISTED"}
                rgb=ImageOps.exif_transpose(source).convert("RGB")
                rgb.load()
            if array_hash(np.asarray(rgb))!=parent["decodedRgbSha256"]:
                raise RuntimeError("DECODE_CHANGED")
            records=[];features=[];local_cache={}
            for condition,view in wanted:
                guard()
                image,facts=controlled(rgb,condition)
                if condition=="original":
                    facts.update(dqt=current_dqt,sampling=source_sampling,codec="SOURCE_AS_SUPPLIED")
                if view=="matched256":
                    image=image.resize((256,256),Image.Resampling.BILINEAR)
                tensor=transform_for(arm)(image).unsqueeze(0)
                tensor_hash=array_hash(tensor.numpy())
                t0=time.perf_counter()
                needs_response=arm=="A" and parent["role"] not in ("FIT","DEV")
                reuse=tensor_hash in local_cache
                if reuse:
                    feature,measurements=local_cache[tensor_hash]
                else:
                    with torch.inference_mode():
                        if needs_response:
                            clean,measurements=response(model,tensor,tensor_hash,3)
                        else:
                            clean=model(tensor);measurements=[]
                    if clean.shape!=(1,1024) or not bool(torch.isfinite(clean).all()):
                        raise RuntimeError("INVALID_FEATURE_OUTPUT")
                    feature=clean[0].numpy().copy()
                    local_cache[tensor_hash]=(feature,measurements)
                elapsed=time.perf_counter()-t0
                features.append(feature)
                records.append({"sampleId":parent["sampleId"],"sourceFamilyId":parent["sourceFamilyId"],"role":parent["role"],"kind":parent["kind"],"label":parent["label"],"generatorFamily":parent["generatorFamily"],"condition":condition,"view":view,"sourceSha256":parent["sha256"],"scientificViewRgbHash":array_hash(np.asarray(image)),"tensorSha256":tensor_hash,"featureSha256":array_hash(feature),"featureIndex":len(features)-1,"responses":measurements,"A1":measurements[0]["response"] if measurements else None,"A2":float(np.mean([r["response"] for r in measurements])) if measurements else None,"responseSpread":float(np.ptp([r["response"] for r in measurements])) if measurements else None,"facts":facts,"sourceMetadataState":metadata_state,"nuisance":nuisance(image,facts,fmt),"tensorCacheReuse":reuse,"inferenceSeconds":elapsed,"applicability":"RESEARCH_ONLY_UNQUALIFIED","missingness":None,"failureState":None,"productionAuthority":False})
            derived_admission(4000000)
            temporary=arrays.with_suffix(".partial")
            with temporary.open("wb") as stream:
                np.savez(stream,features=np.stack(features).astype(np.float32))
            os.replace(temporary,arrays)
            save_json(metadata,{"cacheKey":key,"arm":arm,"sampleId":parent["sampleId"],"executionSignature":signature,"arraySha256":file_hash(arrays),"arrayFile":arrays.name,"records":records,"identity":identity,"cohortHash":co["freezeHash"],"protocolHash":seal["canonicalProtocolHash"],"extractCodeHash":file_hash(__file__),"coreCodeHash":file_hash(Path(__file__).with_name("wp007n_core.py")),"sourceHash":parent["sha256"]})
            forwards=budget.data["forwards"]-old_forwards
            new+=1
            print(json.dumps({"arm":arm,"roles":roles,"newParents":new,"cachedParents":cached,"forwards":forwards,"elapsedSeconds":round(time.time()-start,2)}),flush=True)
    except Exception as exc:
        failure=type(exc).__name__+":"+str(exc)
        raise
    finally:
        del model,raw_model
        elapsed=time.time()-start
        record={"startedUnix":start,"endedUnix":time.time(),"seconds":elapsed,"forwards":forwards,"roles":roles,"newParents":new,"cachedParents":cached,"failure":failure,"minimumAvailableBytes":None if minimum==10**20 else minimum,"codeCommit":subprocess.check_output(["git","rev-parse","HEAD"],cwd=REPO,text=True).strip(),"codeHash":file_hash(__file__),"protocolHash":seal["canonicalProtocolHash"],"cohortHash":co["freezeHash"],"command":f"python wp007n_extract.py {arm} --roles {','.join(roles)}"}
        budget.finish(record)


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("arm",choices=["A","B"])
    parser.add_argument("--roles",required=True)
    parser.add_argument("--limit",type=int)
    args=parser.parse_args()
    run(args.arm,args.roles.split(","),args.limit)
