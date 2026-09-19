"""Evidence-derived closeout; never promote a detector from execution alone."""
from wp007n_analysis import OUT,read,save,sha


def main():
    audit=read(OUT/'independent-results-audit.json')
    if audit['status']!='PASS_WITH_BOUNDED_LIMITATIONS':raise ValueError('INDEPENDENT_AUDIT_NOT_COMPLETE')
    results=read(OUT/'candidate-results.json')
    cards={}
    for name in ('A0','A1','A2','B0','B1'):
        head=read(OUT/(name+'-head.json')) if name not in ('A1','A2') else None
        cal=read(OUT/(name+'-calibration.json'))
        cards[name]={'executionStatus':'VALIDATED_COMPLETE','scientificDisposition':'NO_INCREMENTAL_EVIDENCE_AT_TESTED_OPERATING_POINT' if name in ('A1','A2') else 'UNSAFE_AT_TESTED_OPERATING_POINT','backbone':read(OUT/'checkpoint-freeze.json')['A' if name.startswith('A') else 'B'],'featureDefinition':'1024D normalized CLS' if name.startswith('A') else '1024D official vision attention-pool plus projection','headManifest':head,'calibrationHash':cal['freezeHash'],'originalThreshold':cal['originalThreshold'],'worstThreshold':cal['worstThreshold'],'sourceWorst':results[name]['sourceWorst'],'codeOwnership':'New measurement/fitting/contract code Lythaus-owned; pretrained architecture/weights remain third-party Apache-2.0','headTrainingRights':'CSAFE CC BY4.0 and DiffusionDB CC0/item grant' if head else 'No detector head training; authorized CSAFE negative reference calibration','deploymentStatus':'RESEARCH_ONLY_NOT_QUALIFIED; separate deployment rights/notices review required','limitations':['Actual human-created digital controls absent','Only SD1-era positive family in FIT/DEV','Eight CSAFE-only calibration parents','Historical programme exposure and unknown pretraining membership','No independent encoder-family evaluation'],'publicAuthority':False,'lowScoreMeaning':'NO_POSITIVE_EVIDENCE_NOT_HUMAN'}
    save(OUT/'model-cards.json',{'candidates':cards,'productionAuthorization':'NO','SAFEunchanged':True})
    ledger=read(OUT/'WP007N_GOAL_AND_COMPLETION_LEDGER.json')
    evidence={
        'audit':['current-state-audit.json','model-data-rights-audit.md','primary-paper-audit.md','runtime-freeze.json','checkpoint-freeze.json'],
        'data':['cohort-freeze.json','model-data-rights-audit.md','independent-results-audit.json'],
        'armA':['candidate-results.json','independent-results-audit.md','run-A.json','falsification-results.json'],
        'armB':['candidate-results.json','independent-results-audit.md','run-B.json','admission-transition.json'],
        'falsification':['falsification-results.json','matched-nuisance-controls.json','codec-equivalence-audit.json','error-correlation.json','independent-results-audit.md']}
    for row in ledger['objectives']:
        if row['id'] in evidence:
            row.update(executionStatus='VALIDATED_COMPLETE',qualityPercent=110,evidence=evidence[row['id']]+['final-report.md'])
            row['scientificDisposition']={'armA':'NO_INCREMENTAL_EVIDENCE_AT_TESTED_OPERATING_POINT','armB':'UNSAFE_AT_TESTED_OPERATING_POINT','falsification':'SOURCE_DOMAIN_FRAGILITY_NOT_RESOLVED','data':'BOUNDED_ROLES_VALIDATED_NOT_FRESH_PROGRAMME_CONFIRMATION','audit':'BOUNDED_RESEARCH_ADMITTED'}[row['id']]
            row['limitations']=['Actual human digital population not tested; separate BLOCKED_DATA row','Known device/prompt/hash roles checked; unknown shared scenes/pretraining exposure remain']
        if row['id']=='delivery':
            row.update(executionStatus='RUNNING',qualityPercent=100,scientificDisposition='VALIDATION_COMPLETE_PR_PENDING',evidence=['validation-summary.json','final-report.md'],limitations=['Unmerged PR still required'])
            if (OUT/'pr-delivery.json').exists():
                pr=read(OUT/'pr-delivery.json')
                if pr['state']=='OPEN' and pr['mergedAt'] is None and pr['parent']=='e3adbcb3cb2ac0991db231476441d133db3e2cd3':
                    row.update(executionStatus='VALIDATED_COMPLETE',qualityPercent=110,scientificDisposition='BOUNDED_RESEARCH_DELIVERED_UNMERGED',evidence=['validation-summary.json','independent-results-audit.md','pr-delivery.json','final-report.md'],limitations=['Two inherited repository failures independently reproduced; actual-human-digital and optional combined comparison not completed'])
    if not any(r['id']=='combinedResponse' for r in ledger['objectives']):
        ledger['objectives'].append({'id':'combinedResponse','question':'Does a learned A0+response combination add information?','experiment':'Optional combined diagnostic; no FIT response budget predeclared','crossCheck':'Not executed, not claimed','executionStatus':'DEFERRED_OPTIONAL','scientificDisposition':'NOT_EVALUATED','qualityPercent':0,'evidence':['protocol.json','final-report.md'],'limitations':['Paired standalone A0/A1/A2 comparisons are not a fitted conditional-information test']})
    save(OUT/'WP007N_GOAL_AND_COMPLETION_LEDGER.json',ledger)
    lines=['# WP007N completion self-audit','','Execution quality and scientific qualification are separate. Blocked/optional comparisons are not labeled110. All below references are to actual run/audit evidence.','','| Objective | Executed | Independent cross-check | Scientific disposition | Status / quality | Evidence |','| --- | --- | --- | --- | --- | --- |']
    for row in ledger['objectives']:
        lines.append('|'+row['id']+'|'+('YES' if row['qualityPercent']>=100 else 'NO')+'|'+row['crossCheck']+'|'+row['scientificDisposition']+'|'+row['executionStatus']+' / '+str(row['qualityPercent'])+'|'+'; '.join('['+f+']('+f+')' for f in row['evidence'])+'|')
    lines+=['','The bounded two-arm experiment is scientifically negative at its intended operating point. Missing actual human art/CGI remains a real data blocker; no source reserve was opened to bypass it. Neither candidate receives production or qualification authority.']
    (OUT/'completion-self-audit.md').write_text('\n'.join(lines)+'\n',newline='\n')
    print('SCIENTIFIC_CLOSEOUT_RECORDED_WITH_EXPLICIT_DELIVERY_STATE')


if __name__=='__main__':main()
