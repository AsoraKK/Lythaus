#!/usr/bin/env bash
# validate-store-submission-evidence.sh
#
# Checks that every required item in docs/runbooks/store-submission-evidence.md
# has been ticked off (- [x]) before a GA release build is allowed to proceed.
#
# Usage:
#   bash scripts/validate-store-submission-evidence.sh
#
# Exit codes:
#   0  — all checks passed
#   1  — one or more checks failed (messages printed to stderr)

set -euo pipefail

EVIDENCE_FILE="docs/runbooks/store-submission-evidence.md"
CONSOLE_URL="https://play.google.com/console"
ASC_URL="https://appstoreconnect.apple.com"
SECRETS_URL="https://github.com/LythausHQ/Lythaus/settings/secrets/actions"

# ── helpers ──────────────────────────────────────────────────────────────────

FAILURES=0

fail() {
  local section="$1"
  local item="$2"
  local hint="$3"
  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    echo "::error title=Store evidence — ${section}::Unchecked: ${item}"
  fi
  echo "  ✗ [${section}] ${item}" >&2
  echo "    → ${hint}" >&2
  FAILURES=$(( FAILURES + 1 ))
}

check() {
  local section="$1"
  local item="$2"
  local hint="$3"
  if ! grep -Fq -- "- [x] ${item}" "$EVIDENCE_FILE"; then
    fail "$section" "$item" "$hint"
  fi
}

# ── file guard ────────────────────────────────────────────────────────────────

if [[ ! -f "$EVIDENCE_FILE" ]]; then
  echo "::error::Missing evidence file: ${EVIDENCE_FILE}" >&2
  echo "Create it from docs/runbooks/store-submission-evidence.md and tick off each item." >&2
  exit 1
fi

echo "Checking store submission evidence: ${EVIDENCE_FILE}"
echo ""

# ── §1  Google Play Console ───────────────────────────────────────────────────

echo "§1  Google Play Console"

check "Play §1.1" "Play Console app record exists and is not in draft" \
  "Go to ${CONSOLE_URL} → All apps → create or open your app → ensure status is not Draft"

check "Play §1.1" "App access set to \"All functionality available — no restrictions\"" \
  "Play Console → Policy → App content → App access → select 'All functionality available'"

check "Play §1.2" "Data Safety form submitted (status shows \"Submitted\", not just \"Saved\")" \
  "Play Console → Policy → App content → Data safety → complete all sections and press Submit"

check "Play §1.2" "Data collected — account info (Name, Email Address) declared" \
  "Data Safety form → 'Does your app collect or share any of the required user data types?' → Account info"

check "Play §1.2" "Data collected — user content (Photos or videos, Other user content) declared" \
  "Data Safety form → User content section"

check "Play §1.2" "Data sharing — no retired moderation vendor declared" \
  "Data Safety form → confirm Lythaus Authenticity AI is an internal Lythaus capability, then declare only actual external recipients"

check "Play §1.2" "Security practices — data encrypted in transit ✓ declared" \
  "Data Safety form → Security practices → tick 'Data is encrypted in transit'"

check "Play §1.2" "Security practices — users can request data deletion ✓ declared" \
  "Data Safety form → Security practices → tick 'Users can request that data be deleted'"

check "Play §1.3" "Content rating: IARC questionnaire completed and rating issued" \
  "Play Console → Policy → App content → Content rating → complete IARC questionnaire"

check "Play §1.4" "App title (≤ 30 chars): confirmed and spell-checked" \
  "Play Console → Store presence → Main store listing → App name"

check "Play §1.4" "Short description (≤ 80 chars): confirmed and spell-checked" \
  "Play Console → Store presence → Main store listing → Short description"

check "Play §1.4" "Full description (≤ 4 000 chars): confirmed, includes key features and Lythaus branding" \
  "Play Console → Store presence → Main store listing → Full description"

check "Play §1.4" "Privacy policy URL resolves (HTTP 200, no redirect loop)" \
  "Play Console → Store presence → Main store listing → Privacy policy URL; verify with: curl -sIL <URL> | grep HTTP"

check "Play §1.5" "Hi-res icon (512 × 512 PNG, no alpha channel): uploaded" \
  "Play Console → Store presence → Main store listing → Graphics → App icon"

check "Play §1.5" "Feature graphic (1 024 × 500 JPG or PNG): uploaded" \
  "Play Console → Store presence → Main store listing → Graphics → Feature graphic"

check "Play §1.5" "Phone screenshots — portrait (min 2, max 8): uploaded" \
  "Play Console → Store presence → Main store listing → Graphics → Phone screenshots"

check "Play §1.6" "Play internal testing release uploaded (signed AAB, not APK)" \
  "Play Console → Testing → Internal testing → Create new release → upload AAB from mobile-release-build CI artifact"

check "Play §1.6" "Internal testers added and build distributed" \
  "Play Console → Testing → Internal testing → Testers tab → add tester email list"

check "Play §1.6" "At least one successful install confirmed from Play internal track" \
  "Ask a tester to install via the opt-in URL and confirm; record evidence above"

echo ""

# ── §2  App Store Connect ─────────────────────────────────────────────────────

echo "§2  App Store Connect"

check "ASC §2.1" "App Store Connect app record exists (bundle ID: co.lythaus.app)" \
  "Go to ${ASC_URL} → My Apps → + → New App → iOS → bundle ID co.lythaus.app"

check "ASC §2.1" "Age rating questionnaire completed (expected: 17+)" \
  "ASC → App record → App Information → Age Rating → complete questionnaire"

check "ASC §2.2" "App Privacy section submitted (not just saved — must show \"Submitted\" status)" \
  "ASC → App record → App Privacy → complete all data type entries → click Submit"

check "ASC §2.2" "Contact Info → Name declared (collected, linked to identity, app functionality)" \
  "App Privacy → Contact Info → Name → add usage (App Functionality, linked to identity)"

check "ASC §2.2" "Contact Info → Email Address declared (collected, linked to identity, app functionality)" \
  "App Privacy → Contact Info → Email Address → add usage"

check "ASC §2.2" "User Content → Photos or Videos declared (collected, linked to identity)" \
  "App Privacy → User Content → Photos or Videos"

check "ASC §2.2" "User Content → Other User Content declared (collected, linked to identity)" \
  "App Privacy → User Content → Other User Content"

check "ASC §2.2" "Identifiers → User ID declared (collected, linked to identity)" \
  "App Privacy → Identifiers → User ID"

check "ASC §2.2" "Usage Data → Product Interaction declared (collected, linked to identity)" \
  "App Privacy → Usage Data → Product Interaction"

check "ASC §2.3" "App name (≤ 30 chars): confirmed and spell-checked" \
  "ASC → App record → Version Information → Name"

check "ASC §2.3" "Description (≤ 4 000 chars): confirmed, includes key features and Lythaus branding" \
  "ASC → App record → Version Information → Description"

check "ASC §2.3" "Keywords (≤ 100 chars total, comma-separated): confirmed" \
  "ASC → App record → Version Information → Keywords"

check "ASC §2.3" "Privacy policy URL resolves (HTTP 200, no redirect loop)" \
  "ASC → App record → App Information → Privacy Policy URL; verify with: curl -sIL <URL> | grep HTTP"

check "ASC §2.4" "iPhone 6.7-inch screenshots (min 3, max 10): uploaded" \
  "ASC → App record → Version Information → Screenshots → 6.7-inch display"

check "ASC §2.5" "TestFlight build uploaded and processed (status: \"Ready to Submit\", not \"Processing\")" \
  "Push a build via Xcode or CI; wait for App Store Connect email 'Your submission was accepted'"

check "ASC §2.5" "Beta App Review information filled (beta description + feedback email + contact info)" \
  "ASC → TestFlight → your build → Test Information"

check "ASC §2.6" "Review notes added explaining Lythaus Authenticity AI and the user reporting flow" \
  "ASC → App record → Version Information → Review Information → Notes"

check "ASC §2.6" "Demo account credentials provided (non-production, non-PII test account)" \
  "ASC → App record → Version Information → Review Information → Demo Account"

echo ""

# ── §3  Signing Material ──────────────────────────────────────────────────────

echo "§3  Signing Material"

check "Signing §3.1" "ANDROID_KEYSTORE_BASE64 — GitHub Actions secret set" \
  "See docs/runbooks/store-submission-evidence.md §3.1 for keytool generation commands. Add at: ${SECRETS_URL}"

check "Signing §3.1" "ANDROID_KEY_ALIAS — GitHub Actions secret set" \
  "Set to the alias used during keytool -genkey. Add at: ${SECRETS_URL}"

check "Signing §3.1" "ANDROID_KEYSTORE_PASSWORD — GitHub Actions secret set" \
  "Add at: ${SECRETS_URL}"

check "Signing §3.1" "ANDROID_KEY_PASSWORD — GitHub Actions secret set" \
  "Add at: ${SECRETS_URL}"

check "Signing §3.1" "Keystore backed up securely offline (password manager or key escrow — NOT in git)" \
  "Store upload-keystore.jks and all passwords in your team password manager or an offline escrow"

check "Signing §3.1" "scripts/validate-signing-material.sh passes locally" \
  "Run: ANDROID_KEYSTORE_BASE64=... ANDROID_KEY_ALIAS=... ANDROID_KEYSTORE_PASSWORD=... bash scripts/validate-signing-material.sh"

check "Signing §3.2" "IOS_CERTIFICATE_P12_BASE64 — GitHub Actions secret set (Apple Distribution cert)" \
  "Export Apple Distribution cert from Keychain as .p12: Keychain → cert → Export → Personal Information Exchange (.p12). Then: base64 -i signing.p12 | pbcopy. Add at: ${SECRETS_URL}"

check "Signing §3.2" "IOS_CERTIFICATE_PASSWORD — GitHub Actions secret set" \
  "Password chosen during .p12 export. Add at: ${SECRETS_URL}"

check "Signing §3.2" "IOS_PROVISIONING_PROFILE_BASE64 — GitHub Actions secret set (App Store distribution profile)" \
  "Download .mobileprovision from developer.apple.com → Profiles. Then: base64 -i profile.mobileprovision | pbcopy. Add at: ${SECRETS_URL}"

check "Signing §3.2" "iOS certificate expiry > 90 days from today" \
  "Check expiry at developer.apple.com → Certificates or: openssl pkcs12 -in signing.p12 -nokeys -passin pass:PASSWORD | openssl x509 -noout -enddate"

check "Signing §3.2" "iOS provisioning profile expiry > 90 days from today" \
  "Check at developer.apple.com → Profiles or: security cms -D -i profile.mobileprovision | grep ExpirationDate"

check "Signing §3.3" "GOOGLE_SERVICES_JSON — GitHub Actions secret set (base64-encoded google-services.json)" \
  "Download google-services.json from Firebase console → Project settings → Android app. Then: base64 -w0 google-services.json. Add at: ${SECRETS_URL}"

check "Signing §3.3" "GOOGLE_SERVICES_PLIST_BASE64 — GitHub Actions secret set (base64-encoded GoogleService-Info.plist)" \
  "Download GoogleService-Info.plist from Firebase console → Project settings → iOS app. Then: base64 -i GoogleService-Info.plist | pbcopy. Add at: ${SECRETS_URL}"

echo ""

# ── result ────────────────────────────────────────────────────────────────────

if [[ "$FAILURES" -gt 0 ]]; then
  echo "Store submission evidence: ${FAILURES} item(s) not yet completed." >&2
  echo "Tick off each item in ${EVIDENCE_FILE} and re-run this script." >&2
  exit 1
fi

echo "✓ Store submission evidence validation passed (all items checked)."
