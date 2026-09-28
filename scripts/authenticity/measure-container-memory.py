"""Read external cgroup peak after the response, before container teardown."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import re
import time

def cgroup_file(pid: int) -> Path:
    lines = Path(f"/proc/{pid}/cgroup").read_text().splitlines()
    relative = next((line.split("::", 1)[1] for line in lines if line.startswith("0::")), None)
    if relative is None or not re.fullmatch(r"(?:/[A-Za-z0-9_.:-]+)*", relative): raise ValueError("CGROUP_PATH_INVALID")
    return Path("/sys/fs/cgroup") / relative.lstrip("/") / "memory.peak"

def measure(pid: int | None, file: Path | None):
    target = file if file else cgroup_file(pid)
    value = int(target.read_text().strip())
    if value <= 0: raise ValueError("CGROUP_PEAK_INVALID")
    return {"schemaVersion": "lythaus-whole-container-memory-v1", "scope": "WHOLE_CONTAINER_POST_RESPONSE", "cgroupPeakBytes": value, "sampledAt": int(time.time())}

def main():
    parser = argparse.ArgumentParser(add_help=False); parser.add_argument("--pid", type=int); parser.add_argument("--cgroup-file", type=Path); parser.add_argument("--output", type=Path, required=True); args = parser.parse_args()
    if (args.pid is None) == (args.cgroup_file is None): print("MEMORY_MEASUREMENT_REJECTED:TARGET_REQUIRED"); return 1
    try:
        result = measure(args.pid, args.cgroup_file); args.output.parent.mkdir(parents=True, exist_ok=True); args.output.write_text(json.dumps(result) + "\n"); os.chmod(args.output, 0o600)
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) else "CGROUP_MEASUREMENT_FAILED"; print(f"MEMORY_MEASUREMENT_REJECTED:{code}"); return 1
    print("MEMORY_MEASUREMENT_READY"); return 0

if __name__ == "__main__": raise SystemExit(main())
