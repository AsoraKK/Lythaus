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

    def test_frozen_limits_are_required_before_fixture_access(self):
        approval = {
            'attendedRuntimeAuthorized': True,
            'computePolicySatisfied': True,
            'checkpointUseAuthorized': True,
            'fixtureUseAuthorized': True,
            'rightsEvidenceSha256': 'a' * 64,
            'runtimeEvidenceSha256': 'b' * 64,
            'preprocessingHash': 'c' * 64,
            'runtimeDigest': 'sha256:' + 'd' * 64,
            'sourceSha': 'e' * 40,
            'authorizationId': 'protocol-fixture-1',
            'checkpointSha256': 'wrong',
            'preprocessing': smoke.PREPROCESSING,
            'maxSafeAttempts': 16,
            'maxActiveMinutes': 30,
            'maxFileBytes': 10 * 1024 * 1024,
            'maxDecodedPixels': 16_777_216,
            'automaticRetries': False,
            'publicInferenceEndpoint': False,
            'expiresAtEpochSeconds': 4_102_444_800,
        }
        with self.assertRaisesRegex(ValueError, 'FROZEN_MODEL_IDENTITY_MISMATCH'):
            smoke.prepare({'records': [{'sampleId': 'must-not-be-read'}]}, approval)


if __name__ == '__main__':
    unittest.main()
