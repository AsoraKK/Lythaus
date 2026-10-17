#!/usr/bin/env bash
# Diagnostic-only single-frame control; required rendering acceptance is unchanged.
set -euo pipefail
source_root="$PWD"
evidence_root="$source_root/build/full-login-frame"
fixture_root="${RUNNER_TEMP:?}/full-login-frame-direct"
mkdir -p "$evidence_root"
exec > >(tee "$evidence_root/build-and-run.log") 2>&1
git worktree add --detach "$fixture_root" HEAD
node scripts/prepare-full-login-frame.mjs "$fixture_root" "$evidence_root"
(
  cd "$fixture_root"
  flutter pub get --offline
  flutter build web --release --no-pub --no-tree-shake-icons --no-wasm-dry-run --no-web-resources-cdn --target test/browser/full_login_diagnostic_entry.dart --output build/full-login-frame
)
export FRAME_DIAGNOSTIC_OUTPUT="$evidence_root"
export FRAME_DIRECT_ROOT="$fixture_root/build/full-login-frame"
export FRAME_REQUIRED_ROOT="${FRAME_REQUIRED_ROOT:-$source_root/build/brand-web}"
export FRAME_REAL_APP_ROOT="${FRAME_REAL_APP_ROOT:-$source_root/build/web}"
FULL_LOGIN_ENGINE="${FULL_LOGIN_ENGINE:-webkit}" node scripts/tests/full-login-frame.browser.mjs
