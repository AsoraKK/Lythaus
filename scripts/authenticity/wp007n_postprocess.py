"""Source-level comparisons and falsification; no fitting or threshold changes."""
import json
import math
import time
from collections import defaultdict,Counter
import numpy as np
from scipy.stats import spearmanr
from wp007n_analysis import OUT,RUNTIME,read,save,sha,cached,load_candidate,infer,fixed_metrics,wilson


def key(r):return r['sampleId'],r['condition'],r['view']


def rank_correlation(x,y):
    if len(set(x))<2 or len(set(y))<2:return None
    value=float(spearmanr(x,y).statistic)
    return value if math.isfinite(value) else None


def summarize(rows,threshold):
    metric=fixed_metrics([r['label'] for r in rows],[r['score'] for r in rows],threshold)
    if len({r['sampleId'] for r in rows})!=len(rows):
        metric['fprWilson95']=None
        metric['independence']='DEPENDENT_DESCENDANTS'
    return metric


def main():
    a=cached('A',{'EVAL_N','HISTORICAL_CHALLENGE'});b=cached('B',{'EVAL_N','HISTORICAL_CHALLENGE'})
    scores=read(OUT/'candidate-score-rows.json')['rows'];safe=read(OUT/'safe-reference-rows.json')['rows']
    safe_map={key(r):r for r in safe};am={key(r):r for r in a};bm={key(r):r for r in b}
    if set(safe_map)!=set(am) or set(am)!=set(bm):raise ValueError('EXACT_VIEW_JOIN_INCOMPLETE')
    for k in am:
        if len({am[k]['scientificViewRgbHash'],bm[k]['scientificViewRgbHash'],safe_map[k]['scientificViewRgbHash']})!=1:raise ValueError('EXACT_VIEW_JOIN_DIFFERENT_PIXELS')
    groups={};rescues={};case_rows=[]
    for candidate in sorted({r['candidate'] for r in scores}):
        rows=[r for r in scores if r['candidate']==candidate]
        cal=load_candidate(candidate)[1];bykey={key(r):r for r in rows}
        detail={}
        for view in ('reference','matched256'):
            for condition in sorted({r['condition'] for r in rows if r['view']==view}):
                subset=[r for r in rows if r['view']==view and r['condition']==condition]
                threshold=cal['originalThreshold'] if condition=='original' else cal['worstThreshold']
                detail[view+'/'+condition]={'all':summarize(subset,threshold)}
                for kind in sorted({r['kind'] for r in subset}):
                    detail[view+'/'+condition]['kind:'+kind]=summarize([r for r in subset if r['kind']==kind],threshold)
                for generator in sorted({r['generatorFamily'] for r in subset if r['generatorFamily']}):
                    detail[view+'/'+condition]['generator:'+generator]=summarize([r for r in subset if r['generatorFamily']==generator],threshold)
        groups[candidate]=detail
        partitions={}
        for condition in ('original','jpeg75','ALL_DECLARED_WORST'):
            selected=[r for r in rows if r['view']=='reference' and (condition=='ALL_DECLARED_WORST' or r['condition']==condition)]
            grouped=defaultdict(list)
            for r in selected:grouped[r['sampleId']].append(r)
            bins=defaultdict(list)
            for sid,rs in grouped.items():
                threshold=cal['originalThreshold'] if condition=='original' else cal['worstThreshold']
                cp=any(r['score']>threshold for r in rs)
                sp=any(safe_map[key(r)]['thresholdPass'] for r in rs)
                exact_rescues=[r for r in rs if r['label']==1 and r['score']>threshold and not safe_map[key(r)]['thresholdPass']]
                category=('BOTH_POSITIVE' if cp and sp else 'CANDIDATE_ONLY' if cp else 'SAFE_ONLY' if sp else 'BOTH_LOW')
                bins[('synthetic/' if rs[0]['label'] else 'negative/')+category].append(sid)
                if exact_rescues:bins['exactConditionUniqueRescue'].append(sid)
                if cp:
                    case_rows.append({'candidate':candidate,'scope':condition,'sampleId':sid,'sourceFamilyId':rs[0]['sourceFamilyId'],'kind':rs[0]['kind'],'generatorFamily':rs[0]['generatorFamily'],'label':rs[0]['label'],'candidatePositive':True,'SAFEpositive':sp,'positiveConditions':[r['condition'] for r in rs if r['score']>threshold],'SAFEauthority':'RAW_UNQUALIFIED_REGIME_REFERENCE'})
            partitions[condition]={k:{'N':len(v),'sourceIds':sorted(v)} for k,v in bins.items()}
            partitions[condition]['denominator']={'synthetic':sum(rs[0]['label']==1 for rs in grouped.values()),'negative':sum(rs[0]['label']==0 for rs in grouped.values())}
        rescues[candidate]=partitions
    safe_metrics={}
    for condition in sorted({r['condition'] for r in safe}):
        rs=[r for r in safe if r['condition']==condition and r['view']=='reference']
        m=summarize(rs,.5864923000335693)
        m['comparison']='GREATER_OR_EQUAL; no exact threshold ties in these rows'
        safe_metrics[condition]=m
    positives=[r for r in safe if r['score']==.5864923000335693]
    if positives:raise ValueError('SAFE_THRESHOLD_TIE_REQUIRES_EXPLICIT_METRICS')
    stability=[];invariance=[];correlations={};matched=[]
    names=['logWidth','logHeight','aspect','currentJpeg','DQTmean','contrast','sharpness','clipping','redMean','greenMean','blueMean']
    for r in a:
        spread=r['responseSpread'];cal=load_candidate('A1')[1]
        threshold=cal['originalThreshold'] if r['condition']=='original' else cal['worstThreshold']
        decisions=[x['response']>threshold for x in r['responses']]
        stability.append({'sampleId':r['sampleId'],'condition':r['condition'],'view':r['view'],'responses':[x['response'] for x in r['responses']],'spread':spread,'decisionDisagreement':len(set(decisions))>1})
        if r['condition']=='png_roundtrip':
            original=am[(r['sampleId'],'original',r['view'])]
            invariance.append({'sampleId':r['sampleId'],'tensorIdentical':r['tensorSha256']==original['tensorSha256'],'featureIdentical':r['featureSha256']==original['featureSha256'],'responsesIdentical':r['responses']==original['responses'],'interpretation':'LOSSLESS_VIEW_INVARIANCE_NOT_PROOF_OF_NO_PRIOR_JPEG'})
    for candidate in ('A0','A1','A2','B0','B1','NUISANCE'):
        rs=[r for r in scores if r['candidate']==candidate and r['view']=='reference']
        for condition in ('original','jpeg75'):
            for label in (0,1):
                sub=[r for r in rs if r['condition']==condition and r['label']==label]
                vals=[]
                for j,n in enumerate(names):
                    x=[bm[key(r)]['nuisance'][j] for r in sub];y=[r['score'] for r in sub]
                    rho=float(spearmanr(x,y).statistic) if len(set(x))>1 and len(set(y))>1 else None
                    vals.append({'nuisance':n,'spearman':rho,'N':len(sub)})
                correlations[f'{candidate}/{condition}/label{label}']=vals
        for r in [r for r in scores if r['candidate']==candidate and r['view']=='matched256']:
            reference=next(x for x in rs if x['sampleId']==r['sampleId'] and x['condition']==r['condition'])
            threshold=r['originalThreshold'] if r['condition']=='original' else r['worstThreshold']
            matched.append({'candidate':candidate,'sampleId':r['sampleId'],'condition':r['condition'],'referenceScore':reference['score'],'matchedScore':r['score'],'delta':r['score']-reference['score'],'decisionChanged':(r['score']>threshold)!=(reference['score']>threshold)})
    paired={};rng=np.random.default_rng(2026091907)
    for left,right in [('A1','A0'),('A2','A0'),('B0','A0'),('B1','B0')]:
        for label in (0,1):
            l={r['sampleId']:r for r in scores if r['candidate']==left and r['condition']=='original' and r['view']=='reference' and r['label']==label}
            rr={r['sampleId']:r for r in scores if r['candidate']==right and r['condition']=='original' and r['view']=='reference' and r['label']==label}
            ids=sorted(l)
            delta=np.array([int(l[s]['score']>l[s]['originalThreshold'])-int(rr[s]['score']>rr[s]['originalThreshold']) for s in ids])
            boot=delta[rng.integers(0,len(delta),(2000,len(delta)))].mean(1)
            paired[f'{left}-{right}/label{label}']={'N':len(ids),'positiveRateDifference':float(delta.mean()),'pairedParentBootstrap95':np.quantile(boot,[.025,.975]).tolist(),'limitation':'Descriptive parent resampling; few generators/devices and related templates make intervals optimistic; not broad family-generalization inference'}
    strata={}
    from scipy.optimize import linear_sum_assignment
    matching={}
    for condition in ('original','jpeg75'):
        negatives=sorted([r for r in b if r['condition']==condition and r['view']=='reference' and r['kind'].startswith('PHOTO_')],key=lambda r:r['sampleId'])
        synthetics=sorted([r for r in b if r['condition']==condition and r['view']=='reference' and r['label']==1],key=lambda r:r['sampleId'])
        columns=[0,1,2,5,6,7]
        scale=np.array([1.,1.,1.,.1,.01,.1])
        nx=np.array([r['nuisance'] for r in negatives])[:,columns]/scale
        sx=np.array([r['nuisance'] for r in synthetics])[:,columns]/scale
        cost=np.sqrt(((sx[:,None,:]-nx[None,:,:])**2).sum(2))
        si,ni=linear_sum_assignment(cost)
        pairs=[(synthetics[i],negatives[j],float(cost[i,j])) for i,j in zip(si,ni)]
        matching[condition]={'pairs':[{'synthetic':s['sampleId'],'photograph':n['sampleId'],'nuisanceDistance':d} for s,n,d in pairs],'definition':'One-to-one matching without candidate scores; fixed log-dimension/aspect/contrast/sharpness/clipping scales; does not establish same scene or causal identity','candidateHigher':{}}
        for name in ('A0','A1','A2','B0','B1','NUISANCE'):
            scoremap={key(r):r['score'] for r in scores if r['candidate']==name}
            matching[condition]['candidateHigher'][name]=sum(scoremap[key(s)]>scoremap[key(n)] for s,n,d in pairs)
            for variable,column,bounds in [('width',0,[math.log(512),math.log(1024),math.log(2048)]),('contrast',5,[.1,.2]),('sharpness',6,[.002,.01,.05])]:
                for index in range(len(bounds)+1):
                    subset=[r for r in scores if r['candidate']==name and r['view']=='reference' and r['condition']==condition and (r['label']==1 or r['kind'].startswith('PHOTO_')) and int(np.searchsorted(bounds,bm[key(r)]['nuisance'][column],side='right'))==index]
                    if len({r['label'] for r in subset})==2:
                        threshold=load_candidate(name)[1]['originalThreshold' if condition=='original' else 'worstThreshold']
                        strata[f'{name}/{condition}/{variable}/bin{index}']=summarize(subset,threshold)
    save(OUT/'matched-nuisance-controls.json',{'matching':matching,'strata':strata,'binsPredeclaredInCodeBeforeScoreInspection':True,'limitations':['Coarse nuisance matching, not identical content; large distances expose poor overlap rather than establish a match','All samples retain original processing-history uncertainty','No threshold, model or feature selection from these outcomes']})
    correlation={}
    for left,right in [('A1','A0'),('A2','A0'),('A1','B0'),('A2','B1'),('B0','B1')]:
        for condition in ('original','jpeg75'):
            for label in (0,1):
                l=sorted([r for r in scores if r['candidate']==left and r['condition']==condition and r['view']=='reference' and r['label']==label],key=key)
                rm={key(r):r for r in scores if r['candidate']==right}
                threshold='originalThreshold' if condition=='original' else 'worstThreshold'
                bins=Counter(('leftHigh' if r['score']>r[threshold] else 'leftLow')+'/'+('rightHigh' if rm[key(r)]['score']>rm[key(r)][threshold] else 'rightLow') for r in l)
                correlation[f'{left}/{right}/{condition}/label{label}']={'counts':dict(bins),'N':len(l),'spearmanScores':rank_correlation([r['score'] for r in l],[rm[key(r)]['score'] for r in l])}
    save(OUT/'error-correlation.json',{'comparisons':correlation,'interpretation':'Same-encoder A0/A1/A2 share representation and pretraining; no independence or corroboration authority inferred. Different encoders may also share upstream training exposure.'})
    latency={}
    for arm,rs in [('A',a),('B',b)]:
        x=[r['inferenceSeconds'] for r in rs if not r['tensorCacheReuse']]
        latency[arm]={'measuredCalls':len(x),'unit':'A clean plus3 noise forwards; B one vision forward; excludes decode/preprocessing','p50':float(np.quantile(x,.5)),'p95':float(np.quantile(x,.95)),'max':max(x),'run':read(OUT/('run-'+arm+'.json'))}
    head_latency={}
    for name in ('A0','B0','B1'):
        head,_=load_candidate(name);feature=(a if name=='A0' else b)[0]['feature'];times=[]
        for _ in range(100):
            t=time.perf_counter();infer(head,[feature]);times.append(time.perf_counter()-t)
        head_latency[name]={'p50Seconds':float(np.quantile(times,.5)),'p95Seconds':float(np.quantile(times,.95)),'maxSeconds':max(times),'notFullSystemCost':True}
    save(OUT/'group-metrics.json',{'candidates':groups,'SAFE':safe_metrics,'intervalUnit':'Condition-specific parents; device/generator/template dependence remains','sourceHash':sha(OUT/'candidate-score-rows.json')})
    save(OUT/'unique-safe-rescue.json',{'candidates':rescues,'interpretation':'Candidate-only and exact-condition rescue are distinct. ALL_DECLARED counts each parent once. SAFE is raw experimental reference, not authorized evidence on these unqualified conditions.'})
    save(OUT/'positive-parent-review.json',{'rows':case_rows,'review':'Structured row/input identity and inference audit; not visual origin adjudication'})
    save(OUT/'falsification-results.json',{'seedStability':stability,'seedDisagreementRows':sum(r['decisionDisagreement'] for r in stability),'pngInvariance':invariance,'nuisanceCorrelations':correlations,'matchedView':matched,'pairedBootstrap':paired,'knownLimitations':['No actual human-created digital-art/CGI controls','No independently unseen positive generator training family: training SD1 only','No exact same-scene real/synthetic causal pairs','Unobserved upstream pretraining membership','CSAFE versus DiffusionDB training source and label remain confounded; processed Unsplash is the independent-source challenge','A0 comparison legitimate but no trained combined A0+response model was authorized/fitted; incremental claims limited to paired observed errors']})
    save(OUT/'runtime-benchmark.json',{'extraction':latency,'headOnly':head_latency,'SAFE':read(OUT/'safe-reference-run.json'),'modelsBytes':3008373027,'precision':'CPU float32','threads':2,'batch':1,'workerCount':1,'totalCostNewPaidServices':0,'outputRows':len(scores),'codeHash':sha(__file__)})
    print(json.dumps({n:{c:{k:v['N'] for k,v in x.items() if k!='denominator'} for c,x in r.items()} for n,r in rescues.items() if n in ('A0','A1','A2','B0','B1')},indent=2))


if __name__=='__main__':main()
