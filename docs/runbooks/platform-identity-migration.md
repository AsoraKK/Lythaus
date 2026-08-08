# Lythaus platform identity migration

Status: repository identity changed; provider registration pending.

The permanent application identity is `co.lythaus.app` on Android, iOS, and
macOS. The repository no longer builds the active application with the former
package or bundle identifier.

## Provider gate

Do not publish a mobile build until all of the following point to
`co.lythaus.app`:

- Firebase Android and Apple application registrations
- downloaded Google Services configuration files
- Apple Developer identifiers, signing certificates, and provisioning profiles
- App Store Connect and Play Console application records
- APNs and Firebase Cloud Messaging configuration
- associated domains, universal links, and Android App Links
- keychain access groups and app groups used by enabled extensions

The checked-in Firebase files are examples only. Real provider configuration
must remain untracked and must be verified before release signing.

## Existing installations

The identifier change creates a new application identity at the operating
system and store layers. Existing installations under the retired identifier
do not share application storage automatically and users may need to sign in
again. No browser storage migration is required: active browser keys already
used Lythaus or provider-neutral names before this repository change.

## Acceptance

Record the provider application IDs, configuration-file checksums, signing
profile names, and verification date without recording private keys, tokens, or
credential values. Run a signed-install, email-authentication, guest-access,
push-notification, and deep-link smoke test on both Android and iOS before
publishing.
