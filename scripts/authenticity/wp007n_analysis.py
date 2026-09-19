"""Rights-gated cached-feature heads and frozen synthetic-positive evaluation."""
import argparse
import hashlib
import json
import math
import os
import time
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
import numpy as np
from scipy.special import expit
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.preprocessing import StandardScaler

REPO=Path(__file__).resolve().parents[2]
OUT=REPO/"research/wp007n"
RUNTIME=Path(os.environ.get("WP007N_RUNTIME",str(Path(tempfile.gettempdir())/"lythaus-wp007n-runtime")))
SEED=2026091907


def read(path):
    return json.loads(Path(path).read_text())


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(",",":"),allow_nan=False).encode()).hexdigest()


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save(path,value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(".partial")
    tmp.write_text(json.dumps(value,indent=2,sort_keys=True,allow_nan=False)+"\n",newline="\n")
    os.replace(tmp,path)


def cached(arm,allowed_roles):
    from wp007n_guards import execution_signature, validate_cache, expected_requests
    signature=execution_signature()
    co=read(OUT/"cohort-freeze.json");protocol=read(OUT/"protocol-hash.json")
    meta={r["sampleId"]:r for r in co["rows"]}
    rows=[]
    for path in sorted((RUNTIME/"features"/arm).glob("*.json")):
        item=read(path)
        if meta[item["sampleId"]]["role"] not in allowed_roles:
            continue
        validate_cache(path,meta[item["sampleId"]],expected_requests(meta[item["sampleId"]],arm,co),signature)
        if item["cohortHash"]!=co["freezeHash"] or item["protocolHash"]!=protocol["canonicalProtocolHash"]:
            raise ValueError("STALE_FEATURE_CACHE")
        arrpath=path.parent/item["arrayFile"]
        if sha(arrpath)!=item["arraySha256"]:
            raise ValueError("FEATURE_HASH_MISMATCH")
        with np.load(arrpath,allow_pickle=False) as arrays:
            for record in item["records"]:
                r=dict(record)
                r["feature"]=arrays["features"][record["featureIndex"]].astype(float)
                r["parent"]=meta[r["sampleId"]]
                rows.append(r)
    return sorted(rows,key=lambda r:(r["sampleId"],r["condition"],r["view"]))


def wilson(k,n,z=1.959963984540054):
    if n==0:
        return None
    p=k/n;d=1+z*z/n;c=(p+z*z/(2*n))/d
    h=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d
    return [max(0.,c-h),min(1.,c+h)]


def fixed_metrics(labels,scores,threshold):
    y=np.asarray(labels,dtype=int);s=np.asarray(scores,dtype=float)
    if len(y)!=len(s) or not np.isfinite(s).all() or not set(y).issubset({0,1}):
        raise ValueError("INVALID_METRIC_INPUT")
    p=s>threshold
    tp=int(np.sum(p&(y==1)));fp=int(np.sum(p&(y==0)));fn=int(np.sum(~p&(y==1)));tn=int(np.sum(~p&(y==0)))
    return {"TP":tp,"FN":fn,"FP":fp,"TN":tn,"positiveN":tp+fn,"negativeN":fp+tn,"recall":tp/(tp+fn) if tp+fn else None,"FPR":fp/(fp+tn) if fp+tn else None,"fprWilson95":wilson(fp,fp+tn),"AUROC":float(roc_auc_score(y,s)) if len(set(y))==2 else None,"averagePrecision":float(average_precision_score(y,s)) if 1 in y else None,"syntheticPrevalence":float(np.mean(y)) if len(y) else None,"threshold":threshold,"comparison":"STRICT_GREATER","APDefinition":"sklearn average_precision_score; not trapezoidal PR AUC"}


def unit(x):
    return x/np.maximum(np.linalg.norm(x,axis=1,keepdims=True),1e-12)


def model_digest(head):
    return digest({k:v for k,v in head.items() if k not in ("headHash","fitSeconds")})


def infer(head,features):
    x=unit(np.asarray(features,dtype=float))
    z=(x-np.asarray(head["mean"]))/np.asarray(head["scale"])
    logits=z@np.asarray(head["coefficient"])+head["intercept"]
    return expit(logits)


def fit_one(fit,dev,feature_key="feature",permutation=False):
    for row in fit+dev:
        if row["role"] not in ("FIT","DEV") or not row["parent"]["trainingAllowed"]:
            raise ValueError("UNAUTHORIZED_FITTING_ROW")
    parent_y={r["sampleId"]:r["label"] for r in fit+dev}
    if permutation:
        for role,offset in ((fit,0),(dev,1)):
            ids=sorted({r["sampleId"] for r in role})
            labels=np.array([parent_y[s] for s in ids])
            labels=np.random.default_rng(SEED+offset).permutation(labels)
            parent_y.update(dict(zip(ids,map(int,labels))))
    x=unit(np.asarray([r[feature_key] for r in fit],dtype=float))
    d=unit(np.asarray([r[feature_key] for r in dev],dtype=float))
    y=np.array([parent_y[r["sampleId"]] for r in fit]);dy=np.array([parent_y[r["sampleId"]] for r in dev])
    counts=Counter(r["sampleId"] for r in fit)
    weights=np.array([1/counts[r["sampleId"]] for r in fit])
    scaler=StandardScaler().fit(x,sample_weight=weights)
    x=scaler.transform(x);d=scaler.transform(d)
    candidates=[]
    for c in (.01,.1,1.):
        start=time.perf_counter()
        model=LogisticRegression(C=c,solver="lbfgs",fit_intercept=True,max_iter=2000,random_state=SEED)
        model.fit(x,y,sample_weight=weights)
        if int(model.n_iter_.max())>=2000:
            raise ValueError("HEAD_DID_NOT_CONVERGE")
        scores=model.predict_proba(d)[:,1]
        threshold=float(max(scores[dy==0]))
        tp=len({r["sampleId"] for r,s,label in zip(dev,scores,dy) if s>threshold and label==1})
        ap=float(average_precision_score(dy,scores))
        head={"coefficient":model.coef_[0].tolist(),"intercept":float(model.intercept_[0]),"mean":scaler.mean_.tolist(),"scale":scaler.scale_.tolist(),"C":c,"featureKey":feature_key,"inputNormalization":"L2_then_FIT_ONLY_STANDARDIZATION","classes":[0,1],"scoreMeaning":"INTERNAL_UNCALIBRATED_SIGMOID_NOT_ORIGIN_PROBABILITY","rightsClass":"RESEARCH_ONLY_DEPLOYMENT_REVIEW_REQUIRED","trainingIds":sorted(counts),"devIds":sorted({r['sampleId'] for r in dev}),"parentWeights":{k:1. for k in counts},"permutation":permutation,"seed":SEED,"fitSeconds":time.perf_counter()-start,"iterations":int(model.n_iter_.max())}
        serialized=infer(head,[r[feature_key] for r in dev])
        head["serializationMaxAbsError"]=float(np.max(np.abs(serialized-scores)))
        candidates.append((tp,ap,-c,head,{"C":c,"devTPAtZeroObservedFp":tp,"devAP":ap,"selectionThreshold":threshold}))
    choice=max(candidates,key=lambda x:x[:3])
    head=choice[3];head["gridResults"]=[r[4] for r in candidates]
    head["headHash"]=model_digest(head)
    return head


def calibration(candidate,rows,head=None):
    cal=[r for r in rows if r["role"]=="CALIBRATION" and r["view"]=="reference"]
    if len({r["sampleId"] for r in cal})!=8 or any(r["label"] for r in cal):
        raise ValueError("CALIBRATION_MEMBERSHIP")
    for sid in {r["sampleId"] for r in cal}:
        conditions=[r["condition"] for r in cal if r["sampleId"]==sid]
        if len(conditions)!=6 or set(conditions)!={"original","jpeg95","jpeg75","resize75","resize75_jpeg95","png_roundtrip"}:
            raise ValueError("INCOMPLETE_CALIBRATION_CONDITIONS")
    scores=infer(head,[r[head["featureKey"]] for r in cal]).tolist() if head else [r[candidate] for r in cal]
    if any(s is None for s in scores):
        raise ValueError("CALIBRATION_MISSING")
    pairs=list(zip(cal,scores));worst=defaultdict(list)
    for r,s in pairs:
        worst[r["sampleId"]].append(float(s))
    return {"candidate":candidate,"headHash":head["headHash"] if head else None,"originalThreshold":max(float(s) for r,s in pairs if r["condition"]=="original"),"worstThreshold":max(max(s) for s in worst.values()),"sourceWorstScores":{k:max(v) for k,v in worst.items()},"sourceCount":8,"rankResolution":.125,"comparison":"STRICT_GREATER","targetFpr":.01,"fprTargetDemonstrated":False,"roles":["CALIBRATION"],"protocolHash":read(OUT/"protocol-hash.json")["canonicalProtocolHash"],"cohortHash":read(OUT/"cohort-freeze.json")["freezeHash"],"frozenBeforeEvaluation":True,"codeHash":sha(__file__)}


def fit_and_calibrate(arm):
    rows=cached(arm,{"FIT","DEV","CALIBRATION"})
    co=read(OUT/"cohort-freeze.json")
    required={r["sampleId"] for r in co["rows"] if r["role"] in ("FIT","DEV","CALIBRATION")}
    if {r["sampleId"] for r in rows}!=required:
        raise ValueError("FITTING_EXTRACTION_INCOMPLETE")
    specs=[("A0",["original"])] if arm=="A" else [("B0",["original"]),("B1",["original","jpeg95","jpeg75"]),("NUISANCE",["original","jpeg95","jpeg75"])]
    for name,conditions in specs:
        for perm in (False,True):
            variant=name+("_PERMUTED" if perm else "")
            if (OUT/(variant+"-calibration.json")).exists():
                raise ValueError("CONFIRMATION_CANNOT_RETUNE")
            fit=[r for r in rows if r["role"]=="FIT" and r["condition"] in conditions]
            dev=[r for r in rows if r["role"]=="DEV" and r["condition"] in conditions]
            head=fit_one(fit,dev,"nuisance" if name=="NUISANCE" else "feature",perm)
            head["backbone"]=arm if name!="NUISANCE" else None
            head["checkpointHash"]=read(OUT/"checkpoint-freeze.json")[arm]["sha256"] if name!="NUISANCE" else None
            head["cohortHash"]=co["freezeHash"]
            head["protocolHash"]=read(OUT/"protocol-hash.json")["canonicalProtocolHash"]
            head["headHash"]=model_digest(head)
            save(RUNTIME/"heads"/(variant+"-head.json"),head)
            save(OUT/(variant+"-head.json"),head_manifest(variant,head))
            cal=calibration(variant,rows,head)
            cal["schemaVersion"]="wp007n-calibration-v1"
            cal["freezeHash"]=digest(cal)
            save(OUT/(variant+"-calibration.json"),cal)
            print(json.dumps({"candidate":variant,"fitParents":len(head['trainingIds']),"devParents":len(head['devIds']),"C":head['C'],"calibrationParents":8,"calibrationFrozen":True}),flush=True)
    if arm=="A":
        for name in ("A1","A2"):
            if (OUT/(name+"-calibration.json")).exists():
                raise ValueError("CONFIRMATION_CANNOT_RETUNE")
            cal=calibration(name,rows)
            cal["schemaVersion"]="wp007n-calibration-v1"
            cal["freezeHash"]=digest(cal)
            save(OUT/(name+"-calibration.json"),cal)


def load_candidate(name):
    cal=read(OUT/(name+"-calibration.json"));bare=dict(cal);h=bare.pop("freezeHash")
    if digest(bare)!=h:
        raise ValueError("CALIBRATION_CHANGED")
    from wp007n_guards import execution_signature
    receipt=read(OUT/"admission-transition.json")
    if receipt["executionSignature"]!=execution_signature() or receipt["analysisCodeHash"]!=sha(__file__) or receipt["calibrationHashes"].get(name)!=sha(OUT/(name+"-calibration.json")):
        raise ValueError("UNSEALED_CALIBRATION_IMPLEMENTATION")
    if name in ("A1","A2"):
        return None,cal
    head=read(RUNTIME/"heads"/(name+"-head.json"));h=head["headHash"]
    if model_digest(head)!=h or cal["headHash"]!=h:
        raise ValueError("HEAD_CHANGED")
    if receipt["headFileHashes"].get(name)!=sha(RUNTIME/"heads"/(name+"-head.json")):
        raise ValueError("UNSEALED_HEAD_IMPLEMENTATION")
    return head,cal


def head_manifest(name,head):
    path=RUNTIME/"heads"/(name+"-head.json")
    return {"candidate":name,"headHash":head["headHash"],"fileSha256":sha(path),"logicalArtifact":"external/wp007n/heads/"+path.name,"serializedBytes":path.stat().st_size,"parameterCount":len(head["coefficient"])+1,"trainingIds":head["trainingIds"],"devIds":head["devIds"],"C":head["C"],"backbone":head["backbone"],"checkpointHash":head["checkpointHash"],"cohortHash":head["cohortHash"],"protocolHash":head["protocolHash"],"rightsClass":head["rightsClass"],"gridResults":head["gridResults"],"fitSeconds":head["fitSeconds"],"serializationMaxAbsError":head["serializationMaxAbsError"],"permutation":head["permutation"],"rawCoefficientsInGit":False}


def evaluate():
    ar=cached("A",{"EVAL_N","HISTORICAL_CHALLENGE"})
    br=cached("B",{"EVAL_N","HISTORICAL_CHALLENGE"})
    from wp007n_guards import expected_requests
    co=read(OUT/"cohort-freeze.json")
    for arm,rows in (("A",ar),("B",br)):
        expected={(r["sampleId"],c,v) for r in co["rows"] if r["role"] in ("EVAL_N","HISTORICAL_CHALLENGE") for c,v in expected_requests(r,arm,co)}
        actual=[(r["sampleId"],r["condition"],r["view"]) for r in rows]
        if len(actual)!=len(set(actual)) or set(actual)!=expected:
            save(OUT/(arm+"-incomplete-inference.json"),{"expected":len(expected),"present":len(actual),"missing":[list(x) for x in sorted(expected-set(actual))],"status":"BLOCKED_RUNTIME_OR_INCOMPLETE_NOT_NEGATIVE"})
            raise ValueError("INFERENCE_INCOMPLETE_NO_NEGATIVE_OUTPUT")
    all_scores=[];results={}
    for name in ("A0","A1","A2","B0","B1","NUISANCE","A0_PERMUTED","B0_PERMUTED","B1_PERMUTED","NUISANCE_PERMUTED"):
        rows=ar if name.startswith("A") else br
        head,cal=load_candidate(name)
        scores=infer(head,[r[head["featureKey"]] for r in rows]).tolist() if head else [r[name] for r in rows]
        for r,s in zip(rows,scores):
            from wp007n_contracts import representation_response_evidence,frozen_feature_origin_evidence
            evidence=representation_response_evidence("DINOv2-L14",r["sourceSha256"],[x['similarity'] for x in r['responses']]) if head is None else frozen_feature_origin_evidence(head['backbone'],head['headHash'],cal['freezeHash'],r['sourceSha256'],float(s))
            all_scores.append({k:r[k] for k in ("sampleId","sourceFamilyId","role","kind","label","generatorFamily","condition","view","sourceSha256","scientificViewRgbHash","tensorSha256")}|{"candidate":name,"score":float(s),"originalThreshold":cal["originalThreshold"],"worstThreshold":cal["worstThreshold"],"headHash":head["headHash"] if head else None,"calibrationHash":cal["freezeHash"],"researchOnly":True,"evidence":evidence})
        current=[r for r in all_scores if r["candidate"]==name]
        grouped={}
        for field in ("condition","kind","generatorFamily","view"):
            for group in sorted({str(r[field]) for r in current}):
                subset=[r for r in current if str(r[field])==group and (field=="view" or r["view"]=="reference")]
                if not subset:
                    continue
                threshold=cal["originalThreshold"] if field=="condition" and group=="original" else cal["worstThreshold"]
                grouped[field+":"+group]=fixed_metrics([r['label'] for r in subset],[r['score'] for r in subset],threshold)
                if len({r['sampleId'] for r in subset})!=len(subset):
                    grouped[field+":"+group]["fprWilson95"]=None
                    grouped[field+":"+group]["independence"]="DEPENDENT_DESCENDANTS_NO_BINOMIAL_INTERVAL"
        negatives=defaultdict(list)
        for r in current:
            if not r["label"] and r["view"]=="reference":
                negatives[r["sampleId"]].append(r)
        fp=[sid for sid,rs in negatives.items() if any(r["score"]>cal["worstThreshold"] for r in rs)]
        subgroup={}
        for kind in sorted({rs[0]["kind"] for rs in negatives.values()}):
            ids=[sid for sid,rs in negatives.items() if rs[0]["kind"]==kind]
            count=len(set(ids)&set(fp))
            subgroup[kind]={"FP":count,"N":len(ids),"FPR":count/len(ids),"wilson95":wilson(count,len(ids))}
        results[name]={"groups":grouped,"sourceWorst":{"FP":len(fp),"N":len(negatives),"FPR":len(fp)/len(negatives),"wilson95":wilson(len(fp),len(negatives)),"positiveParentIds":fp,"subgroups":subgroup,"conditionScope":"original/JPEG75 for48 screen parents plus six conditions in frozen12-parent panel; unequal panel coverage explicitly retained"},"missingActualHumanDigitalControls":True,"fprPopulationTarget":"NOT_DEMONSTRATED"}
    save(OUT/"candidate-score-rows.json",{"rows":all_scores,"count":len(all_scores),"cohortHash":read(OUT/"cohort-freeze.json")["freezeHash"],"codeHash":sha(__file__)})
    save(OUT/"candidate-results.json",results)
    print(json.dumps({k:v['sourceWorst'] for k,v in results.items()},indent=2))


if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("action",choices=["fit","evaluate"]);parser.add_argument("--arm",choices=["A","B"]);args=parser.parse_args()
    if args.action=="fit":
        fit_and_calibrate(args.arm)
    else:
        evaluate()
