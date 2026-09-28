"""Independent wall deadlines for the Node/Python process group."""
import os
from pathlib import Path
import selectors
import shutil
import signal
import subprocess
import time


def supervise(command, scratch, startup_seconds=60, request_seconds=120, active_seconds=1800):
    child = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                             start_new_session=True, bufsize=0)
    selector = selectors.DefaultSelector()
    selector.register(child.stdout, selectors.EVENT_READ)
    started = time.monotonic()
    deadline = started + startup_seconds
    active_deadline = started + active_seconds
    buffer = b""
    ready = False
    busy = False
    outcome = "PROCESS_EXIT"
    try:
        while child.poll() is None:
            remaining = min(deadline, active_deadline) - time.monotonic()
            if remaining <= 0:
                outcome = "WALL_DEADLINE"
                break
            for key, _ in selector.select(min(remaining, 0.1)):
                data = os.read(key.fd, 4096)
                if not data:
                    return outcome
                buffer += data
                if len(buffer) > 4096:
                    return "INVALID_CONTROL"
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    if line == b"BETA_READY" and not ready:
                        ready = True
                        deadline = active_deadline
                    elif line == b"BETA_START" and ready and not busy:
                        busy = True
                        deadline = min(time.monotonic() + request_seconds, active_deadline)
                    elif line == b"BETA_DONE" and busy:
                        busy = False
                        deadline = active_deadline
                    elif line == b"BETA_ABORT":
                        return "CLIENT_ABORT"
                    else:
                        return "INVALID_CONTROL"
        return outcome
    finally:
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        child.wait(timeout=5)
        selector.close()
        child.stdout.close()
        for entry in Path(scratch).glob("case-*"):
            if entry.is_dir() and not entry.is_symlink():
                shutil.rmtree(entry)


if __name__ == "__main__":
    supervise(["node", "--experimental-strip-types", "apps/lythaus-authenticity-runtime/container/server.mjs"], "/tmp/beta")
    raise SystemExit(1)
