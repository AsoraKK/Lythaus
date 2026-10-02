# Optional profile after sign-in

Interactive email sign-in offers profile setup when the saved owner profile has no display name or bio. Restoring a session does not re-trigger that offer. Profile details remain optional; Skip and explore clears the offer for the current session and opens Discover. Guests can keep exploring without access to owner profile setup. Pending invite redemption retains priority.

The owner Profile screen reads the authenticated `/api/users/me` endpoint and offers Complete your profile or Edit profile. The editor saves only changed fields. A bio-only or display-name-only save is valid; omitted fields are preserved. An existing name cannot be replaced with an empty string, and a bio can be cleared deliberately. Public text updates retain the existing publication review queue. The private response includes `moderationState` and `publicVisibility`, and the UI distinguishes under review, blocked, approved, and private states. Pending and blocked profile data remain unavailable from the public profile endpoint. Private accountability names are never returned by either profile endpoint.

Save is explicit. Typing does not send or persist a draft. Back and Skip ask before discarding unsaved changes; failed saves retain the fields in the editor. Unchanged retries reuse their idempotency key, duplicate clicks are disabled, and leaving or changing accounts cancels pending requests. A browser refresh or process interruption restores server-saved fields and loses unsaved local edits. Nothing is silently submitted during refresh, session restore, sign-out, or interruption.

Server and Flutter name checks use the existing client vocabulary (`fuck`, `shit`, `bitch`, `asshole`, `bastard`) as complete tokens, not substrings. Fullwidth ASCII and inserted formatting characters cannot bypass those token checks. The server retains NFC normalization and the 160 UTF-16-unit limit; the client follows the same limit and shared fixture. International scripts, accents, joiners and legitimate names such as Shitara, Fuchs, Hancock and Scunthorpe are regression cases. This conservative local filter supplements the existing publication review process; it is not comprehensive language moderation. Private accountability-name updates and admin display-name parsing use the same server safeguard. No password is accepted or forwarded by profile APIs.

Validation uses a new disposable local PostgreSQL 17 container and synthetic sessions, keys and browser API fixtures. These checks do not satisfy real-email/signup owner acceptance or approve a production release. The source is reconstructed in a distinct cloud branch because the prior PC patch is uncommitted and unavailable. Reconcile it if that patch becomes available. Parent integration owns merges and exact-SHA owner testing.

Focused commands:

```sh
node --experimental-strip-types --test apps/lythaus-public-api/tests/profile-runtime-policy.test.mjs
PLANETSCALE_PG17_TEST_DATABASE_URL=<local-disposable-url> node --experimental-strip-types --experimental-test-module-mocks --test apps/lythaus-public-api/tests/optional-profile.postgres.mjs
flutter test test/features/profile test/ui/screens/profile test/screens/profile_screen_test.dart test/core/routing/app_router_test.dart test/features/auth
npm run test:critical-coverage
npm run openapi:test:contract
npm run openapi:test:dart
node --experimental-strip-types --test --test-timeout=120000 scripts/tests/flutter-auth.browser.mjs scripts/tests/optional-profile.browser.mjs
```

Browser checks run the actual release artifact against synthetic first-party API fixtures on local TLS. Chromium and WebKit cover desktop and mobile widths. Flutter's exact Roboto and Noto Sans SC fallback font URLs are fulfilled from checksum-verified local fixtures, with their embedded Apache 2.0 and SIL OFL licenses included. Other requests remain subject to the existing fixture proxy allowlist. The optional-profile checks record console and network evidence, classify only the expected signed-out refresh rejection, and fail on unexpected console errors, runtime errors, or failed requests.

The authentication regression records WebKit's owner-public-profile GET cancellation when the signed-out session disposes the provider. That exact cancelled request is expected only during the explicit sign-out phase; other failed requests remain fatal.

Cloud reconstruction validation on 2026-10-02 passed 135 backend policy/regression tests, nine disposable PostgreSQL tests, 2,828 Flutter tests (five existing skips), 937 generated-client tests, and 33 OpenAPI contract tests (17 existing skips). All eight rendered browser cases passed. Complete Flutter LCOV covers 205 files at 88.95% overall; all eight independent authentication gates and the P1/P2/P3 gates passed. All 38 critical backend modules passed their coverage gates; both new profile policy modules reached 100% line and branch coverage. Flutter analysis and native type checking passed. These results apply to this reconstructed branch, not the unavailable PC patch.

Integration overlaps are the public API entrypoint, shared contracts export, authentication routing, private-profile OpenAPI schema/bundle, six generated client files, and coverage manifest. The private schema can be rebundled and regenerated after serial integration with the passkey and posts lanes. This change does not redesign global navigation, migrate a provider database, activate AI, merge, or deploy.
