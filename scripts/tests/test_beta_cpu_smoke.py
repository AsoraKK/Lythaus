import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('smoke', Path(__file__).parents[1] / 'authenticity/beta-cpu-smoke.py')
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class SmokeBoundaryTests(unittest.TestCase):
    def test_absolute_tolerance_cannot_be_relaxed_by_relative_field(self):
        manifest = {'absoluteTolerance': 1e-6, 'relativeTolerance': 1e-5}
        self.assertTrue(smoke.close_enough(1e-6, 0.0, manifest))
        self.assertFalse(smoke.close_enough(0.5 + 1.1e-6, 0.5, manifest))
        self.assertFalse(smoke.close_enough(float('nan'), 0.5, manifest))

    def test_approval_refusal_precedes_media_or_dependency_access(self):
        with self.assertRaisesRegex(ValueError, 'APPROVAL_REQUIRED'):
            smoke.prepare({'records': [{'sampleId': 'must-not-be-read'}]}, {})


if __name__ == '__main__':
    unittest.main()
