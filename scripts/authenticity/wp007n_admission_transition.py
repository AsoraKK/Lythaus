"""Explicit pre-evaluation recertification; never change heads or thresholds."""
import ast
import json
import numpy as np
from wp007n_core import OUT,REPO,RUNTIME,file_hash,digest,save_json
from wp007n_analysis import cached,read,fit_one,infer,calibration,sha


def main():
    old=read(OUT/"execution-code-freeze.json")
    legacy=read(OUT/"legacy-cache-certificate.json")
    co=read(OUT/"cohort-freeze.json")
    if not legacy["replayValidated"] or legacy["executionSignature"]!=old["signature"] or legacy["cohortHash"]!=co["freezeHash"]:
        raise ValueError("OLD_REPLAY_RECEIPT_INVALID")
    if file_hash(REPO/"scripts/authenticity/wp007n_core.py")!=old["files"]["scripts/authenticity/wp007n_core.py"]:
        raise ValueError("MEASUREMENT_ARITHMETIC_CHANGED")
    names=["core","freeze","extract","guards","analysis"]
    files={"scripts/authenticity/wp007n_"+n+".py":file_hash(REPO/"scripts/authenticity"/("wp007n_"+n+".py")) for n in names}
    signature=digest(files)
    receipts={}
    allowed={r['sampleId'] for r in co['rows'] if r['role'] in ('FIT','DEV','CALIBRATION')}
    for arm in ('A','B'):
        for p in (RUNTIME/'features'/arm).glob('*.json'):
            x=read(p)
            if x['sampleId'] not in allowed or any(r['role'] not in ('FIT','DEV','CALIBRATION') for r in x['records']):
                raise ValueError('EVALUATION_ALREADY_PRESENT_TRANSITION_PROHIBITED')
            if arm=='A' and legacy['parents'][x['sampleId']]['metadataSha256']!=file_hash(p):
                raise ValueError('LEGACY_CHANGED')
            if arm=='B' and x['executionSignature']!=old['signature']:
                raise ValueError('B_EXECUTION_UNEXPECTED')
            receipts[arm+'/'+p.name]=file_hash(p)
    if len(receipts)!=88:
        raise ValueError('FITTING_RECEIPT_COUNT')
    candidates=['A0','A1','A2','B0','B1','NUISANCE','A0_PERMUTED','B0_PERMUTED','B1_PERMUTED','NUISANCE_PERMUTED']
    transition={'executionSignature':signature,'cohortHash':co['freezeHash'],'previousExecutionSignature':old['signature'],'previousExecutionFiles':old['files'],'analysisCodeHash':sha(Path(__file__).with_name('wp007n_analysis.py')),'cacheReceipts':receipts,'legacyReplayReceiptHash':file_hash(OUT/'legacy-cache-certificate.json'),'calibrationHashes':{n:file_hash(OUT/(n+'-calibration.json')) for n in candidates},'headFileHashes':{n:file_hash(RUNTIME/'heads'/(n+'-head.json')) for n in candidates if n not in ('A1','A2')},'reason':'Admission-only hardening. Measurement arithmetic unchanged. No evaluation media scored; heads and thresholds immutable. Exact fitting recomputation below.'}
    save_json(OUT/'execution-code-freeze.json',{'files':files,'signature':signature,'protocolUnchanged':True,'hardeningBeforeEvaluation':True})
    save_json(OUT/'admission-transition.json',transition)
    checks=[]
    for arm in ('A','B'):
        rows=cached(arm,{'FIT','DEV','CALIBRATION'})
        for name in [n for n in candidates if (n.startswith('A') if arm=='A' else not n.startswith('A'))]:
            head=None if name in ('A1','A2') else read(RUNTIME/'heads'/(name+'-head.json'))
            actual=read(OUT/(name+'-calibration.json'))
            recal=calibration(name,rows,head)
            for key in ('originalThreshold','worstThreshold','sourceWorstScores'):
                if actual[key]!=recal[key]:raise ValueError('CALIBRATION_RECOMPUTATION_MISMATCH')
            error=0.
            if head:
                conditions=['original'] if name.startswith(('A0','B0')) else ['original','jpeg95','jpeg75']
                fit=[r for r in rows if r['role']=='FIT' and r['condition'] in conditions]
                dev=[r for r in rows if r['role']=='DEV' and r['condition'] in conditions]
                repeat=fit_one(fit,dev,head['featureKey'],head['permutation'])
                error=max(float(np.max(np.abs(np.asarray(head[k])-np.asarray(repeat[k])))) for k in ('mean','scale','coefficient','intercept'))
                if head['C']!=repeat['C'] or error>1e-10:raise ValueError('HEAD_REPRODUCTION_MISMATCH')
            checks.append({'candidate':name,'calibrationExact':True,'refitMaxAbs':error,'headsAndThresholdsUnchanged':True})
    from wp007n_guards import validate_calibrations
    validate_calibrations(co,read(OUT/'protocol-hash.json')['canonicalProtocolHash'])
    transition['independentRecomputation']=checks
    transition['validated']=True
    save_json(OUT/'admission-transition.json',transition)
    print(json.dumps({'recertifiedCaches':len(receipts),'checks':checks}))


if __name__=='__main__':
    from pathlib import Path
    main()
