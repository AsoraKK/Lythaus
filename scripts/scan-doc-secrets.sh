#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"

if ! command -v rg >/dev/null 2>&1; then
  echo "rg is required for docs secret scanning"
  exit 2
fi

SCAN_DIRS=()
for d in "$ROOT/docs" "$ROOT/.github" "$ROOT/infra"; do
  [[ -d "$d" ]] && SCAN_DIRS+=("$d")
done

ROOT_CONFIGS=()
for f in "$ROOT"/*.env "$ROOT"/*.env.* "$ROOT/.env" "$ROOT/.env.*" "$ROOT/local.settings.json"; do
  [[ -f "$f" ]] && ROOT_CONFIGS+=("$f")
done

if [[ ${#SCAN_DIRS[@]} -eq 0 && ${#ROOT_CONFIGS[@]} -eq 0 ]]; then
  SCAN_DIRS=("$ROOT")
fi

FILE_GLOBS=(-g '*.md' -g '*.yml' -g '*.yaml' -g '*.json' -g '*.env' -g '*.env.*')
EXCLUDES=(-g '!**/node_modules/**' -g '!**/.git/**' -g '!**/dist/**' -g '!**/coverage/**' -g '!**/__snapshots__/**' -g '!**/test-fixtures/**' -g '!**/testdata/**')
PATTERNS=(
  "(?i)(api[_-]?key|client[_-]?secret|jwt[_-]?secret|access[_-]?token|password)\\s*[:=]\\s*[\\\"']?[A-Za-z0-9_\\-]{16,}"
  'ghp_[A-Za-z0-9]{36}'
  'xox[baprs]-[A-Za-z0-9-]{24,}'
  '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'
  "(?i)cloudflare[^\\n]{0,40}(token|secret)\\s*[:=]\\s*[\\\"']?[A-Za-z0-9_\\-]{20,}"
)

ALLOW_CONTEXT_REGEX='(example|placeholder|redacted|dummy|sample|<[^>]+>|your_|changeme|test_|begin private key.*block|ci-placeholder|PLACEHOLDER|REPLACE_ME|\$\{|\$\(\()'

TMP_RESULTS="$(mktemp)"
FILTERED="$(mktemp)"
trap 'rm -f "$TMP_RESULTS" "$FILTERED"' EXIT

for pattern in "${PATTERNS[@]}"; do
  if [[ ${#SCAN_DIRS[@]} -gt 0 ]]; then
    rg --pcre2 -n "${FILE_GLOBS[@]}" "${EXCLUDES[@]}" -- "$pattern" "${SCAN_DIRS[@]}" >> "$TMP_RESULTS" 2>/dev/null || true
  fi
  for f in "${ROOT_CONFIGS[@]}"; do
    rg --pcre2 -n -- "$pattern" "$f" >> "$TMP_RESULTS" 2>/dev/null || true
  done
done

if [[ ! -s "$TMP_RESULTS" ]]; then
  echo "Docs/config secret scan passed (no suspicious patterns found)."
  exit 0
fi

grep -Eiv "$ALLOW_CONTEXT_REGEX" "$TMP_RESULTS" > "$FILTERED" || true

if [[ ! -s "$FILTERED" ]]; then
  echo "Docs/config secret scan passed (only placeholder/example matches found)."
  exit 0
fi

echo "Potential secrets found in docs/config files:"
cat "$FILTERED"
echo
echo "Remediation: redact values and replace them with placeholders."
exit 1
