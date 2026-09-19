"""Evaluation-derived ROC capacity only; never an operational threshold."""
from wp007n_analysis import OUT,read,save,sha


def main():
    rows=read(OUT/'candidate-score-rows.json')['rows'];result={}
    for name in ('A0','A1','A2','B0','B1'):
        result[name]={}
        for condition in ('original','jpeg75'):
            subset=[r for r in rows if r['candidate']==name and r['condition']==condition and r['view']=='reference']
            cut=max(r['score'] for r in subset if r['label']==0)
            result[name][condition]={'TP':sum(r['score']>cut for r in subset if r['label']==1),'positiveN':20,'negativeN':28,'observedFP':0,'source':'Evaluation ranking itself; maximum evaluation negative; strict ties negative','notCalibrated':True,'notAnAdmissibleOperatingPoint':True}
    save(OUT/'descriptive-rank-capacity.json',{'results':result,'purpose':'Diagnostic ranking capacity at zero observed evaluation FP. This deliberately uses evaluation labels and cannot replace any frozen threshold, demonstrate specificity, or qualify a candidate. No cuts are exported.','codeHash':sha(__file__)})


if __name__=='__main__':main()
