#!/usr/bin/env bash
set -euo pipefail
source_root="$PWD"
evidence_root="$source_root/build/onboarding-animation"
mkdir -p "$evidence_root"
exec > >(tee "$evidence_root/build-and-run.log") 2>&1
node --test scripts/tests/onboarding-animation-contracts.test.mjs
for policy in disabled enabled; do
  fixture_root="${RUNNER_TEMP:?}/onboarding-animations-$policy"
  git worktree add --detach "$fixture_root" HEAD
  node scripts/prepare-onboarding-animation.mjs "$fixture_root" "$evidence_root/source/$policy" "$policy"
  (
    cd "$fixture_root"
    flutter pub get --offline
    source cloudflare/pages-release.sh
    flutter build web --release --no-pub --no-tree-shake-icons --no-wasm-dry-run --no-web-resources-cdn \
      "--dart-define=ENVIRONMENT=$ENVIRONMENT" "--dart-define=API_BASE_URL=$API_BASE_URL" "--dart-define=AUTH_URL=$AUTH_URL" \
      --target test/browser/approved_brand_entry.dart --output "$source_root/build/onboarding-animations-$policy"
  )
done
if [[ "${ONBOARDING_BUILD_ONLY:-0}" == 1 ]]; then exit 0; fi
diagnostic_status=0
ONBOARDING_ENGINE=chromium node scripts/tests/onboarding-animation.browser.mjs || diagnostic_status=$?
ONBOARDING_ENGINE=webkit node scripts/tests/onboarding-animation.browser.mjs || diagnostic_status=$?
exit "$diagnostic_status"
