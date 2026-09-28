"""Copy only the reviewed SAFE source/checkpoint into a private staging area."""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import shutil

SOURCE_SHA = "57eb62f43283daffc1828bfa8b01a783c3f0b14e11cda09994fd7c22a531f3ac"
CHECKPOINT_SHA = "b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e"

def digest(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()

def stage(root: Path, output: Path, source_sha: str = SOURCE_SHA, checkpoint_sha: str = CHECKPOINT_SHA):
    source, checkpoint = root / "models" / "resnet.py", root / "checkpoint.pth"
    for candidate, expected in ((source, source_sha), (checkpoint, checkpoint_sha)):
        if candidate.is_symlink() or not candidate.is_file() or digest(candidate) != expected: raise ValueError("MODEL_ARTIFACT_INVALID")
    output.mkdir(parents=True, exist_ok=False, mode=0o750)
    models = output / "models"
    models.mkdir(mode=0o750)
    shutil.copyfile(source, models / "resnet.py")
    shutil.copyfile(checkpoint, output / "checkpoint.pth")
    for directory in (output, models): os.chmod(directory, 0o750)
    is_root = hasattr(os, "geteuid") and os.geteuid() == 0
    for candidate in (models / "resnet.py", output / "checkpoint.pth"):
        os.chmod(candidate, 0o440)
        if hasattr(os, "chown") and is_root: os.chown(candidate, 65532, 65532)
    if hasattr(os, "chown") and is_root:
        os.chown(output, 65532, 65532)
        os.chown(models, 65532, 65532)

def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--expected-source-sha", default=SOURCE_SHA)
    parser.add_argument("--expected-checkpoint-sha", default=CHECKPOINT_SHA)
    args = parser.parse_args()
    try: stage(args.root.resolve(), args.output.resolve(), args.expected_source_sha, args.expected_checkpoint_sha)
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) else "MODEL_STAGE_FAILED"
        print(f"MODEL_STAGE_REJECTED:{code}")
        return 1
    print("MODEL_STAGE_READY")
    return 0

if __name__ == "__main__": raise SystemExit(main())
