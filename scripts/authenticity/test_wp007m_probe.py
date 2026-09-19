import unittest
from pathlib import Path
import numpy as np
from scipy.stats import spearmanr
import pywt
from sklearn.metrics import roc_auc_score
from wp007m_probe import haar, corr, measure, wilson, allowed, validate_roles, SAFE_HASH, SAFE_THRESHOLD, digest


class ProbeTests(unittest.TestCase):
    def test_haar_independent_pywavelets(self):
        a=np.random.default_rng(9).normal(size=(256,256))
        for _ in range(3):
            low,b=haar(a);other,(h,v,d)=pywt.dwt2(a,"haar",mode="periodization")
            np.testing.assert_allclose(low,other,atol=1e-14)
            for x,y in zip(b,[v,h,d]):np.testing.assert_allclose(x,y,atol=1e-14)
            self.assertAlmostEqual(float(np.sum(a*a)),float(np.sum(low*low)+sum(np.sum(x*x) for x in b)),places=9)
            a=low

    def test_haar_known(self):
        low,b=haar(np.array([[1.,2.],[3.,4.]]))
        self.assertEqual(float(low[0,0]),5)
        self.assertEqual([float(x[0,0]) for x in b],[-1,-2,0])

    def test_corr_scipy_and_ties(self):
        from scipy.stats import rankdata
        x=[1,1,2,3,5];y=[4,3,2,1,1]
        self.assertAlmostEqual(corr(rankdata(x),rankdata(y)),spearmanr(x,y).statistic)
        self.assertEqual(roc_auc_score([0,1,0,1],[.5,.5,.5,.5]),.5)

    def test_wilson_known(self):
        self.assertAlmostEqual(wilson(0,400)["ci95"][1],.009512294334296512)
        self.assertAlmostEqual(wilson(4,800)["rate"],.005)
        self.assertIsNone(wilson(0,0)["ci95"])

    def test_determinism_and_constant_missingness(self):
        rgb=np.random.default_rng(7).integers(0,256,(256,256,3),dtype=np.uint8)
        self.assertEqual(digest(measure(rgb)),digest(measure(rgb)))
        self.assertTrue(all(x is None for x in measure(np.zeros_like(rgb))[0].values()))

    def test_null_preserves_marginals(self):
        a=np.random.default_rng(8).normal(size=(32,32))
        np.testing.assert_array_equal(np.sort(a.ravel()),np.sort(np.roll(a,(10,6),(0,1)).ravel()))

    def test_invalid_missing(self):
        with self.assertRaises(ValueError):measure(np.zeros((8,8)))
        with self.assertRaises(ValueError):measure(np.full((256,256,3),np.nan))

    def test_reserves_and_escape_before_open(self):
        for name in ["FLUX_2/a.jpg","x/flux.2.jpg","sealed/a.jpg","future/a.jpg","../escape.jpg","C:/outside.jpg"]:
            with self.assertRaises(ValueError):allowed(Path.cwd(),name)

    def test_split_and_duplicate(self):
        a={"sampleId":"a","sha256":"a","sourceFamilyId":"x","splitGroup":"g","role":"DISCOVERY"}
        b={**a,"sampleId":"b","sha256":"b","role":"HELDOUT"}
        with self.assertRaises(ValueError):validate_roles([a,b])
        with self.assertRaises(ValueError):validate_roles([a,a])

    def test_safe_identity(self):
        self.assertEqual(SAFE_THRESHOLD,.5864923000335693)
        self.assertEqual(SAFE_HASH,"b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e")

    def test_source_worst_case_denominator(self):
        from wp007m_analyze import worst
        r={"sampleId":"parent1","label":0,"kind":"PHOTO","splitGroup":"device","features":{"v":.9},"baseline":{"v":.1},"safeScore":.1}
        rules={"features":{"key":"v","absolute":False,"threshold":.5},"baseline":{"key":"v","absolute":False,"threshold":.5}}
        out=worst([r,r,r],rules)
        self.assertEqual(out["ALL"]["features"]["n"],1)
        self.assertEqual(out["ALL"]["features"]["k"],1)

    def test_strict_threshold_and_missing(self):
        from wp007m_analyze import hit
        rule={"key":"v","absolute":True,"threshold":.5}
        self.assertFalse(hit({"features":{"v":.5}},rule))
        self.assertFalse(hit({"features":{"v":None}},rule))
        self.assertTrue(hit({"features":{"v":-.6}},rule))

    def test_lineage_and_supplement_fail_closed(self):
        import copy
        from wp007m_probe import OUT,load,CONDITIONS
        from wp007m_integrity import validate_matrix,enrich_safe
        co=load(OUT/"cohort-freeze.json")
        with self.assertRaises(ValueError):validate_matrix(co,[],"HELDOUT")
        mutated=copy.deepcopy(co);mutated["rows"][0]["label"]=1
        with self.assertRaises(ValueError):validate_matrix(mutated,[],"HELDOUT")
        with self.assertRaises(ValueError):enrich_safe([], [{"sampleId":"unknown","condition":"ORIGINAL"}])

    def test_authoritative_fields_and_code_identity(self):
        import copy
        from wp007m_probe import OUT,load,filehash
        from wp007m_integrity import validate_matrix,enrich_safe,COMPATIBLE_CODE_HASHES
        co=load(OUT/"cohort-freeze.json")
        m=next(r for r in co["rows"] if r["role"]=="HELDOUT")
        base={"sampleId":m["sampleId"],"condition":"ORIGINAL","cohortHash":co["freezeHash"],"inputSha256":m["sha256"],"codeHash":next(iter(COMPATIBLE_CODE_HASHES)),"safeHash":SAFE_HASH,"safeThreshold":SAFE_THRESHOLD,"safeScore":.2,"productionAuthorization":"NO","features":{"v":.1}}
        for field in ["generatorFamily","subtype","sourceDataset","rights","role","label"]:
            r=copy.deepcopy(base);r[field]="FORGED"
            with self.assertRaisesRegex(ValueError,"METADATA_OVERRIDE"):validate_matrix(co,[r],"HELDOUT")
        r={**base,"runnerCodeHash":"wrong"}
        with self.assertRaisesRegex(ValueError,"RUNNER_HASH_MISMATCH"):validate_matrix(co,[r],"HELDOUT")
        s={"sampleId":m["sampleId"],"condition":"ORIGINAL","codeHash":"wrong","pixelHash":"p","sourceSha256":m["sha256"],"cohortHash":co["freezeHash"],"safeHash":SAFE_HASH,"safeScore":.3,"safeMs":1}
        with self.assertRaisesRegex(ValueError,"SUPPLEMENT_CODE_MISMATCH"):enrich_safe([], [s])


if __name__=="__main__":unittest.main()
