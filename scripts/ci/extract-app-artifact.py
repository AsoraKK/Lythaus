#!/usr/bin/env python3
"""Safely extract the exact verified Flutter artifact supplied on stdin."""
import io
import os
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile

MAX_ARCHIVE = 200 * 1024 * 1024
MAX_CONTENT = 500 * 1024 * 1024
MAX_MEMBERS = 30000


def extract(data: bytes, destination: Path) -> None:
    if not data or len(data) > MAX_ARCHIVE:
        raise ValueError("artifact archive size invalid")
    if not destination.is_absolute() or destination.exists():
        raise ValueError("artifact destination must be a new absolute path")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        if not entries or len(entries) > MAX_MEMBERS:
            raise ValueError("artifact member count invalid")
        seen = set()
        total = 0
        for entry in entries:
            name = entry.filename
            pure = PurePosixPath(name)
            parts = name.rstrip('/').split('/')
            if (not name or entry.orig_filename != name or '\\' in name or name.startswith('/') or any(x in ('', '.', '..') for x in parts)
                    or pure.is_absolute() or any(ord(ch) < 32 for ch in name)
                    or entry.flag_bits & 1):
                raise ValueError("artifact path or encryption invalid")
            key = '/'.join(parts).casefold()
            if key in seen:
                raise ValueError("artifact has duplicate paths")
            seen.add(key)
            unix_mode = (entry.external_attr >> 16) & 0xFFFF
            kind = stat.S_IFMT(unix_mode)
            if kind not in (0, stat.S_IFREG, stat.S_IFDIR) or (entry.is_dir() and kind == stat.S_IFREG):
                raise ValueError("artifact contains a non-regular member")
            if not entry.is_dir() and kind == stat.S_IFDIR:
                raise ValueError("artifact member type invalid")
            if entry.file_size < 0 or entry.compress_size < 0:
                raise ValueError("artifact member size invalid")
            total += entry.file_size
            if total > MAX_CONTENT or (entry.file_size > 1024 * 1024 and entry.file_size > max(entry.compress_size, 1) * 500):
                raise ValueError("artifact expansion exceeds limit")
        # The output directory is new and members are all checked before any
        # files are created. Open regular files exclusively without following links.
        destination.mkdir(mode=0o700, parents=False, exist_ok=False)
        for entry in entries:
            target = destination.joinpath(*entry.filename.rstrip('/').split('/'))
            if entry.is_dir():
                target.mkdir(mode=0o700, parents=True, exist_ok=True)
                continue
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with archive.open(entry) as source, os.fdopen(fd, 'wb') as output:
                while chunk := source.read(1024 * 1024):
                    output.write(chunk)
    for required in ('index.html', '_headers', '_redirects'):
        if not (destination / required).is_file():
            raise ValueError("artifact required web file missing")


if __name__ == '__main__':
    try:
        if len(sys.argv) != 2:
            raise ValueError("artifact destination required")
        extract(sys.stdin.buffer.read(MAX_ARCHIVE + 1), Path(sys.argv[1]))
    except (ValueError, OSError, zipfile.BadZipFile, RuntimeError) as error:
        print(f"artifact extraction failed: {error}", file=sys.stderr)
        sys.exit(1)
