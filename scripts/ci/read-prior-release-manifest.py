#!/usr/bin/env python3
"""Read only the two files in a verified canonical manifest artifact ZIP."""
import hashlib
import io
import json
import re
import sys
import zipfile

MAX_ARCHIVE = 8 * 1024 * 1024
MAX_MANIFEST = 2 * 1024 * 1024


def read(data: bytes) -> dict:
    if not data or len(data) > MAX_ARCHIVE:
        raise ValueError('manifest archive size invalid')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        expected = {'release-manifest.json', 'release-manifest.sha256'}
        if len(entries) != 2 or {entry.filename for entry in entries} != expected:
            raise ValueError('manifest archive inventory invalid')
        for entry in entries:
            mode = (entry.external_attr >> 16) & 0o170000
            if entry.orig_filename != entry.filename or entry.flag_bits & 1 or mode not in (0, 0o100000):
                raise ValueError('manifest archive member invalid')
            if entry.file_size > MAX_MANIFEST or entry.file_size > max(entry.compress_size, 1) * 500:
                raise ValueError('manifest archive expansion invalid')
        raw = archive.read('release-manifest.json')
        digest = archive.read('release-manifest.sha256').decode('utf8')
        match = re.fullmatch(r'([0-9a-f]{64})  (?:\.artifacts/release/)?release-manifest\.json\n', digest)
        if not match or hashlib.sha256(raw).hexdigest() != match.group(1):
            raise ValueError('manifest integrity digest mismatch')
        result = json.loads(raw)
        if not isinstance(result, dict):
            raise ValueError('manifest body invalid')
        return result


if __name__ == '__main__':
    try:
        print(json.dumps(read(sys.stdin.buffer.read(MAX_ARCHIVE + 1)), separators=(',', ':')))
    except (ValueError, OSError, UnicodeError, zipfile.BadZipFile, RuntimeError):
        print('prior manifest artifact invalid', file=sys.stderr)
        sys.exit(1)
