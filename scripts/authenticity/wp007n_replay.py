"""Explicit legacy-cache admission and real-parent replay, never silent reuse."""
import json
import time
from pathlib import Path
import numpy as np
import torch
from PIL import Image,ImageOps
from wp007n_core import OUT,REPO,RUNTIME,configure,load_model,transform_for,response,array_hash,file_hash,save_json,noise_for,guard
from wp007n_freeze import safe_path,rank
from wp007n_guards import ForwardBudget,execution_signature,validate_cache,expected_requests


def main():
    configure()
    co=json.loads((OUT/"cohort-freeze.json").read_text())
    protocol=json.loads((OUT/"protocol.json").read_text())
    legacy=RUNTIME/"legacy-sources"
    expected={"wp007n_core.py":"db651c2548950842d64a30f1ceb9d3c457f0274549077a9c3590f9113811260c","wp007n_extract.py":"d2dfecb6db05e5ccb70e4de57c6a045848333885d7df099142ebda886678454e"}
    for name,h in expected.items():
        if file_hash(legacy/name)!=h:raise ValueError("LEGACY_SOURCE_CHANGED")
    paths=list((RUNTIME/"features/A").glob("*.json"))
    receipts={}
    for path in paths:
        x=json.loads(path.read_text())
        if x["coreCodeHash"]!=expected["wp007n_core.py"] or x["extractCodeHash"]!=expected["wp007n_extract.py"]:
            raise ValueError("UNEXPECTED_PREAUDIT_SOURCE")
        receipts[x["sampleId"]]={"metadataFile":path.name,"metadataSha256":file_hash(path),"arraySha256":x["arraySha256"]}
    allowed={r["sampleId"] for r in co["rows"] if r["role"] in ("FIT","DEV","CALIBRATION")}
    if set(receipts)!=allowed:raise ValueError("LEGACY_MEMBERSHIP")
    cert={"schemaVersion":"wp007n-legacy-certificate-v1","coreCodeHash":expected["wp007n_core.py"],"extractCodeHash":expected["wp007n_extract.py"],"parents":receipts,"replayValidated":False,"reason":"Admission/accounting/finite checks hardened; arithmetic, transformations, weights, seeds, cohort and protocol unchanged. No legacy EVAL cache permitted.","initialCompletedPass":"run-A.json first run:196 charged forwards,44 FIT/DEV/CAL parents,473.633seconds, no failures or interruption","legacySourceLocation":"external/wp007n/legacy-sources","cohortHash":co["freezeHash"]}
    save_json(OUT/"legacy-cache-certificate.json",cert)
    signature=execution_signature()
    for r in co["rows"]:
        if r["sampleId"] in receipts:
            validate_cache(RUNTIME/"features/A"/receipts[r["sampleId"]]["metadataFile"],r,expected_requests(r,"A",co),signature,True)
    budget=ForwardBudget("A",protocol)
    start=time.time();model=None;failure=None;results=[]
    try:
        model,_=load_model("A");wrapped=budget.wrap(model)
        chosen=rank([r for r in co["rows"] if r["role"]=="CALIBRATION"])[:4]
        tensors=[];clean_list=[];ids=[];noisy_list=[]
        for r in reversed(chosen):
            guard()
            with Image.open(safe_path(r)) as image:
                rgb=ImageOps.exif_transpose(image).convert("RGB")
            tensor=transform_for("A")(rgb).unsqueeze(0);ih=array_hash(tensor.numpy())
            item=json.loads((RUNTIME/"features/A"/receipts[r["sampleId"]]["metadataFile"]).read_text())
            previous=next(x for x in item["records"] if x["condition"]=="original")
            with np.load(RUNTIME/"features/A"/item["arrayFile"],allow_pickle=False) as data:
                old=data["features"][previous["featureIndex"]]
            clean,measurements=response(wrapped,tensor,ih,3)
            err=float(np.max(np.abs(old-clean[0].numpy())))
            response_error=max(abs(a["response"]-b["response"]) for a,b in zip(previous["responses"],measurements))
            if ih!=previous["tensorSha256"] or err>1e-6 or response_error>1e-6:
                raise ValueError("REPLAY_MISMATCH")
            results.append({"sampleId":r["sampleId"],"cleanMaxAbs":err,"responseMaxAbs":response_error,"tensorIdentical":True,"order":"REVERSED_FROZEN_PANEL"})
            tensors.append(tensor);clean_list.append(clean);ids.append(ih)
        guard()
        with torch.inference_mode():
            for _ in range(2):budget.before_forward()
            batched=model(torch.cat(tensors[:2]));budget.after_forward()
            clean_batch_error=float((batched-torch.cat(clean_list[:2])).abs().max())
            noise=torch.cat([noise_for(x,i,0) for x,i in zip(tensors[:2],ids[:2])])
            for _ in range(2):budget.before_forward()
            perturbed=model(torch.cat(tensors[:2])+.05*noise);budget.after_forward()
            sims=torch.nn.functional.cosine_similarity(batched,perturbed,dim=-1)
            expected_scores=[next(x for x in json.loads((RUNTIME/"features/A"/receipts[r["sampleId"]]["metadataFile"]).read_text())["records"] if x["condition"]=="original")["A1"] for r in list(reversed(chosen))[:2]]
            batch_response_error=float(np.max(np.abs((1-sims.numpy())-expected_scores)))
        if clean_batch_error>2e-5 or batch_response_error>2e-6:
            raise ValueError("BATCH_EQUIVALENCE_MISMATCH")
        cert.update(replayValidated=True,replayResults=results,cleanBatchMaxAbs=clean_batch_error,responseBatchMaxAbs=batch_response_error,batchScope="Two-image validation only; scientific batching remains one;4 image-forwards charged",validatedCacheParents=len(receipts),executionSignature=signature,codeHash=file_hash(__file__))
        save_json(OUT/"legacy-cache-certificate.json",cert)
        print(json.dumps({"replayedParents":4,"batchCleanError":clean_batch_error,"batchResponseError":batch_response_error,"allLegacyRecordsValidated":len(receipts)}),flush=True)
    except Exception as exc:
        failure=str(exc);raise
    finally:
        del model
        budget.finish({"startedUnix":start,"endedUnix":time.time(),"failure":failure,"roles":["CALIBRATION_REPLAY"],"codeHash":file_hash(__file__),"command":"python wp007n_replay.py"})


if __name__=="__main__":main()
