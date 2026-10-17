#!/usr/bin/env bash
set -euo pipefail
source_root="$PWD"
evidence_root="$source_root/build/full-login-scale"
fixture_root="${RUNNER_TEMP:?}/full-login-scale-production"
mkdir -p "$evidence_root"
exec > >(tee "$evidence_root/build-and-run.log") 2>&1
node --test scripts/tests/full-login-scale-source.test.mjs scripts/tests/full-login-scale-pixels.test.mjs
git worktree add --detach "$fixture_root" HEAD
node scripts/prepare-full-login-scale.mjs "$fixture_root" "$evidence_root"
(
  cd "$fixture_root"
  flutter pub get --offline
  source cloudflare/pages-release.sh
  for scale in 1 2; do
    flutter build web --release --no-pub --no-tree-shake-icons --no-wasm-dry-run --no-web-resources-cdn \
      --dart-define=ENVIRONMENT="$ENVIRONMENT" --dart-define=API_BASE_URL="$API_BASE_URL" --dart-define=AUTH_URL="$AUTH_URL" \
      --dart-define=DIAGNOSTIC_TEXT_SCALE="$scale" --output "build/scale-$scale"
    cp scripts/ci/flutter-service-worker.js "build/scale-$scale/flutter_service_worker.js"
    node scripts/ci/version-web-entrypoints.mjs "build/scale-$scale"
  done
)
export SCALE_DIAGNOSTIC_OUTPUT="$evidence_root"
export SCALE_STATIC_ROOT="${SCALE_STATIC_ROOT:-$source_root/build/brand-web}"
export SCALE_PRODUCTION_ONE_ROOT="$fixture_root/build/scale-1"
export SCALE_PRODUCTION_TWO_ROOT="$fixture_root/build/scale-2"
FULL_LOGIN_ENGINE="${FULL_LOGIN_ENGINE:-webkit}" node scripts/tests/full-login-scale.browser.mjs
