#!/usr/bin/env bash
# Failure-only evidence; never substitutes for the required brand gate.
set -euo pipefail
source_root="$PWD"
evidence_root="$source_root/build/full-login-ablation"
direct_root="${RUNNER_TEMP:?}/full-login-direct"
svg_root="$RUNNER_TEMP/full-login-svg"
neutral_root="$RUNNER_TEMP/full-login-neutral"
mkdir -p "$evidence_root"
exec > >(tee "$evidence_root/build-and-run.log") 2>&1
git worktree add --detach "$direct_root" HEAD
git worktree add --detach "$svg_root" HEAD
git worktree add --detach "$neutral_root" HEAD
git fetch --no-tags --depth=1 origin f2c8712de963d6dc8f1d254abe6448f6a397da8f
node scripts/prepare-full-login-ablation.mjs "$direct_root" "$svg_root" "$neutral_root" "$evidence_root"
for fixture_root in "$direct_root" "$svg_root" "$neutral_root"; do
  (
    cd "$fixture_root"
    flutter pub get --offline
    flutter build web --release --no-pub --no-tree-shake-icons --no-wasm-dry-run --no-web-resources-cdn --target test/browser/full_login_diagnostic_entry.dart --output build/full-login-ablation
  )
done
export BRAND_DIAGNOSTIC_OUTPUT="$evidence_root"
export BRAND_DIAGNOSTIC_CANDIDATE="$direct_root/build/full-login-ablation"
export BRAND_DIAGNOSTIC_SVG="$svg_root/build/full-login-ablation"
export BRAND_DIAGNOSTIC_BASELINE="$neutral_root/build/full-login-ablation"
node scripts/tests/full-login-resources.mjs
export BRAND_DIAGNOSTIC_BUILDS
BRAND_DIAGNOSTIC_BUILDS="$(cat "$evidence_root/builds.json")"
FULL_LOGIN_ENGINE="${FULL_LOGIN_ENGINE:-webkit}" node scripts/tests/full-login-ablation.browser.mjs
