#!/usr/bin/env bash
# Runs project tests with coverage reporting for CI gating
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

rm -rf coverage
mkdir -p coverage
mkdir -p coverage-artifacts/coverage-flutter coverage-artifacts/coverage-functions

if ! command -v flutter >/dev/null 2>&1; then
  echo "flutter is required for coverage generation" >&2
  exit 1
fi

echo "Running Flutter tests with coverage..."
flutter test --coverage

if [ ! -f coverage/lcov.info ]; then
  echo "coverage/lcov.info was not generated" >&2
  exit 1
fi

cp coverage/lcov.info coverage-artifacts/coverage-flutter/lcov.info

python3 - "$ROOT_DIR" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
lcov_path = root / "coverage" / "lcov.info"
total_lines = covered_lines = 0
with lcov_path.open() as fh:
    for line in fh:
        if line.startswith("LF:"):
            total_lines += int(line.strip()[3:])
        elif line.startswith("LH:"):
            covered_lines += int(line.strip()[3:])

coverage = 0.0 if total_lines == 0 else (covered_lines / total_lines) * 100.0
summary_path = root / "coverage" / "coverage-summary.txt"
summary_path.write_text(f"TOTAL {coverage:.1f}%\n", encoding="utf-8")
print(f"Wrote coverage summary: TOTAL {coverage:.1f}%")
PY

echo "Coverage artifacts ready in ./coverage"
