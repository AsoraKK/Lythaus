#!/usr/bin/env bash
set -euo pipefail
source_root="$PWD"
evidence_root="$source_root/build/onboarding-visible"
mkdir -p "$evidence_root"
exec > >(tee "$evidence_root/build-and-run.log") 2>&1
node --test scripts/tests/onboarding-visible-contracts.test.mjs scripts/tests/brand-login-contracts.test.mjs
for kind in static production; do
  fixture_root="${RUNNER_TEMP:?}/onboarding-visible-$kind"
  git worktree add --detach "$fixture_root" HEAD
  if [[ "$kind" == static ]]; then
    node scripts/prepare-onboarding-lifecycle.mjs "$fixture_root" "$evidence_root/source/static" static-original
  else
    node scripts/prepare-onboarding-visible.mjs "$fixture_root" "$evidence_root/source/visible"
  fi
  (
    cd "$fixture_root"
    flutter pub get --offline
    flags=()
    target=lib/main.dart
    if [[ "$kind" == static ]]; then
      target=test/browser/approved_brand_entry.dart
    else
      source cloudflare/pages-release.sh
      flags+=("--dart-define=ENVIRONMENT=$ENVIRONMENT" "--dart-define=API_BASE_URL=$API_BASE_URL" "--dart-define=AUTH_URL=$AUTH_URL" --dart-define=DIAGNOSTIC_TEXT_SCALE=2)
    fi
    flutter build web --release --no-pub --no-tree-shake-icons --no-wasm-dry-run --no-web-resources-cdn \
      "${flags[@]}" --target "$target" --output "$source_root/build/onboarding-visible-$kind"
  )
done
if [[ "${ONBOARDING_BUILD_ONLY:-0}" == 1 ]]; then exit 0; fi
diagnostic_status=0
ONBOARDING_ENGINE=chromium node scripts/tests/onboarding-visible.browser.mjs || diagnostic_status=$?
ONBOARDING_ENGINE=webkit node scripts/tests/onboarding-visible.browser.mjs || diagnostic_status=$?
exit "$diagnostic_status"
