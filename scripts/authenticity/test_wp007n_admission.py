"""Admission abuse cases independent of scientific scores/media."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from wp007n_guards import ForwardBudget,validate_head_schema


class AdmissionTests(unittest.TestCase):
    def test_exclusive_budget_lock(self):
        with tempfile.TemporaryDirectory() as directory,patch('wp007n_guards.RUNTIME',Path(directory)),patch('wp007n_guards.OUT',Path(directory)):
            b=ForwardBudget('A',{'scientificLimits':{'AForwardPasses':1}})
            with self.assertRaisesRegex(RuntimeError,'EXCLUSIVE_LOCK'):
                ForwardBudget('A',{'scientificLimits':{'AForwardPasses':1}})
            with patch('wp007n_guards.guard'):
                b.before_forward()
                with self.assertRaisesRegex(RuntimeError,'BUDGET'):
                    b.before_forward()
            b.finish({'purpose':'failure-accounting-fixture'})
            state=json.loads((Path(directory)/'budget-A.json').read_text())
            self.assertEqual(state['forwards'],1)
            self.assertTrue(state['runs'][0]['ambiguousForwardCharged'])

    def test_head_semantics(self):
        head={'backbone':'A','featureKey':'feature','classes':[0,1],'permutation':False,'mean':[0.]*1024,'scale':[1.]*1024,'coefficient':[0.]*1024,'intercept':0.}
        validate_head_schema('A0',head,{})
        for field,value in [('backbone','B'),('classes',[1,0]),('permutation',True),('scale',[0.]*1024),('coefficient',[0.])]:
            with self.subTest(field=field),self.assertRaises(ValueError):
                validate_head_schema('A0',head|{field:value},{})

    def test_response_cannot_have_head(self):
        with self.assertRaises(ValueError):validate_head_schema('A1',{}, {'headHash':'unexpected'})


if __name__=='__main__':unittest.main()
