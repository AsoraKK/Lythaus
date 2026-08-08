# Store submission evidence

This is the source-of-truth launch checklist for Google Play, App Store Connect, and signing material. Tick an item only after its evidence has been verified in the named provider. Never place credentials, signing material, personal data, or private console screenshots in this file.

## 1. Google Play Console

- [ ] Play Console app record exists and is not in draft
- [ ] App access set to "All functionality available — no restrictions"
- [ ] Data Safety form submitted (status shows "Submitted", not just "Saved")
- [ ] Data collected — account info (Name, Email Address) declared
- [ ] Data collected — user content (Photos or videos, Other user content) declared
- [ ] Data sharing — no retired moderation vendor declared
- [ ] Security practices — data encrypted in transit ✓ declared
- [ ] Security practices — users can request data deletion ✓ declared
- [ ] Content rating: IARC questionnaire completed and rating issued
- [ ] App title (≤ 30 chars): confirmed and spell-checked
- [ ] Short description (≤ 80 chars): confirmed and spell-checked
- [ ] Full description (≤ 4 000 chars): confirmed, includes key features and Lythaus branding
- [ ] Privacy policy URL resolves (HTTP 200, no redirect loop)
- [ ] Hi-res icon (512 × 512 PNG, no alpha channel): uploaded
- [ ] Feature graphic (1 024 × 500 JPG or PNG): uploaded
- [ ] Phone screenshots — portrait (min 2, max 8): uploaded
- [ ] Play internal testing release uploaded (signed AAB, not APK)
- [ ] Internal testers added and build distributed
- [ ] At least one successful install confirmed from Play internal track

## 2. App Store Connect

- [ ] App Store Connect app record exists (bundle ID: co.lythaus.app)
- [ ] Age rating questionnaire completed (expected: 17+)
- [ ] App Privacy section submitted (not just saved — must show "Submitted" status)
- [ ] Contact Info → Name declared (collected, linked to identity, app functionality)
- [ ] Contact Info → Email Address declared (collected, linked to identity, app functionality)
- [ ] User Content → Photos or Videos declared (collected, linked to identity)
- [ ] User Content → Other User Content declared (collected, linked to identity)
- [ ] Identifiers → User ID declared (collected, linked to identity)
- [ ] Usage Data → Product Interaction declared (collected, linked to identity)
- [ ] App name (≤ 30 chars): confirmed and spell-checked
- [ ] Description (≤ 4 000 chars): confirmed, includes key features and Lythaus branding
- [ ] Keywords (≤ 100 chars total, comma-separated): confirmed
- [ ] Privacy policy URL resolves (HTTP 200, no redirect loop)
- [ ] iPhone 6.7-inch screenshots (min 3, max 10): uploaded
- [ ] TestFlight build uploaded and processed (status: "Ready to Submit", not "Processing")
- [ ] Beta App Review information filled (beta description + feedback email + contact info)
- [ ] Review notes added explaining Lythaus Authenticity AI and the user reporting flow
- [ ] Demo account credentials provided (non-production, non-PII test account)

## 3. Signing material

- [ ] ANDROID_KEYSTORE_BASE64 — GitHub Actions secret set
- [ ] ANDROID_KEY_ALIAS — GitHub Actions secret set
- [ ] ANDROID_KEYSTORE_PASSWORD — GitHub Actions secret set
- [ ] ANDROID_KEY_PASSWORD — GitHub Actions secret set
- [ ] Keystore backed up securely offline (password manager or key escrow — NOT in git)
- [ ] scripts/validate-signing-material.sh passes locally
- [ ] IOS_CERTIFICATE_P12_BASE64 — GitHub Actions secret set (Apple Distribution cert)
- [ ] IOS_CERTIFICATE_PASSWORD — GitHub Actions secret set
- [ ] IOS_PROVISIONING_PROFILE_BASE64 — GitHub Actions secret set (App Store distribution profile)
- [ ] iOS certificate expiry > 90 days from today
- [ ] iOS provisioning profile expiry > 90 days from today
- [ ] GOOGLE_SERVICES_JSON — GitHub Actions secret set (base64-encoded google-services.json)
- [ ] GOOGLE_SERVICES_PLIST_BASE64 — GitHub Actions secret set (base64-encoded GoogleService-Info.plist)

The repository gate must remain failing until all fifty items have verified external evidence and are checked here.
