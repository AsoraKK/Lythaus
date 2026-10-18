#!/usr/bin/env bash
# Supplemental ordering diagnosis. The original required gate stays unchanged.
set -euo pipefail
source_root="$PWD"
evidence_root="$source_root/build/full-login-startup"
direct_root="${RUNNER_TEMP:?}/full-login-startup-direct"
neutral_root="$RUNNER_TEMP/full-login-startup-neutral"
mkdir -p "$evidence_root"
exec > >(tee "$evidence_root/build-and-run.log") 2>&1
git worktree add --detach "$direct_root" HEAD
git worktree add --detach "$neutral_root" HEAD
node scripts/prepare-full-login-startup.mjs "$direct_root" "$neutral_root" "$evidence_root"
for fixture_root in "$direct_root" "$neutral_root"; do
  (
    cd "$fixture_root"
    flutter pub get --offline
    flutter build web --release --no-pub --no-tree-shake-icons --no-wasm-dry-run --no-web-resources-cdn --target test/browser/full_login_diagnostic_entry.dart --output build/full-login-startup
  )
done
export BRAND_DIAGNOSTIC_OUTPUT="$evidence_root"
export BRAND_DIAGNOSTIC_CANDIDATE="$direct_root/build/full-login-startup"
export BRAND_DIAGNOSTIC_BASELINE="$neutral_root/build/full-login-startup"
export BRAND_DIAGNOSTIC_RENDERER_BASE=same-sized-two-color-placeholder
export BRAND_DIAGNOSTIC_DESCRIPTION='Same full login and common instrumentation. Only artwork differs. Browser captures before semantics, then activates after the first observed Dart frame; no forced repaint, resize or geometry changes.'
node scripts/tests/brand-diagnostic-pair.mjs
export BRAND_DIAGNOSTIC_BUILDS
BRAND_DIAGNOSTIC_BUILDS="$(cat "$evidence_root/builds.json")"
FULL_LOGIN_ENGINE="${FULL_LOGIN_ENGINE:-webkit}" node scripts/tests/full-login-startup.browser.mjs
