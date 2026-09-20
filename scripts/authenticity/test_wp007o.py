"""Public numeric fixtures only; never loads project media or private results."""
import copy
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
from PIL import Image
from wp007o_core import validate_rows,threshold_from,freeze,sealed,digest,CONDITIONS,HEAD_HASH,MODEL_HASH
from wp007o_run import nuisance
from wp007o_results import aggregate,rescue
from wp007n_core import SAFE_HASH,SAFE_THRESHOLD,controlled
from wp007n_analysis import fixed_metrics,infer,wilson
import wp007o_numeric_audit as audit
import wp007o_core as core
import wp007o_run as runner


class OTests(unittest.TestCase):
    def row(self,sid='a',role='CALIBRATION_NEGATIVES'):
        return dict(sampleId=sid,sourceFamilyId=sid,sha256=sid,decodedRgbSha256=sid,role=role,label=0,splitGroups=[sid],rootKey='CSAFE',relativePath='historical/fixture.jpg',rights={'evaluationAllowed':True,'calibrationAllowed':True,'headFittingAllowed':False})

    def scores(self):return [dict(sampleId='a',role='CALIBRATION_NEGATIVES',label=0,condition=c,score=.2+i*.1) for i,c in enumerate(CONDITIONS)]

    def test_safe_identity(self):
        self.assertEqual(SAFE_HASH,'b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e');self.assertEqual(SAFE_THRESHOLD,.5864923000335693)

    def test_candidate_identity(self):
        self.assertEqual(HEAD_HASH,'898ad9cb29da6ecba5081ed5c8db941d6a0fa59f82d6dc1660fcf5e3d0a92713');self.assertEqual(MODEL_HASH,'0a5c220aa083488e0fc9221f766dced8a576b7074662d9b9da923da1e8844fce')

    def test_roles_pass(self):validate_rows([self.row(),self.row('b','EVAL_NEGATIVES')])

    def test_parent_duplicate(self):
        with self.assertRaisesRegex(ValueError,'DUPLICATE'):validate_rows([self.row(),self.row()])

    def test_device_split(self):
        a=self.row();b=self.row('b','EVAL_NEGATIVES');b['splitGroups']=a['splitGroups']
        with self.assertRaisesRegex(ValueError,'GROUP_CROSSES'):validate_rows([a,b])

    def test_photographer_split(self):
        a=self.row();b=self.row('b','EVAL_NEGATIVES');a['splitGroups']=b['splitGroups']=['photographer:p']
        with self.assertRaisesRegex(ValueError,'GROUP_CROSSES'):validate_rows([a,b])

    def test_decoded_duplicate(self):
        a=self.row();b=self.row('b','EVAL_NEGATIVES');b['decodedRgbSha256']='a'
        with self.assertRaisesRegex(ValueError,'DUPLICATE_DECODED'):validate_rows([a,b])

    def test_eval_only_not_calibration(self):
        a=self.row();a['rights']['calibrationAllowed']=False
        with self.assertRaisesRegex(ValueError,'CALIBRATION_RIGHTS'):validate_rows([a])

    def test_synthetic_not_calibration(self):
        a=self.row();a['label']=1
        with self.assertRaisesRegex(ValueError,'CALIBRATION_RIGHTS'):validate_rows([a])

    def test_no_head_fitting(self):
        a=self.row();a['rights']['headFittingAllowed']=True
        with self.assertRaisesRegex(ValueError,'FITTING_BOUNDARY'):validate_rows([a])

    def test_reserve_forbidden(self):
        for key in ['FLUX_2','flux2']:
            a=self.row(key)
            with self.assertRaisesRegex(ValueError,'RESERVE'):validate_rows([a])

    def test_device_reserve_forbidden(self):
        a=self.row();a['relativePath']='sameModelHoldout/a.jpg'
        with self.assertRaisesRegex(ValueError,'RESERVE_PATH'):validate_rows([a])

    def test_worst_source_threshold(self):
        value,worst=threshold_from(self.scores(),1e-12)
        self.assertEqual(value,max(r['score'] for r in self.scores())+1e-12);self.assertEqual(len(worst),1)

    def test_calibration_cannot_read_eval(self):
        a=self.scores();a[0]['role']='EVAL_NEGATIVES'
        with self.assertRaisesRegex(ValueError,'CALIBRATION_ONLY'):threshold_from(a,1e-12)

    def test_epsilon_positive(self):
        with self.assertRaisesRegex(ValueError,'EPSILON'):threshold_from(self.scores(),0)

    def test_epsilon_must_increase_float(self):
        with self.assertRaisesRegex(ValueError,'EPSILON_DOES_NOT_INCREASE'):threshold_from(self.scores(),1e-300)

    def test_parent_aggregation_rejects_partial_matrix(self):
        with self.assertRaisesRegex(ValueError,'PARENT_CONDITIONS'):aggregate(self.scores()[:-1],'max')

    def test_parent_aggregation_rejects_unknown_mode(self):
        with self.assertRaisesRegex(ValueError,'AGGREGATE_MODE'):aggregate(self.scores(),'typo')

    def test_parent_aggregation_rejects_missing(self):
        rows=self.scores();rows[0]['score']=None
        with self.assertRaisesRegex(ValueError,'PARENT_MISSING'):aggregate(rows,'max')

    def test_parent_aggregation_label_conflict(self):
        rows=self.scores();rows[0]['label']=1
        with self.assertRaisesRegex(ValueError,'PARENT_LABEL'):aggregate(rows,'max')

    def test_complete_conditions_required(self):
        with self.assertRaisesRegex(ValueError,'INCOMPLETE'):threshold_from(self.scores()[:-1],1e-12)

    def test_duplicate_condition(self):
        a=self.scores();a.append(a[0])
        with self.assertRaisesRegex(ValueError,'DUPLICATE'):threshold_from(a,1e-12)

    def test_missing_score_explicit(self):
        a=self.scores();a[0]['score']=None
        with self.assertRaisesRegex(ValueError,'MISSING'):threshold_from(a,1e-12)

    def test_nan_rejected(self):
        a=self.scores();a[0]['score']=float('nan')
        with self.assertRaises(ValueError):threshold_from(a,1e-12)

    def test_fpr_parent_denominator(self):
        a=self.scores();a[0]['score']=.9
        self.assertEqual(fixed_metrics([0],[aggregate(a,'max')[0]['score']],.8)['negativeN'],1)

    def test_threshold_strict_ties(self):
        m=fixed_metrics([0,1],[.5,.5],.5);self.assertEqual((m['TP'],m['FP']),(0,0));self.assertEqual(m['AUROC'],.5)

    def test_ap_orientation(self):self.assertEqual(fixed_metrics([0,1],[0,1],.5)['averagePrecision'],1.)

    def test_wilson(self):self.assertAlmostEqual(wilson(0,100)[1],.03699349820698568,places=12)

    def test_frozen_head_arithmetic(self):
        h={'mean':[0,0],'scale':[1,1],'coefficient':[0,1],'intercept':0};self.assertAlmostEqual(infer(h,[[0,2]])[0],1/(1+np.exp(-1)))

    def test_freeze_immutable(self):
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'x.json';freeze(p,{'a':1});self.assertEqual(sealed(p)['a'],1)
            with self.assertRaises(ValueError):freeze(p,{'a':2})

    def test_serialization_key_order(self):self.assertEqual(digest({'a':1,'b':2}),digest({'b':2,'a':1}))

    def test_codec_known_answer(self):
        im,facts=controlled(Image.new('RGB',(64,48)),'jpeg75');self.assertEqual(facts['dqt'][0][0],8);self.assertEqual(facts['sampling'],2)

    def test_resize_full_geometry(self):
        im,f=controlled(Image.new('RGB',(400,200)),'resize75');self.assertEqual(im.size,(300,150));self.assertEqual(f['operationScope'],'FULL_DECODED_UPLOAD')

    def test_flat_nuisance(self):
        n=nuisance(Image.new('RGB',(40,30),(128,128,128)),{});self.assertEqual(n['sharpness320'],0);self.assertEqual(n['saturation320'],0)

    def test_rescue_exact_source_join(self):
        r=dict(sampleId='a',sourceFamilyId='a',role='EVAL_SYNTHETICS',label=1,kind='SYNTHETIC',generatorFamily='f',condition='original',decodedRgbSha256='x',sourceHash='x',score=.9)
        s=dict(r,sourceHash='other',score=.1)
        with self.assertRaisesRegex(ValueError,'EXACT_VIEW'):rescue([r],[s],.5)

    def test_unique_source_rescue(self):
        rows=[dict(sampleId='a',sourceFamilyId='a',role='EVAL_SYNTHETICS',label=1,kind='SYNTHETIC',generatorFamily='f',condition=c,decodedRgbSha256='x',sourceHash='x',score=.9) for c in CONDITIONS]
        out=rescue(rows,[dict(r,score=.1) for r in rows],.5);self.assertEqual(out['groups']['all']['distinctRescuedParents'],1)

    def test_rescue_duplicate_join_rejected(self):
        rows=self.scores();rows.append(rows[0])
        with self.assertRaisesRegex(ValueError,'DUPLICATE_JOIN'):rescue(rows,rows,.5)

    def test_rescue_coverage_rejected(self):
        with self.assertRaisesRegex(ValueError,'JOIN_COVERAGE'):rescue(self.scores(),self.scores()[:-1],.5)

    def test_independent_auc_and_ap_ties(self):
        y=[0,1,0,1,0,1];s=[.2,.2,.5,.5,.5,.8]
        m=fixed_metrics(y,s,.6);auc,ap=audit.ranking(y,s)
        self.assertAlmostEqual(auc,m['AUROC']);self.assertAlmostEqual(ap,m['averagePrecision'])

    def test_independent_source_threshold(self):
        t,parents=audit.max_negative_threshold(self.scores(),1e-12)
        self.assertEqual(t,threshold_from(self.scores(),1e-12)[0]);self.assertEqual(len(parents),1)

    def test_independent_wilson_fixture(self):self.assertEqual(audit.wilson(0,100),wilson(0,100))

    def test_independent_missing_score(self):
        with self.assertRaises(ValueError):audit.ranking([0,1],[None,.4])

    def test_independent_direction(self):self.assertEqual(audit.ranking([0,1],[.1,.9]),(1.,1.))

    def test_independent_continuous_safe_ranking(self):
        m=audit.metrics([{'label':0,'score':.1},{'label':1,'score':.2}],.5,True)
        self.assertEqual((m['TP'],m['FP'],m['AUROC']),(0,0,1.))

    def test_independent_inclusive_vs_strict(self):
        rows=[{'label':0,'score':.5},{'label':1,'score':.5}]
        self.assertEqual(audit.metrics(rows,.5)['FP'],0);self.assertEqual(audit.metrics(rows,.5,True)['FP'],1)

    def test_independent_head_fixture(self):
        h={'mean':[0.]*1024,'scale':[1.]*1024,'coefficient':[.2]*1024,'intercept':-.1};v=[float(i%7+1) for i in range(1024)]
        self.assertAlmostEqual(audit.head_score(v,h),float(infer(h,[v])[0]),places=12)

    def test_private_runtime_namespace_not_used(self):self.assertEqual(core.RUNTIME.name,'lythaus-wp007o-methodology-runtime')

    def test_no_dataset_selector(self):
        from pathlib import Path
        self.assertFalse(Path(__file__).with_name('wp007o_prepare.py').exists())

    def test_cache_model_mismatch(self):
        parent=self.row();packet={'cohortHash':'c','protocolHash':'p','sourceHash':'a','arm':'PE','checkpointHash':'wrong','headHash':core.HEAD_HASH}
        with patch.object(runner,'cache_path') as path,patch.object(runner,'sealed',return_value=packet):
            path.return_value.exists.return_value=True
            with self.assertRaisesRegex(ValueError,'CACHE_MODEL_IDENTITY'):runner.cache_read(parent,'PE',{'freezeHash':'c'},{'freezeHash':'p'})

    def test_public_cli_stopped(self):
        from pathlib import Path
        import subprocess,sys
        result=subprocess.run([sys.executable,str(Path(__file__).with_name('wp007o_run.py'))],capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0);self.assertIn('RESEARCH_STOPPED',result.stderr)


if __name__=='__main__':unittest.main()
