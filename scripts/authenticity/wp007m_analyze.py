"""Frozen-rule evaluation, matched controls and source-level denominators."""
import argparse
from collections import Counter,defaultdict
import json
import time
from pathlib import Path
import numpy as np
from scipy.optimize import linear_sum_assignment
from scipy.stats import spearmanr
from sklearn.metrics import roc_auc_score,average_precision_score
from wp007m_probe import OUT,ROOT,CONDITIONS,CANDIDATES,SAFE_THRESHOLD,joined,load,save,filehash,digest,wilson


def score(row,rule,group="features",null=False):
    v=row["spatialNull" if null else group][rule["key"]]
    return None if v is None else abs(v) if rule["absolute"] else v


def hit(row,rule,group="features"):
    v=score(row,rule,group)
    return v is not None and v>rule["threshold"]


def auc(rows,values):
    good=[(r["label"],v) for r,v in zip(rows,values) if v is not None]
    if len({x[0] for x in good})<2:return None
    y,s=zip(*good)
    a=float(roc_auc_score(y,s))
    p=[v for y,v in good if y];n=[v for y,v in good if not y]
    manual=float(np.mean([(x>z)+.5*(x==z) for x in p for z in n]))
    if abs(a-manual)>1e-12:raise ValueError("AUC_CROSSCHECK_FAILED")
    return {"auc":a,"rankBiserial":2*a-1,"averagePrecision":float(average_precision_score(y,s)),"available":len(good),"pairwiseCrosscheckDelta":abs(a-manual)}


def summary(rows,rules):
    out={"n":len(rows),"sources":len({r["sampleId"] for r in rows})}
    for name,rule in rules.items():
        pos=[r for r in rows if r["label"]];neg=[r for r in rows if not r["label"]]
        out[name]={"recall":wilson(sum(hit(r,rule,name) for r in pos),len(pos)),"fpr":wilson(sum(hit(r,rule,name) for r in neg),len(neg)),"missing":sum(score(r,rule,name) is None for r in rows),"discrimination":auc(rows,[score(r,rule,name) for r in rows])}
    out["SAFE_RAW_REFERENCE"]={"recall":wilson(sum(r["safeScore"]>=SAFE_THRESHOLD for r in rows if r["label"]),sum(r["label"] for r in rows)),"fpr":wilson(sum(r["safeScore"]>=SAFE_THRESHOLD for r in rows if not r["label"]),sum(not r["label"] for r in rows))}
    out["jointSynthetic"]=dict(Counter(("SAFE_HIGH" if r["safeScore"]>=SAFE_THRESHOLD else "SAFE_LOW")+":"+("CANDIDATE_HIGH" if hit(r,rules["features"]) else "CANDIDATE_LOW_OR_MISSING") for r in rows if r["label"]))
    out["jointNegative"]=dict(Counter(("SAFE_HIGH" if r["safeScore"]>=SAFE_THRESHOLD else "SAFE_LOW")+":"+("CANDIDATE_HIGH" if hit(r,rules["features"]) else "CANDIDATE_LOW_OR_MISSING") for r in rows if not r["label"]))
    out["uniqueSafeRescue"]=sum(r["label"] and r["safeScore"]<SAFE_THRESHOLD and hit(r,rules["features"]) for r in rows)
    out["inducedFp"]=sum(not r["label"] and r["safeScore"]<SAFE_THRESHOLD and hit(r,rules["features"]) for r in rows)
    out["diagnosticUnionOnly"]={"syntheticDetected":sum(r["label"] and (r["safeScore"]>=SAFE_THRESHOLD or hit(r,rules["features"])) for r in rows),"negativeFlagged":sum(not r["label"] and (r["safeScore"]>=SAFE_THRESHOLD or hit(r,rules["features"])) for r in rows),"authority":"NONE_RAW_COUNTERFACTUAL_NOT_POLICY"}
    return out


def grouped(rows,key,rules):
    return {v:summary([r for r in rows if str(r.get(key))==v],rules) for v in sorted({str(r.get(key)) for r in rows})}


def worst(rows,rules):
    by=defaultdict(list)
    for r in rows:by[r["sampleId"]].append(r)
    out={}
    for kind in ["ALL","PHOTO","HARD"]:
        neg=[rs for rs in by.values() if not rs[0]["label"] and (kind=="ALL" or rs[0]["kind"]==kind)]
        out[kind]={name:wilson(sum(any(hit(r,rule,name) for r in rs) for rs in neg),len(neg)) for name,rule in rules.items()}
        out[kind]["SAFE_RAW_REFERENCE"]=wilson(sum(any(r["safeScore"]>=SAFE_THRESHOLD for r in rs) for rs in neg),len(neg))
    out["uniqueRescuedSyntheticParents"]=sum(rs[0]["label"] and any(r["safeScore"]<SAFE_THRESHOLD and hit(r,rules["features"]) for r in rs) for rs in by.values())
    out["familyCounts"]=dict(Counter(rs[0]["splitGroup"] for rs in by.values()))
    return out


def matched(rows,rule):
    names=["pixelStd","dctDcStd","fftLogMagnitudeMean","haarMarginalEnergyRatio"]
    results={}
    for kind in ["PHOTO","HARD"]:
        p=[r for r in rows if r["label"] and score(r,rule) is not None]
        n=[r for r in rows if r["kind"]==kind and score(r,rule) is not None]
        if not p or not n:continue
        mat=np.array([[r["baseline"][k] for k in names] for r in p+n])
        scale=np.subtract(*np.quantile(mat,[.75,.25],axis=0));scale=np.maximum(scale,1e-12)
        cost=np.sum(((mat[:len(p),None,:]-mat[None,len(p):,:])/scale)**2,axis=2)
        left,right=linear_sum_assignment(cost)
        pairs=[(p[i],n[j]) for i,j in zip(left,right)]
        sample=[a for a,b in pairs]+[b for a,b in pairs]
        results[kind]={"pairs":len(pairs),"noReplacement":True,"matchingFeatures":names,"medianStandardizedDistance":float(np.median(np.sqrt(cost[left,right]))),"candidate":auc(sample,[score(r,rule) for r in sample]),"pairedProbabilityHigher":float(np.mean([score(a,rule)>score(b,rule) for a,b in pairs])),"caveat":"Matching observed marginals is not same-scene matching; poor distances mean residual confounding remains."}
    return results


def main():
    a=argparse.ArgumentParser();a.add_argument("--bulk",required=True);args=a.parse_args()
    frozen=load(OUT/"decision-freeze.json");h=frozen.pop("freezeHash")
    if digest(frozen)!=h:raise ValueError("RULE_MUTATED")
    rules=frozen["choices"];allrows=joined(args.bulk,"DISCOVERY")+joined(args.bulk,"HELDOUT")
    cohort=load(OUT/"cohort-freeze.json")
    if len(allrows)!=len(cohort["rows"])*len(CONDITIONS):raise ValueError("INCOMPLETE_MATRIX")
    if len({(r["sampleId"],r["condition"]) for r in allrows})!=len(allrows):raise ValueError("DUPLICATE_MEASUREMENT")
    result={"schemaVersion":"wp007m-empirical-v1","ruleHash":h,"cohortHash":cohort["freezeHash"],"rows":len(allrows),"parents":len(cohort["rows"]),"roles":{},"productionAuthorization":"NO","fprStatus":"FPR_TARGET_NOT_STATISTICALLY_DEMONSTRATED","freshProgrammeConfirmation":False}
    features={};falsify={};errors=[]
    for role in ["DISCOVERY","HELDOUT"]:
        rows=[r for r in allrows if r["role"]==role]
        result["roles"][role]={"conditions":grouped(rows,"condition",rules),"sourceWorstCase":worst(rows,rules),"originalFamilies":grouped([r for r in rows if r["condition"]=="ORIGINAL"],"generatorFamily",rules),"hardSubtypeOriginal":grouped([r for r in rows if r["condition"]=="ORIGINAL" and r["kind"]=="HARD"],"subtype",rules)}
        features[role]={};falsify[role]={}
        for c in CONDITIONS:
            sub=[r for r in rows if r["condition"]==c]
            features[role][c]={}
            for k in CANDIDATES:
                features[role][c][k]={kind:auc([r for r in sub if r["kind"] in [kind,"SYNTHETIC"]],[r["features"][k] for r in sub if r["kind"] in [kind,"SYNTHETIC"]]) for kind in ["PHOTO","HARD"]}
            vals=[(score(r,rules["features"]),score(r,rules["features"],null=True)) for r in sub]
            delta=[x-y for x,y in vals if x is not None and y is not None]
            correlation={}
            for k in sub[0]["baseline"]:
                v=[r for r in sub if score(r,rules["features"]) is not None]
                co=spearmanr([score(r,rules["features"]) for r in v],[r["baseline"][k] for r in v]).statistic
                correlation[k]=float(co) if np.isfinite(co) else None
            falsify[role][c]={"spatialNullDiscrimination":auc(sub,[score(r,rules["features"],null=True) for r in sub]),"medianObservedMinusShiftedNull":float(np.median(delta)),"nuisanceMatched":matched(sub,rules["features"]),"baselineSpearman":correlation,"byKind":{kind:{"candidateMedian":float(np.median([score(r,rules["features"]) for r in sub if r["kind"]==kind and score(r,rules["features"]) is not None])),"nullMedian":float(np.median([score(r,rules["features"],null=True) for r in sub if r["kind"]==kind and score(r,rules["features"],null=True) is not None]))} for kind in ["PHOTO","HARD","SYNTHETIC"]}}
        for r in rows:
            if (not r["label"] and hit(r,rules["features"])) or (r["label"] and not hit(r,rules["features"])):
                errors.append({k:r[k] for k in ["sampleId","sourceFamilyId","role","kind","generatorFamily","subtype","condition","features","safeScore","codec"]}|{"error":"FP" if not r["label"] else "FN_OR_MISSING","candidateScore":score(r,rules["features"]),"knownCause":"UNRESOLVED_NO_MANUAL_TRUTH_OVERRIDE"})
    original={(r["sampleId"]):r for r in allrows if r["condition"]=="ORIGINAL"}
    falsify["metadataRoundtripPixelEqual"]=sum(r["codec"]["pixelHash"]==original[r["sampleId"]]["codec"]["pixelHash"] for r in allrows if r["condition"]=="PNG_STRIP")
    falsify["metadataRoundtripN"]=len(original)
    falsify["transformDeltas"]={c:{kind:float(np.median([score(r,rules["features"])-score(original[r["sampleId"]],rules["features"]) for r in allrows if r["condition"]==c and r["kind"]==kind and score(r,rules["features"]) is not None and score(original[r["sampleId"]],rules["features"]) is not None])) for kind in ["PHOTO","HARD","SYNTHETIC"]} for c in CONDITIONS}
    rt={k:{"p50":float(np.median([r[k] for r in allrows])),"p95":float(np.quantile([r[k] for r in allrows],.95)),"max":float(max(r[k] for r in allrows))} for k in ["featureMs","safeMs","totalMs"]}
    rt["scope"]="featureMs includes candidate, null AND all K baseline FFT/DCT features; total includes encoder path and Sharp process startup, not source full decode"
    rt["runArtifacts"]=["discovery-run.json","heldout-run.json"]
    save(OUT/"empirical-results.json",result);save(OUT/"descriptive-features.json",features);save(OUT/"falsification-results.json",falsify);save(OUT/"runtime-benchmark.json",rt)
    save(Path(args.bulk)/"error-records.json",errors)
    save(OUT/"error-analysis.json",{"bulkHash":filehash(Path(args.bulk)/"error-records.json"),"logicalPath":"external/wp007m/error-records.json","counts":dict(Counter(r["role"]+":"+r["error"] for r in errors)),"fpRecords":[r for r in errors if r["error"]=="FP"],"fnFamilyCounts":dict(Counter(r["role"]+":"+str(r["generatorFamily"])+":"+r["condition"] for r in errors if r["error"]!="FP")),"sourceTruthUnchanged":True})
    save(OUT/"analysis-run.json",{"codeHash":filehash(__file__),"inputHashes":{r:filehash(Path(args.bulk)/(r+"-rows.jsonl")) for r in ["discovery","heldout"]},"completedUnix":time.time(),"command":"python scripts/authenticity/wp007m_analyze.py --bulk <EXTERNAL_WP007M>","aucCrosscheck":"Every AUC matched independent pairwise positive/negative comparison with half-credit ties"})
    print(json.dumps({"rows":len(allrows),"heldout":result["roles"]["HELDOUT"]["conditions"]["ORIGINAL"],"worst":result["roles"]["HELDOUT"]["sourceWorstCase"]}),flush=True)


if __name__=="__main__":main()
