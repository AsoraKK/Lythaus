"""Reusable fixed-threshold arithmetic; caller-supplied results remain private."""
from collections import defaultdict
from wp007o_core import *
from wp007n_core import SAFE_THRESHOLD


def metrics(rows,threshold):return fixed_metrics([r['label'] for r in rows],[r['score'] for r in rows],threshold)


def aggregate(rows,mode):
    if mode not in ('max','min'):raise ValueError('AGGREGATE_MODE')
    grouped=defaultdict(list)
    for r in rows:grouped[r['sampleId']].append(r)
    for group in grouped.values():
        if len(group)!=len(CONDITIONS) or {r['condition'] for r in group}!=set(CONDITIONS):raise ValueError('PARENT_CONDITIONS')
        if len({r['label'] for r in group})!=1:raise ValueError('PARENT_LABEL_CONFLICT')
        if any(r['score'] is None or not math.isfinite(r['score']) or not 0<=r['score']<=1 for r in group):raise ValueError('PARENT_MISSING_SCORE')
    return [dict(v[0],score=(max if mode=='max' else min)(r['score'] for r in v),condition='source-'+mode) for v in grouped.values()]


def group_metrics(rows,key,threshold):return {str(k):metrics([r for r in rows if r[key]==k],threshold) for k in sorted({r[key] for r in rows},key=str)}


def rescue(pe,safe,threshold):
    sm={(r['sampleId'],r['condition']):r for r in safe};out=[]
    pm={(r['sampleId'],r['condition']):r for r in pe}
    if len(sm)!=len(safe) or len(pm)!=len(pe):raise ValueError('DUPLICATE_JOIN')
    if set(sm)!=set(pm):raise ValueError('JOIN_COVERAGE')
    for r in pe:
        s=sm[(r['sampleId'],r['condition'])]
        if any(r[k]!=s[k] for k in ('decodedRgbSha256','sourceHash','label','role','kind','generatorFamily','sourceFamilyId')):raise ValueError('SAFE_EXACT_VIEW_JOIN')
        if any(v is None or not math.isfinite(v) or not 0<=v<=1 for v in (r['score'],s['score'])):raise ValueError('MISSING_JOIN_SCORE')
        a=s['score']>=SAFE_THRESHOLD;b=r['score']>threshold
        out.append({k:r[k] for k in ('sampleId','sourceFamilyId','role','label','kind','generatorFamily','condition')}|{'SAFEpositive':a,'B0positive':b,'SAFEscore':s['score'],'B0score':r['score'],'uniqueRescue':bool(r['label'] and b and not a),'inducedFP':bool(not r['label'] and b and not a),'applicability':'RAW_EXPERIMENTAL_SAFE_REFERENCE_NOT_AUTHORITY'})
    groups={}
    for cond in ('all',)+CONDITIONS:
        panel=[r for r in out if cond=='all' or r['condition']==cond];unique={r['sampleId'] for r in panel if r['uniqueRescue']};extra={r['sampleId'] for r in panel if r['inducedFP']}
        groups[cond]={'distinctRescuedParents':len(unique),'rescuedParentIds':sorted(unique),'extraFalsePositiveParents':len(extra),'extraFPParentIds':sorted(extra),'rescuedFamilies':sorted({r['generatorFamily'] for r in panel if r['uniqueRescue']})}
    return {'rows':out,'groups':groups}
