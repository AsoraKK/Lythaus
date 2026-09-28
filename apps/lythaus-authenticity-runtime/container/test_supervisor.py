import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from supervisor import supervise


class SupervisorTests(unittest.TestCase):
    def blocked(self, prefix, expected):
        with tempfile.TemporaryDirectory() as scratch:
            directory = Path(scratch) / 'case-protocol-fixture'
            directory.mkdir()
            (directory / 'pixels').write_bytes(b'protocol-only')
            code = prefix + "; while_block = True\nwhile while_block: pass\n"
            started = time.monotonic()
            outcome = supervise([sys.executable, '-u', '-c', code], scratch,
                                startup_seconds=0.4, request_seconds=0.4, active_seconds=1)
            self.assertEqual(outcome, expected)
            self.assertLess(time.monotonic() - started, 3)
            self.assertFalse(directory.exists())

    def test_blocked_startup_is_killed_and_cleaned(self):
        self.blocked('import time', 'WALL_DEADLINE')

    def test_blocked_forensics_is_killed_and_cleaned(self):
        self.blocked("print('BETA_READY', flush=True); print('BETA_START', flush=True)", 'WALL_DEADLINE')

    def test_http_cancellation_kills_active_work(self):
        self.blocked("print('BETA_READY', flush=True); print('BETA_START', flush=True); print('BETA_ABORT', flush=True)", 'CLIENT_ABORT')

    def test_descendants_cannot_continue_after_deadline(self):
        with tempfile.TemporaryDirectory() as scratch:
            pidfile = Path(scratch) / 'pid'
            code = ("import subprocess,sys,pathlib; "
                    "p=subprocess.Popen([sys.executable,'-c','while True: pass']); "
                    f"pathlib.Path({str(pidfile)!r}).write_text(str(p.pid)); "
                    "print('BETA_READY',flush=True); print('BETA_START',flush=True); "
                    "p.wait()")
            self.assertEqual(supervise([sys.executable, '-u', '-c', code], scratch,
                                      startup_seconds=0.5, request_seconds=0.5, active_seconds=2), 'WALL_DEADLINE')
            pid = int(pidfile.read_text())
            state = Path(f'/proc/{pid}/stat')
            for _ in range(20):
                if not state.exists() or state.read_text().split()[2] == 'Z':
                    break
                time.sleep(0.05)
            self.assertTrue(not state.exists() or state.read_text().split()[2] == 'Z')


if __name__ == '__main__':
    if os.name != 'posix':
        raise SystemExit('Linux process-group validation required; not passed on this host.')
    unittest.main()
