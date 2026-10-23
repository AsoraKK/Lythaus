import importlib.util
import json
import os
from pathlib import Path
import signal
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('smoke', Path(__file__).parents[1] / 'authenticity/beta-cpu-smoke.py')
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class SmokeBoundaryTests(unittest.TestCase):
    def run_transport_fixture(self, status='OK', failure_index=None, before_open_elapsed=None, response_elapsed=0, delay_index=None, open_elapsed=0):
        clock = [0.0]
        calls = []
        approval = {'sourceSha': 'a' * 40, 'runtimeDigest': 'sha256:' + 'b' * 64,
                    'preprocessingHash': 'c' * 64, 'maxActiveMinutes': 30}
        records = [({'sampleId': f'protocol-{index}', 'descendant': index >= 8,
                     'historicalScore': 0.5, 'groundTruth': 0}, b'protocol-private-bytes') for index in range(16)]

        class Response:
            def __init__(self, request, selected_status, index):
                self.index = index
                binding = json.loads(request.get_header('X-beta-binding'))
                self.body = json.dumps({'result': {**binding, 'checkpoint': smoke.CHECKPOINT,
                    'runtimeDigest': approval['runtimeDigest'], 'preprocessingHash': approval['preprocessingHash'],
                    'preprocessing': smoke.PREPROCESSING, 'schemaVersion': 'lythaus-authenticity-beta-v0.1.0',
                    'status': selected_status, 'score': 0.5 if selected_status == 'OK' else None}}).encode()

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, limit):
                if delay_index is None or self.index == delay_index:
                    clock[0] += response_elapsed
                return self.body[:limit]

        class Opener:
            def open(self, request, timeout):
                selected = status if len(calls) == failure_index else 'OK'
                calls.append(timeout)
                clock[0] += open_elapsed
                return Response(request, selected, len(calls) - 1)

        ticks = [0]

        def monotonic():
            ticks[0] += 1
            if before_open_elapsed is not None and ticks[0] >= 3:
                clock[0] = max(clock[0], before_open_elapsed)
            return clock[0]

        with tempfile.TemporaryDirectory(prefix='lythaus-image-smoke-protocol-') as directory:
            root = Path(directory)
            approval_path = root / 'approval.json'
            receipt_path = root / 'receipt.json'
            approval_path.write_text(json.dumps(approval))
            argv = ['beta-cpu-smoke.py', '--approval', str(approval_path), '--receipt', str(receipt_path)]
            with patch('sys.argv', argv), patch.dict(os.environ, {'AUTHENTICITY_BETA_DISPATCH_SECRET': 'synthetic-not-a-secret'}), \
                    patch.object(smoke, 'prepare', return_value=records), \
                    patch.object(smoke.time, 'monotonic', side_effect=monotonic), \
                    patch.object(smoke.urllib.request, 'build_opener', return_value=Opener()):
                code = smoke.main()
            return code, json.loads(receipt_path.read_text()), calls

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

    def test_every_structured_unavailable_status_stops_on_originals_and_descendants(self):
        statuses = ['UNSUPPORTED', 'TIMEOUT', 'CHECKSUM_MISMATCH', 'DECODE_FAILURE', 'UNAVAILABLE',
                    'INVALID_OUTPUT', 'BLOCKED_RIGHTS', 'BLOCKED_RUNTIME']
        for status in statuses:
            for failure_index in [0, 8]:
                with self.subTest(status=status, descendant=failure_index == 8):
                    code, receipt, calls = self.run_transport_fixture(status, failure_index)
                    self.assertEqual(code, 1)
                    self.assertEqual(len(calls), failure_index + 1)
                    self.assertEqual(receipt['state'], 'MODEL_UNAVAILABLE_STOPPED')
                    attempt = receipt['attempts'][-1]
                    self.assertEqual(attempt['state'], 'MODEL_UNAVAILABLE_NO_RETRY')
                    self.assertEqual(attempt['modelStatus'], status)
                    self.assertIsNone(attempt['rawScore'])
                    self.assertIsNone(attempt['parity'])
                    self.assertEqual(receipt['rawClassifierCountsHistoricalReuseOnly']['unavailable'], 1 if failure_index == 0 else 0)

    def test_successful_descendants_still_abstain_and_do_not_enter_historical_counts(self):
        code, receipt, calls = self.run_transport_fixture()
        self.assertEqual(code, 0)
        self.assertEqual(len(calls), 16)
        self.assertEqual(receipt['state'], 'CPU_SMOKE_COMPLETE_NOT_APP_ACCEPTANCE')
        self.assertTrue(all(attempt['interpretation'] == 'ABSTAIN_DEGRADED' and attempt['parity'] is None
                            for attempt in receipt['attempts'][8:]))
        self.assertEqual(receipt['rawClassifierCountsHistoricalReuseOnly']['TN'], 8)

    def test_dispatch_timeout_cannot_exceed_remaining_active_time(self):
        code, receipt, calls = self.run_transport_fixture(before_open_elapsed=1799.75)
        self.assertEqual(code, 0)
        self.assertEqual(len(calls), 16)
        self.assertTrue(all(timeout == 0.25 for timeout in calls))
        self.assertEqual(receipt['state'], 'CPU_SMOKE_COMPLETE_NOT_APP_ACCEPTANCE')

    def test_late_valid_response_is_not_completed_and_stops_further_calls(self):
        code, receipt, calls = self.run_transport_fixture(before_open_elapsed=1799.75, response_elapsed=0.25)
        self.assertEqual(code, 1)
        self.assertEqual(calls, [0.25])
        self.assertEqual(receipt['state'], 'TIME_BOUND_EXHAUSTED')
        self.assertEqual(receipt['attempts'][-1]['state'], 'DEADLINE_EXCEEDED_NO_RETRY')
        self.assertEqual(receipt['rawClassifierCountsHistoricalReuseOnly']['TN'], 0)

    def test_deadline_expiring_after_reservation_makes_no_transport_call(self):
        code, receipt, calls = self.run_transport_fixture(before_open_elapsed=1800)
        self.assertEqual(code, 1)
        self.assertEqual(calls, [])
        self.assertEqual(receipt['state'], 'TIME_BOUND_EXHAUSTED')
        self.assertEqual(receipt['attempts'][-1]['state'], 'DEADLINE_EXCEEDED_NO_RETRY')

    def test_late_descendant_cannot_turn_a_partially_valid_run_into_success(self):
        code, receipt, calls = self.run_transport_fixture(before_open_elapsed=1799.75, response_elapsed=0.25, delay_index=8)
        self.assertEqual(code, 1)
        self.assertEqual(len(calls), 9)
        self.assertEqual(receipt['state'], 'TIME_BOUND_EXHAUSTED')
        self.assertEqual(receipt['attempts'][-1]['state'], 'DEADLINE_EXCEEDED_NO_RETRY')
        self.assertEqual(receipt['rawClassifierCountsHistoricalReuseOnly']['TN'], 8)

    def test_deadline_after_response_headers_stops_before_body_or_another_request(self):
        code, receipt, calls = self.run_transport_fixture(before_open_elapsed=1799.75, open_elapsed=0.25)
        self.assertEqual(code, 1)
        self.assertEqual(calls, [0.25])
        self.assertEqual(receipt['state'], 'TIME_BOUND_EXHAUSTED')
        self.assertEqual(receipt['attempts'][-1]['state'], 'DEADLINE_EXCEEDED_NO_RETRY')

    @unittest.skipUnless(hasattr(signal, 'setitimer'), 'attended runtime requires Unix interval timers')
    def test_wall_clock_alarm_interrupts_blocked_io_and_restores_handler(self):
        previous = signal.getsignal(signal.SIGALRM)
        started = time.monotonic()
        with self.assertRaises(smoke.DeadlineExceeded):
            with smoke.active_request_deadline(0.05):
                time.sleep(1)
        self.assertLess(time.monotonic() - started, 0.5)
        self.assertEqual(signal.getsignal(signal.SIGALRM), previous)
        self.assertEqual(signal.getitimer(signal.ITIMER_REAL), (0.0, 0.0))

    @unittest.skipUnless(hasattr(signal, 'setitimer'), 'attended runtime requires Unix interval timers')
    def test_wall_clock_alarm_is_disarmed_after_success_and_transport_failure(self):
        previous = signal.getsignal(signal.SIGALRM)
        with smoke.active_request_deadline(1):
            pass
        with self.assertRaisesRegex(ValueError, 'synthetic_transport_failure'):
            with smoke.active_request_deadline(1):
                raise ValueError('synthetic_transport_failure')
        self.assertEqual(signal.getsignal(signal.SIGALRM), previous)
        self.assertEqual(signal.getitimer(signal.ITIMER_REAL), (0.0, 0.0))


if __name__ == '__main__':
    unittest.main()
