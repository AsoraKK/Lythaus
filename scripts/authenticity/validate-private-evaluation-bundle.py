"""Validate a private evaluation tarball before any member is extracted."""
from __future__ import annotations

import argparse
from pathlib import Path
from pathlib import PurePosixPath
import tarfile


REQUIRED = {"approval.json", "checkpoint.pth", "models/resnet.py"}
MAX_MEMBERS = 128
MAX_TOTAL_BYTES = 256 * 1024 * 1024


def validate(archive):
    if archive.stat().st_size > MAX_TOTAL_BYTES:
        raise ValueError("ARCHIVE_SIZE_LIMIT")
    names = set()
    total = 0
    with tarfile.open(archive, "r:*") as bundle:
        members = bundle.getmembers()
        if len(members) > MAX_MEMBERS:
            raise ValueError("MEMBER_COUNT_LIMIT")
        for member in members:
            name = member.name.replace("\\", "/")
            path = PurePosixPath(name)
            if not name or path.is_absolute() or ".." in path.parts or name.startswith("./"):
                raise ValueError("PATH_TRAVERSAL")
            if name in names:
                raise ValueError("DUPLICATE_MEMBER")
            names.add(name)
            if member.issym() or member.islnk():
                raise ValueError("LINK_MEMBER_FORBIDDEN")
            if not member.isdir() and not member.isfile():
                raise ValueError("SPECIAL_MEMBER_FORBIDDEN")
            if member.isfile():
                total += member.size
                if total > MAX_TOTAL_BYTES:
                    raise ValueError("TOTAL_SIZE_LIMIT")
    if not REQUIRED.issubset(names):
        raise ValueError("REQUIRED_MEMBER_MISSING")


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--archive", required=True)
    args = parser.parse_args()
    try:
        validate(Path(args.archive))
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) else "ARCHIVE_INVALID"
        print(f"PRIVATE_BUNDLE_REJECTED:{code}")
        return 1
    print("PRIVATE_BUNDLE_VALID")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
