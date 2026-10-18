#!/usr/bin/env bash
set -euo pipefail
source_root="$PWD"
fixture_root="${RUNNER_TEMP:?}/approved-brand-onboarding"
reference_root="${RUNNER_TEMP:?}/approved-brand-onboarding-reference"
evidence_root="$source_root/build/brand-evidence/onboarding-fixture-source"
mkdir -p "$evidence_root"
exec > >(tee "$evidence_root/build.log") 2>&1
git worktree add --detach "$fixture_root" HEAD
git worktree add --detach "$reference_root" HEAD
node scripts/prepare-onboarding-visible.mjs "$fixture_root" "$evidence_root/visible"
node scripts/prepare-onboarding-reference.mjs "$reference_root" "$evidence_root/reference"
(
  cd "$reference_root"
  flutter pub get --offline
  flutter build web --release --no-pub --no-tree-shake-icons --no-wasm-dry-run --no-web-resources-cdn \
    --target test/browser/approved_brand_entry.dart --output "$source_root/build/brand-onboarding-reference"
)
(
  cd "$fixture_root"
  flutter pub get --offline
  source cloudflare/pages-release.sh
  for scale in 1 2; do
    flutter build web --release --no-pub --no-tree-shake-icons --no-wasm-dry-run --no-web-resources-cdn \
      --dart-define=ENVIRONMENT="$ENVIRONMENT" --dart-define=API_BASE_URL="$API_BASE_URL" --dart-define=AUTH_URL="$AUTH_URL" \
      --dart-define=DIAGNOSTIC_TEXT_SCALE="$scale" --output "$source_root/build/brand-onboarding-$scale"
  done
)
