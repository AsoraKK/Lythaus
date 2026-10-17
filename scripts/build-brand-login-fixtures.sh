#!/usr/bin/env bash
set -euo pipefail
source_root="$PWD"
fixture_root="${RUNNER_TEMP:?}/approved-brand-login"
evidence_root="$source_root/build/brand-evidence/login-fixture-source"
mkdir -p "$evidence_root"
exec > >(tee "$evidence_root/build.log") 2>&1
git worktree add --detach "$fixture_root" HEAD
node scripts/prepare-brand-login.mjs "$fixture_root" "$evidence_root"
(
  cd "$fixture_root"
  flutter pub get --offline
  source cloudflare/pages-release.sh
  for scale in 1 2; do
    output="$source_root/build/brand-login-$scale"
    flutter build web --release --no-pub --no-tree-shake-icons --no-wasm-dry-run --no-web-resources-cdn \
      --dart-define=ENVIRONMENT="$ENVIRONMENT" --dart-define=API_BASE_URL="$API_BASE_URL" --dart-define=AUTH_URL="$AUTH_URL" \
      --dart-define=DIAGNOSTIC_TEXT_SCALE="$scale" --output "$output"
    cp scripts/ci/flutter-service-worker.js "$output/flutter_service_worker.js"
    node scripts/ci/version-web-entrypoints.mjs "$output"
  done
)
