#!/usr/bin/env bash
# validate-signing-material.sh
#
# Validates Android and iOS signing material before a release build.
# Checks that secrets are set, decodable, and structurally valid (keytool / openssl).
#
# Usage (local):
#   ANDROID_KEYSTORE_BASE64=... ANDROID_KEY_ALIAS=... \
#   ANDROID_KEYSTORE_PASSWORD=... \
#   IOS_CERTIFICATE_P12_BASE64=... IOS_CERTIFICATE_PASSWORD=... \
#   IOS_PROVISIONING_PROFILE_BASE64=... \
#   bash scripts/validate-signing-material.sh
#
# In CI the secrets are injected via env: block in the workflow.
#
# Exit codes:
#   0  — all signing material valid
#   1  — one or more checks failed (messages printed to stderr)

set -euo pipefail

SECRETS_URL="https://github.com/LythausHQ/Lythaus/settings/secrets/actions"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

# ── helpers ───────────────────────────────────────────────────────────────────

FAILURES=0

fail() {
  local platform="$1"
  local key="$2"
  local detail="$3"
  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    echo "::error title=Signing — ${platform}::${key}: ${detail}"
  fi
  echo "  ✗ [${platform}] ${key}: ${detail}" >&2
  FAILURES=$(( FAILURES + 1 ))
}

require_env() {
  local key="$1"
  local platform="$2"
  local hint="$3"
  local value="${!key:-}"
  if [[ -z "$value" ]]; then
    fail "$platform" "$key" "secret is not set — ${hint}"
    return 1
  fi
  return 0
}

# ── Android ───────────────────────────────────────────────────────────────────

validate_android() {
  echo "Validating Android signing material..."

  # ANDROID_KEYSTORE_BASE64 — most likely missing secret; give full generation guide
  if ! require_env "ANDROID_KEYSTORE_BASE64" "Android" \
      "Generate a new upload keystore and add it as a GitHub secret:

    # 1. Generate the keystore (run once, store the .jks file securely offline):
    keytool -genkey -v \\
      -keystore upload-keystore.jks \\
      -storetype JKS \\
      -keyalg RSA \\
      -keysize 2048 \\
      -validity 10000 \\
      -alias upload \\
      -dname 'CN=Lythaus Upload Key, OU=Mobile, O=Lythaus, C=ZA'

    # 2. Base64-encode it:
    base64 -w0 upload-keystore.jks   # Linux
    base64 -i  upload-keystore.jks   # macOS

    # 3. Add the output as GitHub secret ANDROID_KEYSTORE_BASE64 at:
    #    ${SECRETS_URL}

    # 4. Back up upload-keystore.jks and all passwords in your password manager.
    #    NEVER commit the .jks file to git."; then
    # also report the other Android secrets so the user knows all are needed
    fail "Android" "ANDROID_KEY_ALIAS"          "also required — set to the alias used in -genkey (e.g. 'upload'). Add at: ${SECRETS_URL}"
    fail "Android" "ANDROID_KEYSTORE_PASSWORD"  "also required — password chosen during keytool -genkey. Add at: ${SECRETS_URL}"
    fail "Android" "ANDROID_KEY_PASSWORD"       "also required — key password (can match store password). Add at: ${SECRETS_URL}"
    return
  fi

  require_env "ANDROID_KEY_ALIAS" "Android" \
    "alias used in 'keytool -genkey -alias <VALUE>'. Add at: ${SECRETS_URL}" || true

  require_env "ANDROID_KEYSTORE_PASSWORD" "Android" \
    "store password chosen during keytool -genkey. Add at: ${SECRETS_URL}" || true

  require_env "ANDROID_KEY_PASSWORD" "Android" \
    "key password (can be same as store password). Add at: ${SECRETS_URL}" || true

  # If any required var is still missing, abort further checks
  for k in ANDROID_KEY_ALIAS ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_PASSWORD; do
    [[ -n "${!k:-}" ]] || return
  done

  # Decode and structurally validate
  local keystore_path="$tmp_dir/upload-keystore.jks"
  if ! echo "${ANDROID_KEYSTORE_BASE64}" | base64 --decode > "$keystore_path" 2>/dev/null; then
    fail "Android" "ANDROID_KEYSTORE_BASE64" \
      "base64 decode failed — the secret value may be corrupted or wrapped with line breaks.
    Re-encode: base64 -w0 upload-keystore.jks  (Linux) or  base64 -i upload-keystore.jks  (macOS)"
    return
  fi

  if [[ ! -s "$keystore_path" ]]; then
    fail "Android" "ANDROID_KEYSTORE_BASE64" \
      "decoded file is empty — re-run base64 encoding and update the secret"
    return
  fi

  if ! keytool -list \
      -keystore "$keystore_path" \
      -storepass "${ANDROID_KEYSTORE_PASSWORD}" \
      -alias "${ANDROID_KEY_ALIAS}" >/dev/null 2>&1; then
    fail "Android" "ANDROID_KEYSTORE_BASE64 / ANDROID_KEY_ALIAS / ANDROID_KEYSTORE_PASSWORD" \
      "keytool -list failed — verify the alias and password match the keystore.
    Debug locally:
      keytool -list -keystore upload-keystore.jks -storepass \$ANDROID_KEYSTORE_PASSWORD -alias \$ANDROID_KEY_ALIAS"
    return
  fi

  # Warn if the certificate expires within 90 days
  local expiry
  expiry=$(keytool -list -v \
    -keystore "$keystore_path" \
    -storepass "${ANDROID_KEYSTORE_PASSWORD}" \
    -alias "${ANDROID_KEY_ALIAS}" 2>/dev/null \
    | grep "Valid from:" | head -1 | sed 's/.*until: //')
  if [[ -n "$expiry" ]]; then
    local expiry_epoch
    expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || date -j -f "%a %b %d %T %Z %Y" "$expiry" +%s 2>/dev/null || echo 0)
    local now_epoch
    now_epoch=$(date +%s)
    local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
    if [[ "$days_left" -lt 90 ]]; then
      echo "  ⚠ [Android] Upload keystore expires in ${days_left} days (${expiry}) — plan renewal" >&2
    fi
  fi

  echo "  ✓ Android keystore valid (alias: ${ANDROID_KEY_ALIAS})"
}

# ── iOS ───────────────────────────────────────────────────────────────────────

validate_ios() {
  echo "Validating iOS signing material..."

  require_env "IOS_CERTIFICATE_P12_BASE64" "iOS" \
    "Export your Apple Distribution certificate from Keychain as a .p12 file:
    Keychain Access → My Certificates → right-click 'Apple Distribution: ...' → Export → .p12 format → set a password.
    Then encode: base64 -i signing.p12 | pbcopy  (macOS)  or  base64 -w0 signing.p12  (Linux).
    Add the output as GitHub secret IOS_CERTIFICATE_P12_BASE64 at: ${SECRETS_URL}" || true

  require_env "IOS_CERTIFICATE_PASSWORD" "iOS" \
    "password chosen when exporting the .p12 from Keychain. Add at: ${SECRETS_URL}" || true

  require_env "IOS_PROVISIONING_PROFILE_BASE64" "iOS" \
    "Download the App Store distribution provisioning profile from developer.apple.com → Certificates, IDs & Profiles → Profiles.
    Then encode: base64 -i profile.mobileprovision | pbcopy  (macOS)  or  base64 -w0 profile.mobileprovision  (Linux).
    Add the output as GitHub secret IOS_PROVISIONING_PROFILE_BASE64 at: ${SECRETS_URL}" || true

  for k in IOS_CERTIFICATE_P12_BASE64 IOS_CERTIFICATE_PASSWORD IOS_PROVISIONING_PROFILE_BASE64; do
    [[ -n "${!k:-}" ]] || return
  done

  local cert_path="$tmp_dir/signing.p12"
  local profile_path="$tmp_dir/profile.mobileprovision"

  if ! echo "${IOS_CERTIFICATE_P12_BASE64}" | base64 --decode > "$cert_path" 2>/dev/null; then
    fail "iOS" "IOS_CERTIFICATE_P12_BASE64" \
      "base64 decode failed — re-export from Keychain and re-encode without line breaks"
    return
  fi
  if ! echo "${IOS_PROVISIONING_PROFILE_BASE64}" | base64 --decode > "$profile_path" 2>/dev/null; then
    fail "iOS" "IOS_PROVISIONING_PROFILE_BASE64" \
      "base64 decode failed — re-download from developer.apple.com and re-encode"
    return
  fi

  [[ -s "$cert_path" ]] || { fail "iOS" "IOS_CERTIFICATE_P12_BASE64" "decoded .p12 is empty — re-encode from Keychain export"; return; }
  [[ -s "$profile_path" ]] || { fail "iOS" "IOS_PROVISIONING_PROFILE_BASE64" "decoded .mobileprovision is empty — re-encode from developer.apple.com"; return; }

  if ! openssl pkcs12 -in "$cert_path" -nokeys \
      -passin "pass:${IOS_CERTIFICATE_PASSWORD}" >/dev/null 2>&1; then
    fail "iOS" "IOS_CERTIFICATE_P12_BASE64 / IOS_CERTIFICATE_PASSWORD" \
      "openssl pkcs12 validation failed — wrong password or corrupted .p12.
    Debug: openssl pkcs12 -in signing.p12 -nokeys -passin pass:\$IOS_CERTIFICATE_PASSWORD"
    return
  fi

  # Check certificate expiry
  local cert_expiry
  cert_expiry=$(openssl pkcs12 -in "$cert_path" -nokeys \
    -passin "pass:${IOS_CERTIFICATE_PASSWORD}" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)
  if [[ -n "$cert_expiry" ]]; then
    local expiry_epoch
    expiry_epoch=$(date -d "$cert_expiry" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$cert_expiry" +%s 2>/dev/null || echo 0)
    local now_epoch
    now_epoch=$(date +%s)
    local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
    if [[ "$days_left" -lt 0 ]]; then
      fail "iOS" "IOS_CERTIFICATE_P12_BASE64" \
        "Apple Distribution certificate has EXPIRED — renew at developer.apple.com → Certificates"
      return
    elif [[ "$days_left" -lt 90 ]]; then
      echo "  ⚠ [iOS] Distribution certificate expires in ${days_left} days — plan renewal at developer.apple.com" >&2
    fi
  fi

  # Check provisioning profile expiry (macOS security cms; fall back to strings grep)
  local profile_expiry=""
  if command -v security >/dev/null 2>&1; then
    profile_expiry=$(security cms -D -i "$profile_path" 2>/dev/null \
      | grep -A1 "ExpirationDate" | tail -1 | sed 's/.*<date>//;s/<\/date>.*//' || true)
  fi
  if [[ -n "$profile_expiry" ]]; then
    local pexp_epoch
    pexp_epoch=$(date -d "$profile_expiry" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$profile_expiry" +%s 2>/dev/null || echo 0)
    local now_epoch
    now_epoch=$(date +%s)
    local days_left=$(( (pexp_epoch - now_epoch) / 86400 ))
    if [[ "$days_left" -lt 0 ]]; then
      fail "iOS" "IOS_PROVISIONING_PROFILE_BASE64" \
        "Provisioning profile has EXPIRED — regenerate at developer.apple.com → Profiles"
      return
    elif [[ "$days_left" -lt 90 ]]; then
      echo "  ⚠ [iOS] Provisioning profile expires in ${days_left} days — plan renewal at developer.apple.com" >&2
    fi
  fi

  echo "  ✓ iOS signing material valid"
}

# ── run ───────────────────────────────────────────────────────────────────────

validate_android
echo ""
validate_ios
echo ""

if [[ "$FAILURES" -gt 0 ]]; then
  echo "Signing material validation failed with ${FAILURES} error(s)." >&2
  echo "See docs/runbooks/store-submission-evidence.md §3 for complete setup instructions." >&2
  exit 1
fi

echo "✓ Signing material validation passed for Android and iOS."
