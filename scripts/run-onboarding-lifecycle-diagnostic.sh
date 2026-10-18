#!/usr/bin/env bash
set -euo pipefail
source_root="$PWD"
evidence_root="$source_root/build/onboarding-lifecycle"
mkdir -p "$evidence_root"
exec > >(tee "$evidence_root/build-and-run.log") 2>&1
node --test scripts/tests/onboarding-lifecycle-contracts.test.mjs
for kind in static-original static-configured static-host production-host; do
  fixture_root="${RUNNER_TEMP:?}/onboarding-$kind"
  git worktree add --detach "$fixture_root" HEAD
  node scripts/prepare-onboarding-lifecycle.mjs "$fixture_root" "$evidence_root/source/$kind" "$kind"
  (
    cd "$fixture_root"
    flutter pub get --offline
    source cloudflare/pages-release.sh
    flags=()
    if [[ "$kind" != static-original ]]; then
      flags+=("--dart-define=ENVIRONMENT=$ENVIRONMENT" "--dart-define=API_BASE_URL=$API_BASE_URL" "--dart-define=AUTH_URL=$AUTH_URL")
    fi
    if [[ "$kind" == production-host ]]; then
      for scale in 1 2; do
        flutter build web --release --no-pub --no-tree-shake-icons --no-wasm-dry-run --no-web-resources-cdn \
          "${flags[@]}" --dart-define=DIAGNOSTIC_TEXT_SCALE="$scale" --output "$source_root/build/onboarding-production-$scale"
      done
    else
      flutter build web --release --no-pub --no-tree-shake-icons --no-wasm-dry-run --no-web-resources-cdn \
        "${flags[@]}" --target test/browser/approved_brand_entry.dart --output "$source_root/build/onboarding-$kind"
    fi
  )
done
if [[ "${ONBOARDING_BUILD_ONLY:-0}" == 1 ]]; then
  exit 0
fi
diagnostic_status=0
ONBOARDING_ENGINE=chromium node scripts/tests/onboarding-lifecycle.browser.mjs || diagnostic_status=$?
ONBOARDING_ENGINE=webkit node scripts/tests/onboarding-lifecycle.browser.mjs || diagnostic_status=$?
exit "$diagnostic_status"
