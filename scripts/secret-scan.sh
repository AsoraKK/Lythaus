#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
BIN_DIR="$ROOT_DIR/.cache/tools"
mkdir -p "$BIN_DIR"

SCAN_SOURCE="$ROOT_DIR"
NO_GIT=false
TEMP_SCAN_DIR=""
if [ "${1:-}" = "--artifact" ]; then
  [ "$#" -ge 2 ] || { echo "Usage: $0 --artifact <path>" >&2; exit 2; }
  SCAN_SOURCE="$2"
  shift 2
  NO_GIT=true
  [ -e "$SCAN_SOURCE" ] || { echo "Artifact path not found: $SCAN_SOURCE" >&2; exit 2; }
  if [ -f "$SCAN_SOURCE" ] && [[ "$SCAN_SOURCE" == *.zip ]]; then
    TEMP_SCAN_DIR=$(mktemp -d)
    trap 'rm -rf "$TEMP_SCAN_DIR"' EXIT
    unzip -q "$SCAN_SOURCE" -d "$TEMP_SCAN_DIR"
    SCAN_SOURCE="$TEMP_SCAN_DIR"
  fi
fi

GITLEAKS_BIN=""
if command -v gitleaks >/dev/null 2>&1; then
  GITLEAKS_BIN=$(command -v gitleaks)
else
  VERSION="${GITLEAKS_VERSION:-8.18.0}"
  ARCHIVE="gitleaks_${VERSION}_linux_x64.tar.gz"
  URL="https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/${ARCHIVE}"
  TARGET="$BIN_DIR/gitleaks"
  if [ ! -x "$TARGET" ]; then
    echo "Downloading gitleaks ${VERSION}..." >&2
    TMP_TAR=$(mktemp)
    if ! curl --fail --silent --show-error --location \
      --retry 3 --retry-delay 2 --retry-max-time 30 \
      "$URL" -o "$TMP_TAR"; then
      echo "Failed to download gitleaks from $URL" >&2
      echo "Attempting docker fallback" >&2
    else
      tar -xf "$TMP_TAR" -C "$BIN_DIR" gitleaks
      rm -f "$TMP_TAR"
      chmod +x "$TARGET"
      GITLEAKS_BIN="$TARGET"
    fi
  else
    GITLEAKS_BIN="$TARGET"
  fi
fi

if [ -z "$GITLEAKS_BIN" ]; then
  if command -v docker >/dev/null 2>&1; then
    echo "Running gitleaks via docker..." >&2
    DOCKER_MODE=()
    [ "$NO_GIT" = true ] && DOCKER_MODE+=(--no-git)
    exec docker run --rm -v "$ROOT_DIR:/repo" -w /repo zricethezav/gitleaks:8.18.0 detect \
      --no-banner --redact --config=.gitleaks.toml "${DOCKER_MODE[@]}" --source=/repo "$@"
  else
    echo "gitleaks is not available and docker fallback failed." >&2
    echo "Install gitleaks 8.18.0 or provide docker to run this script." >&2
    exit 2
  fi
fi

MODE_ARGS=()
[ "$NO_GIT" = true ] && MODE_ARGS+=(--no-git)
exec "$GITLEAKS_BIN" detect --no-banner --redact --config "$ROOT_DIR/.gitleaks.toml" \
  "${MODE_ARGS[@]}" --source "$SCAN_SOURCE" "$@"
