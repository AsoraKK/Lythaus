"""Frozen SAFE reference on exact N views; no inference authority is granted."""
import json
import sys
import time
import tempfile
import subprocess
from pathlib import Path
import numpy as np
import torch
from PIL import Image,ImageOps
from torchvision import transforms as T
from wp007n_core import OUT,REPO,RUNTIME,SAFE_HASH,SAFE_THRESHOLD,configure,guard,file_hash,array_hash,controlled,save_json,digest
from wp007n_freeze import safe_path
from wp007n_guards import expected_requests
from wp007jr1_safe_representation_probe import load_model


def main():
    configure();guard();start=time.time()
    root=Path(tempfile.gettempdir())/'wp007g-SAFE'
    checkpoint=root/'checkpoint/checkpoint-best.pth'
    commit=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
    if commit!='4e998724651b227def64f5be0cd60c0aa1552c35' or file_hash(checkpoint)!=SAFE_HASH:raise ValueError('SAFE_IDENTITY')
    co=json.loads((OUT/'cohort-freeze.json').read_text())
    path=OUT/'safe-reference-rows.json'
    existing=json.loads(path.read_text()) if path.exists() else {}
    if existing and (existing['codeHash']!=file_hash(__file__) or existing['cohortHash']!=co['freezeHash']):raise ValueError('STALE_SAFE_CACHE')
    rows=existing.get('rows',[]);done={r['sampleId'] for r in rows}
    model=load_model(root,checkpoint);initialized=time.time()-start
    transform=T.Compose([T.CenterCrop((256,256)),T.ToTensor()])
    initialParameters={k:array_hash(v.detach().numpy()) for k,v in model.state_dict().items()}
    minimum=guard()['availableBytes'];failure=None
    try:
        for parent in co['rows']:
            if parent['role'] not in ('EVAL_N','HISTORICAL_CHALLENGE') or parent['sampleId'] in done:continue
            minimum=min(minimum,guard()['availableBytes'])
            source=safe_path(parent)
            if file_hash(source)!=parent['sha256']:raise ValueError('SAFE_SOURCE_CHANGED')
            with Image.open(source) as im:rgb=ImageOps.exif_transpose(im).convert('RGB')
            if array_hash(np.asarray(rgb))!=parent['decodedRgbSha256']:raise ValueError('SAFE_DECODE_CHANGED')
            local=[]
            for condition,view in expected_requests(parent,'A',co):
                guard()
                image,facts=controlled(rgb,condition)
                if view=='matched256':image=image.resize((256,256),Image.Resampling.BILINEAR)
                tensor=transform(image).unsqueeze(0);t=time.perf_counter()
                with torch.inference_mode():logits=model(tensor)
                if logits.shape!=(1,2) or not torch.isfinite(logits).all():raise ValueError('SAFE_OUTPUT_INVALID')
                score=float(logits.softmax(1)[0,1])
                local.append({k:parent[k] for k in ('sampleId','sourceFamilyId','role','label','kind','generatorFamily')}|{'condition':condition,'view':view,'sourceSha256':parent['sha256'],'scientificViewRgbHash':array_hash(np.asarray(image)),'tensorSha256':array_hash(tensor.numpy()),'score':score,'threshold':SAFE_THRESHOLD,'thresholdPass':score>=SAFE_THRESHOLD,'comparison':'GREATER_OR_EQUAL_FROZEN_HISTORICAL','seconds':time.perf_counter()-t,'applicability':'RAW_EXPERIMENTAL_REFERENCE_NOT_AUTHORIZED_EVIDENCE','missingness':None})
            rows.extend(local)
            save_json(path,{'rows':rows,'cohortHash':co['freezeHash'],'codeHash':file_hash(__file__),'checkpointHash':SAFE_HASH,'upstream':commit,'preprocessing':'EXIF-transposed RGB; official center256 (padding if needed), ToTensor; no normalization','productionAuthorization':'NO'})
            print(json.dumps({'SAFEparents':len({r['sampleId'] for r in rows}),'rows':len(rows)}),flush=True)
        after={k:array_hash(v.detach().numpy()) for k,v in model.state_dict().items()}
        if initialParameters!=after or file_hash(checkpoint)!=SAFE_HASH:raise ValueError('SAFE_CHANGED')
    except Exception as exc:
        failure=type(exc).__name__+':'+str(exc);raise
    finally:
        save_json(OUT/'safe-reference-run.json',{'start':start,'end':time.time(),'seconds':time.time()-start,'initializationSeconds':initialized,'minimumAvailableBytes':minimum,'failure':failure,'rows':len(rows),'checkpointHash':SAFE_HASH,'threshold':SAFE_THRESHOLD,'parameterStateHash':digest(initialParameters),'codeHash':file_hash(__file__),'command':'python scripts/authenticity/wp007n_safe_reference.py','reusedHistoricalScores':False})


if __name__=='__main__':main()
