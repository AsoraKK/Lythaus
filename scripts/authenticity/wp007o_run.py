"""Incremental frozen PE extraction, one calibration transition, separate SAFE pass."""
import subprocess
from collections import Counter
import torch
from torchvision import transforms as T
from PIL import features as pillow_features
from wp007o_core import *
from wp007n_core import configure, load_model, transform_for, controlled, SAFE_HASH, SAFE_THRESHOLD


def state_hash(model):return digest({k:array_hash(v.detach().cpu().numpy()) for k,v in model.state_dict().items()})


def cache_path(parent,arm):return RUNTIME/'rows'/arm/(digest([parent['sampleId'],parent['sha256']])+'.json')


def cache_read(parent,arm,co,p):
    path=cache_path(parent,arm)
    if not path.exists():return None
    item=sealed(path)
    if item['cohortHash']!=co['freezeHash'] or item['protocolHash']!=p['freezeHash'] or item['sourceHash']!=parent['sha256'] or item['arm']!=arm:raise ValueError('STALE_EXTRACTION')
    if item['checkpointHash']!=(MODEL_HASH if arm=='PE' else SAFE_HASH) or item['headHash']!=(HEAD_HASH if arm=='PE' else None):raise ValueError('CACHE_MODEL_IDENTITY')
    if len(item['rows'])!=len(CONDITIONS) or {r['condition'] for r in item['rows']}!=set(CONDITIONS):raise ValueError('CACHE_CONDITIONS')
    for r in item['rows']:
        if r['sampleId']!=parent['sampleId'] or r['role']!=parent['role'] or r['label']!=parent['label'] or not math.isfinite(r['score']):raise ValueError('CACHE_ROW_IDENTITY')
        if any(r[k]!=parent[k] for k in ('sourceFamilyId','kind','generatorFamily')) or r['sourceHash']!=parent['sha256'] or r.get('missingness') is not None:raise ValueError('CACHE_SOURCE_IDENTITY')
    if arm=='PE' and (item['arrayFile']!=path.with_suffix('.npz').name or {r['featureIndex'] for r in item['rows']}!=set(range(len(CONDITIONS)))):raise ValueError('CACHE_FEATURE_IDENTITY')
    if arm=='PE' and file_hash(path.parent/item['arrayFile'])!=item['arrayHash']:raise ValueError('CACHED_FEATURE_CORRUPTION')
    return item


def nuisance(image,facts):
    small=image.copy();small.thumbnail((320,320),Image.Resampling.BILINEAR);a=np.asarray(small,dtype=np.float64)/255;g=a.mean(2)
    hi=a.max(2);lo=a.min(2)
    q=facts.get('dqt');qs=[v for t in q.values() for v in t] if q else []
    return {'logWidth':math.log(image.width),'logHeight':math.log(image.height),'aspectRatio':image.width/image.height,'currentMeanDQT':float(np.mean(qs)) if qs else None,'sharpness320':float((np.diff(g,axis=0)**2).mean()+(np.diff(g,axis=1)**2).mean()),'contrast320':float(g.std()),'saturation320':float(np.mean((hi-lo)/np.maximum(hi,1e-12))),'clipping320':float(np.mean((a<=1/255)|(a>=254/255)))}


def collect(arm,roles,co,p):
    result=[]
    for parent in co['rows']:
        if parent['role'] not in roles:continue
        item=cache_read(parent,arm,co,p)
        if item is None:raise ValueError('REQUIRED_PARENT_NOT_EXTRACTED')
        result+=item['rows']
    return result


def extract(arm,phase,maximum=None):
    configure();co,p,c=admission(require_threshold=phase=='eval');head,_=candidate()
    if not (OUT/'engineering-validation.json').exists():raise ValueError('ENGINEERING_REQUIRED')
    roles=['CALIBRATION_NEGATIVES'] if phase=='calibration' else ['EVAL_NEGATIVES','EVAL_SYNTHETICS','HISTORICAL_DIAGNOSTIC']
    if arm=='SAFE' and phase!='eval':raise ValueError('SAFE_NOT_CALIBRATION_INPUT')
    if phase=='calibration' and (OUT/'threshold-freeze.json').exists():raise ValueError('CALIBRATION_ALREADY_CONSUMED')
    todo=[r for r in co['rows'] if r['role'] in roles and cache_read(r,arm,co,p) is None]
    if maximum:todo=todo[:maximum]
    if not todo:print(json.dumps({'phase':phase,'cacheComplete':True}));return
    budget=Budget(arm,p['budgets'][arm]);start=time.time();initialization=None;error=None;minimum=guard()['availableBytes'];latencies=[];heads=[];before=None;model=None;completed=0
    try:
        if arm=='PE':model,initialization=load_model('B');transform=transform_for('B')
        else:
            from wp007jr1_safe_representation_probe import load_model as load_safe
            root=Path(tempfile.gettempdir())/'wp007g-SAFE';checkpoint=root/'checkpoint/checkpoint-best.pth'
            if subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()!='4e998724651b227def64f5be0cd60c0aa1552c35' or file_hash(checkpoint)!=SAFE_HASH:raise ValueError('SAFE_IDENTITY')
            t=time.time();model=load_safe(root,checkpoint);model.eval().requires_grad_(False);initialization={'initializationSeconds':time.time()-t,'checkpointSha256':SAFE_HASH};transform=T.Compose([T.CenterCrop((256,256)),T.ToTensor()])
        before=state_hash(model)
        for parent in todo:
            minimum=min(minimum,guard()['availableBytes']);rgb=decode(parent);local=[];arrays=[]
            for condition in CONDITIONS:
                image,facts=controlled(rgb,condition)
                if condition in ('original','resize75'):
                    facts.update(dqt=parent.get('currentDqt') if condition=='original' else None,sampling=parent.get('currentSampling') if condition=='original' else None,sourceFormat=parent['sourceFormat'])
                tensor=transform(image).unsqueeze(0);budget.before();t=time.perf_counter()
                with torch.inference_mode():value=model(tensor)
                elapsed=time.perf_counter()-t;latencies.append(elapsed);minimum=min(minimum,guard()['availableBytes'])
                if not bool(torch.isfinite(value).all()):raise ValueError('NONFINITE_OUTPUT')
                if arm=='PE':
                    if value.shape!=(1,1024):raise ValueError('FEATURE_DIMENSION')
                    arr=value.numpy()[0].copy();arrays.append(arr);ht=time.perf_counter();score=float(infer(head,[arr])[0]);heads.append(time.perf_counter()-ht)
                else:
                    if value.shape!=(1,2):raise ValueError('SAFE_DIMENSION')
                    score=float(value.softmax(1)[0,1])
                local.append({k:parent[k] for k in ('sampleId','sourceFamilyId','role','label','kind','generatorFamily')}|{'condition':condition,'sourceHash':parent['sha256'],'decodedRgbSha256':facts['decodedRgbSha256'],'tensorSha256':array_hash(tensor.numpy()),'transform':facts,'score':score,'seconds':elapsed,'nuisance':nuisance(image,facts) if arm=='PE' else None,'featureIndex':len(arrays)-1 if arm=='PE' else None,'applicability':'RAW_RESEARCH_REFERENCE_NO_AUTHORITY','missingness':None})
                budget.persist()
            path=cache_path(parent,arm);path.parent.mkdir(parents=True,exist_ok=True)
            item={'arm':arm,'sourceHash':parent['sha256'],'cohortHash':co['freezeHash'],'protocolHash':p['freezeHash'],'headHash':HEAD_HASH if arm=='PE' else None,'checkpointHash':MODEL_HASH if arm=='PE' else SAFE_HASH,'rows':local}
            if arm=='PE':
                ap=path.with_suffix('.npz');tmp=ap.with_suffix('.npz.partial')
                with tmp.open('wb') as stream:np.savez_compressed(stream,features=np.asarray(arrays,dtype=np.float32))
                os.replace(tmp,ap);item.update(arrayFile=ap.name,arrayHash=file_hash(ap))
            freeze(path,item);completed+=1
            if sum(f.stat().st_size for f in RUNTIME.rglob('*') if f.is_file())>p['derivedStorageLimitBytes']:raise RuntimeError('DERIVED_STORAGE_GUARD')
            print(json.dumps({'arm':arm,'phase':phase,'newParentsComplete':completed,'remainingThisRun':len(todo)-completed}),flush=True)
        if state_hash(model)!=before:raise ValueError('BACKBONE_CHANGED')
        candidate()
        if arm=='SAFE' and file_hash(checkpoint)!=SAFE_HASH:raise ValueError('SAFE_CHECKPOINT_CHANGED')
    except Exception as exc:
        error=type(exc).__name__+':'+str(exc);raise
    finally:
        budget.finish({'phase':phase,'start':start,'end':time.time(),'codeHash':file_hash(__file__),'protocolHash':p['freezeHash'],'cohortHash':co['freezeHash'],'initialization':initialization,'completedParents':completed,'failure':error,'minimumAvailableBytes':minimum,'processMemory':memory_process(),'frozenParameterHash':before,'forwardSeconds':latencies,'headSeconds':heads,'command':'python scripts/authenticity/wp007o_run.py '+arm.lower()+'-'+phase})


def calibrate():
    co,p,c=admission();rows=collect('PE',['CALIBRATION_NEGATIVES'],co,p)
    if len(rows)!=5*sum(r['role']=='CALIBRATION_NEGATIVES' for r in co['rows']):raise ValueError('CALIBRATION_COUNTS')
    value,worst=threshold_from(rows,p['thresholdRule']['epsilon']);n=len(worst)
    freeze(OUT/'threshold-freeze.json',{'cohortHash':co['freezeHash'],'protocolHash':p['freezeHash'],'headHash':HEAD_HASH,'threshold':value,'comparison':'STRICT_GREATER','epsilon':p['thresholdRule']['epsilon'],'calibrationSourceN':n,'calibrationScoreRowsHash':digest(rows),'calibrationSourceWorstHash':digest(worst),'zeroCalibrationErrorsByConstruction':True,'rankResolution':1/(n+1),'zeroErrorWilson95':wilson(0,n),'exchangeableOrderStatistic95TailUpper':1-.05**(1/n),'populationFPR':'NOT_DEMONSTRATED','publicDisclosure':'PRIVATE_RESTRICTED'})
    print(json.dumps({'thresholdFrozen':True,'calibrationParents':n}))


if __name__=="__main__":
    raise SystemExit("RESEARCH_STOPPED: methodology preservation only; no experiment is authorized")
