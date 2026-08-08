#!/usr/bin/env bash
# Fail if web release runtime sources still reference private or fallback hosts.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "==> Scanning web release runtime sources for forbidden hosts"

python3 - <<'PY'
from pathlib import Path
import re
import sys

root = Path.cwd()
retired_brand = 'as' + 'ora'
retired_cloud_host = 'az' + 'urewebsites'
pattern = re.compile(
    r'localhost|127\.0\.0\.1|0\.0\.0\.0|::1|10\.0\.2\.2|192\.168\.|'
    rf'172\.(1[6-9]|2[0-9]|3[0-1])\.|\.local|{retired_brand}-function-dev|'
    rf'your-secure-{retired_cloud_host}-function-app'
)
excluded = {
    Path('lib/core/config/environment_config.dart'),
    Path('lib/services/auth_service.dart'),
}

matches = []
targets = [
    Path('lib/core/network/dio_client.dart'),
    Path('lib/core/providers/repository_providers.dart'),
    Path('lib/features/auth/application/auth_service.dart'),
    Path('lib/features/auth/application/web_auth_service.dart'),
    Path('lib/features/moderation/application/moderation_providers.dart'),
    Path('lib/main.dart'),
    Path('lib/services/moderation_service.dart'),
    Path('lib/services/service_providers.dart'),
]

for rel in targets:
    if rel in excluded:
        continue

    path = root / rel
    if not path.exists():
        continue

    for line_no, line in enumerate(
        path.read_text(encoding='utf-8', errors='replace').splitlines(),
        start=1,
    ):
        if pattern.search(line):
            matches.append((rel.as_posix(), line_no, line.rstrip()))

if matches:
    for rel, line_no, line in matches:
        print(f'{rel}:{line_no}:{line}')
    print('Forbidden host literal found in web release runtime sources.', file=sys.stderr)
    raise SystemExit(1)
PY

echo "==> Web release runtime sources are free of forbidden hosts"
