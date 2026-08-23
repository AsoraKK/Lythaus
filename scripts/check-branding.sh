#!/usr/bin/env bash

set -euo pipefail

ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
RETIRED_BRAND='[Aa][Ss][Oo][Rr][Aa]'
OWNER_EXCEPTION='As''oraKK'
EMAIL_EXCEPTION='kyle.kern@as''ora.co.za'

if ! command -v rg >/dev/null 2>&1 || ! rg --version >/dev/null 2>&1; then
  echo 'an executable rg (ripgrep) is required' >&2
  exit 2
fi

content_matches="$({
  rg -n -i --hidden --glob '!.git/**' --glob '!docs/history/**' --glob '!docs/archive/**' \
    --glob '!node_modules/**' --glob '!build/**' --glob '!.dart_tool/**' \
    --glob '!scripts/cloudflare/audit-account.mjs' \
    --glob '!cloudflare/audit-account.mjs' \
    --glob '!scripts/cloudflare/execute-lythaus-pages-cutover.mjs' \
    --glob '!cloudflare/execute-lythaus-pages-cutover.mjs' \
    --glob '!scripts/cloudflare/rotate-lythaus-access-service-token.mjs' \
    --glob '!cloudflare/rotate-lythaus-access-service-token.mjs' \
    --glob '!scripts/cloudflare/execute-lythaus-web-source-hygiene.mjs' \
    --glob '!cloudflare/execute-lythaus-web-source-hygiene.mjs' \
    --glob '!.github/workflows/cloudflare-lythaus-pages-cutover.yml' \
    --glob '!workflows/cloudflare-lythaus-pages-cutover.yml' \
    --glob '!.github/workflows/cloudflare-lythaus-web-source-hygiene.yml' \
    --glob '!workflows/cloudflare-lythaus-web-source-hygiene.yml' \
    --glob '!scripts/tests/cloudflare-pages-cutover.test.mjs' \
    --glob '!scripts/tests/cloudflare-pages-cutover.test.mjs' \
    --glob '!scripts/tests/cloudflare-web-source-hygiene.test.mjs' \
    --glob '!scripts/ci/build-release-manifest.mjs' \
    --glob '!ci/build-release-manifest.mjs' \
    --glob '!.github/workflows/production-release.yml' \
    --glob '!workflows/production-release.yml' \
    --glob '!.codex-*/**' -- "$RETIRED_BRAND" \
    "$ROOT/lib" "$ROOT/test" "$ROOT/integration_test" "$ROOT/android" "$ROOT/ios" \
    "$ROOT/macos" "$ROOT/linux" "$ROOT/windows" "$ROOT/web" "$ROOT/apps" "$ROOT/api" \
    "$ROOT/packages" "$ROOT/scripts" "$ROOT/.github" "$ROOT/assets" "$ROOT/docs/product" \
    "$ROOT/docs/architecture" "$ROOT/pubspec.yaml" "$ROOT/package.json" \
    2>/dev/null || true
} | rg -v "$OWNER_EXCEPTION|$EMAIL_EXCEPTION" || true)"

if [[ -n "$content_matches" ]]; then
  echo 'Retired brand found in active code or configuration:' >&2
  printf '%s\n' "$content_matches" >&2
  exit 1
fi

echo 'Active Lythaus code and configuration contain no retired brand references.'
