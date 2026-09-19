"""Numerical, isolation and research-boundary tests, no reserved media."""
import copy
import json
import unittest
from unittest.mock import patch
import numpy as np
import torch
from PIL import Image
from sklearn.metrics import average_precision_score, roc_auc_score
from wp007n_core import SAFE_HASH, SAFE_THRESHOLD, OUT, noise_for, seed_for, transform_for, response, controlled, array_hash, canonical
from wp007n_freeze import validate_roles, safe_path
from wp007n_analysis import wilson, fixed_metrics, fit_one, infer, model_digest, calibration


class CheapBackbone(torch.nn.Module):
    def forward(self,x):
        return x.flatten(1)[:,:16]+.1


class WP007NTests(unittest.TestCase):
    def row(self,sid="one",role="FIT",label=0):
        return dict(sampleId=sid,sourceFamilyId=sid,splitGroup=sid,sha256=sid,rootKey="CSAFE",relativePath="historical/test.jpg",role=role,label=label,trainingAllowed=True,rights="CC_BY_4.0_WITH_ATTRIBUTION",generatorFamily="STABLE_DIFFUSION_1X_DIFFUSIONDB" if label else None)

    def test_safe_hash_frozen(self):
        self.assertEqual(SAFE_HASH,"b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e")

    def test_safe_threshold_frozen(self):
        self.assertEqual(SAFE_THRESHOLD,.5864923000335693)

    def test_seed_label_blind(self):
        self.assertEqual(seed_for("a"*64,0),seed_for("a"*64,0))
        self.assertNotEqual(seed_for("a"*64,0),seed_for("a"*64,1))

    def test_seed_order_independent(self):
        a={k:seed_for(k,0) for k in ("x","y")}
        b={k:seed_for(k,0) for k in ("y","x")}
        self.assertEqual(a,b)

    def test_noise_replay(self):
        x=torch.zeros(1,3,16,16)
        self.assertTrue(torch.equal(noise_for(x,"x",0),noise_for(x,"x",0)))

    def test_rng_global_state_irrelevant(self):
        x=torch.zeros(1,3,16,16);a=noise_for(x,"x",0)
        torch.manual_seed(987);torch.randn(100)
        self.assertTrue(torch.equal(a,noise_for(x,"x",0)))

    def test_noise_scale_placement(self):
        m=CheapBackbone().eval();x=torch.ones(1,3,4,4)*2
        clean,measures=response(m,x,"same",1)
        changed=m(x+.05*noise_for(x,"same",0))
        expected=1-torch.nn.functional.cosine_similarity(m(x),changed).item()
        self.assertEqual(measures[0]["response"],expected)

    def test_no_clamping(self):
        x=torch.ones(1,3,4,4)*4
        seen=[]
        m=CheapBackbone();m.register_forward_pre_hook(lambda _,a:seen.append(a[0].clone()))
        response(m,x,"x",1)
        self.assertGreater(float(seen[1].max()),4)

    def test_zero_noise(self):
        m=CheapBackbone();x=torch.ones(1,3,4,4)
        with patch("wp007n_core.noise_for",return_value=torch.zeros_like(x)):
            _,r=response(m,x,"x",1)
        self.assertAlmostEqual(r[0]["response"],0,places=6)

    def test_image_normalization_A(self):
        x=transform_for("A")(Image.new("RGB",(400,300),(255,0,0)))
        self.assertEqual(tuple(x.shape),(3,224,224))
        self.assertAlmostEqual(float(x[0,0,0]),(1-.485)/.229,places=5)

    def test_image_normalization_B(self):
        x=transform_for("B")(Image.new("RGB",(40,30),(255,0,0)))
        self.assertEqual(float(x[0,0,0]),1)
        self.assertEqual(float(x[1,0,0]),-1)

    def test_png_invariance(self):
        x=Image.fromarray(np.random.default_rng(8).integers(0,256,(40,30,3),dtype=np.uint8))
        y,_=controlled(x,"png_roundtrip")
        self.assertEqual(array_hash(np.asarray(x)),array_hash(np.asarray(y)))

    def test_quantization_extracted(self):
        _,facts=controlled(Image.new("RGB",(50,40)),"jpeg75")
        self.assertEqual(facts["dqt"][0][0],8)
        self.assertEqual(facts["sampling"],2)

    def test_unfrozen_transform_rejected(self):
        with self.assertRaises(ValueError):controlled(Image.new("RGB",(8,8)),"jpeg64")

    def test_auc_ties(self):
        self.assertEqual(fixed_metrics([0,1],[.5,.5],.5)["AUROC"],.5)

    def test_threshold_ties(self):
        r=fixed_metrics([0,1],[.5,.5],.5)
        self.assertEqual((r["FP"],r["TP"]),(0,0))

    def test_ap_positive_orientation(self):
        self.assertEqual(fixed_metrics([0,1],[0,1],.5)["averagePrecision"],1)
        self.assertEqual(fixed_metrics([0,1],[1,0],.5)["averagePrecision"],.5)

    def test_wilson_known_answer(self):
        self.assertAlmostEqual(wilson(0,100)[1],.03699349820698568,places=12)
        self.assertEqual(wilson(0,0),None)

    def test_missing_scores_not_negatives(self):
        with self.assertRaises(ValueError):fixed_metrics([0,1],[0,float("nan")],.5)

    def test_duplicate_parents_rejected(self):
        with self.assertRaisesRegex(ValueError,"DUPLICATE_PARENT"):validate_roles([self.row(),self.row()])

    def test_duplicate_bytes_rejected(self):
        a=self.row();b=self.row("two");b["sha256"]=a["sha256"]
        with self.assertRaisesRegex(ValueError,"DUPLICATE_BYTES"):validate_roles([a,b])

    def test_family_split_rejected(self):
        a=self.row();b=self.row("two","EVAL_N");b["splitGroup"]=a["splitGroup"]
        with self.assertRaisesRegex(ValueError,"GROUP_CROSSES"):validate_roles([a,b])

    def test_prompt_split_rejected(self):
        a=self.row();b=self.row("two","EVAL_N");a["promptGroup"]=b["promptGroup"]="prompt"
        with self.assertRaisesRegex(ValueError,"GROUP_CROSSES"):validate_roles([a,b])

    def test_evaluation_only_training_rejected(self):
        a=self.row();a["trainingAllowed"]=False
        with self.assertRaisesRegex(ValueError,"RIGHTS"):validate_roles([a])

    def test_challenge_generator_fit_rejected(self):
        a=self.row(label=1);a["generatorFamily"]="Seedream-4"
        with self.assertRaisesRegex(ValueError,"GENERATOR_HELDOUT"):validate_roles([a])

    def test_reserved_path_rejected(self):
        a=self.row();a["relativePath"]="sameModelHoldout/a.jpg"
        with self.assertRaises(ValueError):safe_path(a)

    def test_flux2_rejected(self):
        a=self.row();a["sampleId"]="FLUX_2"
        with self.assertRaises(ValueError):safe_path(a)

    def test_path_escape_rejected(self):
        a=self.row();a["relativePath"]="../a.jpg"
        with self.assertRaises(ValueError):safe_path(a)

    def test_canonical_order(self):
        self.assertEqual(canonical({"a":1,"b":2}),canonical({"b":2,"a":1}))

    def test_array_identity_geometry(self):
        self.assertNotEqual(array_hash(np.zeros((2,4))),array_hash(np.zeros((4,2))))

    def test_head_serialization_and_train_only_scale(self):
        rng=np.random.default_rng(5)
        def rows(n,role):
            return [{"sampleId":role+str(i),"role":role,"label":i%2,"parent":{"trainingAllowed":True},"feature":rng.normal(size=8)+(i%2)} for i in range(n)]
        fit=rows(12,"FIT");dev=rows(8,"DEV")
        head=fit_one(fit,dev)
        self.assertLess(head["serializationMaxAbsError"],1e-12)
        x=np.array([r['feature'] for r in fit]);x=x/np.linalg.norm(x,axis=1,keepdims=True)
        np.testing.assert_allclose(head['mean'],x.mean(0),atol=1e-12)
        self.assertEqual(infer(head,[dev[0]['feature']])[0],infer(json.loads(json.dumps(head)),[dev[0]['feature']])[0])

    def test_hash_excludes_runtime_only(self):
        self.assertEqual(model_digest({"coefficient":[1],"fitSeconds":1}),model_digest({"coefficient":[1],"fitSeconds":2}))

    def test_head_fitting_rights_enforced(self):
        r={"sampleId":"x","role":"EVAL_N","parent":{"trainingAllowed":False}}
        with self.assertRaisesRegex(ValueError,"UNAUTHORIZED"):fit_one([r],[r])

    def test_calibration_requires_full_conditions(self):
        rows=[{"sampleId":str(i),"role":"CALIBRATION","view":"reference","label":0,"condition":"original"} for i in range(8)]
        with self.assertRaisesRegex(ValueError,"INCOMPLETE"):calibration("A1",rows)

    def test_no_production_permission(self):
        p=json.loads((OUT/"protocol.json").read_text())
        self.assertEqual(p['productionAuthorization'],'NO')
        self.assertEqual(p['flux2Access'],0)
        self.assertEqual(p['futureEf2ReserveAccess'],0)


if __name__=="__main__":unittest.main()
