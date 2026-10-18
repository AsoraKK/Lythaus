#!/usr/bin/env bash
# Supplemental hosted evidence only; never replaces the failed required gate.
set -euo pipefail
candidate_root="$PWD"
evidence_root="$candidate_root/build/brand-failure-diagnostic"
baseline_root="${RUNNER_TEMP:?}/brand-diagnostic-baseline"
baseline_renderer=f2c8712de963d6dc8f1d254abe6448f6a397da8f
mkdir -p "$evidence_root"
exec > >(tee "$evidence_root/build-and-run.log") 2>&1
git fetch --no-tags --depth=1 origin "$baseline_renderer"
git worktree add --detach "$baseline_root" HEAD
git show "$baseline_renderer:lib/design_system/widgets/lyth_brand.dart" > "$baseline_root/lib/design_system/widgets/lyth_brand.dart"
flutter build web --release --no-pub --no-tree-shake-icons --no-wasm-dry-run --no-web-resources-cdn --target test/browser/brand_diagnostic_entry.dart --output build/brand-failure-candidate
(
  cd "$baseline_root"
  flutter pub get --offline
  flutter build web --release --no-pub --no-tree-shake-icons --no-wasm-dry-run --no-web-resources-cdn --target test/browser/brand_diagnostic_entry.dart --output build/brand-failure-baseline
)
export BRAND_DIAGNOSTIC_OUTPUT="$evidence_root"
export BRAND_DIAGNOSTIC_CANDIDATE="$candidate_root/build/brand-failure-candidate"
export BRAND_DIAGNOSTIC_BASELINE="$baseline_root/build/brand-failure-baseline"
export BRAND_DIAGNOSTIC_RENDERER_BASE="$baseline_renderer"
node scripts/tests/brand-diagnostic-pair.mjs
export BRAND_DIAGNOSTIC_BUILDS
BRAND_DIAGNOSTIC_BUILDS="$(cat "$evidence_root/builds.json")"
BRAND_BROWSER=webkit BRAND_DIAGNOSTIC_HEADED=0 BRAND_DIAGNOSTIC_WIDTH=320 BRAND_DIAGNOSTIC_THEME=light node scripts/tests/brand-diagnostic.browser.mjs
