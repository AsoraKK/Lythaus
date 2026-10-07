# P01: approved preference authority

Kyle approved account-saved left-handed mode and profile-tab swiping at **2026-10-07 05:08:22 UTC**, in the transcript supplied by the release coordinator. His reply was “Yes, you can follow your suggestion for that.” The coordinator allocated profile API policy/dispatcher, OpenAPI/generated models, a schema proposal and profile export/erase projections to this lane. This supersedes the earlier device-only recommendation. It does not authorize production DDL, deployment or feature activation.

## Behavior

- Signed-in members load these two private choices from authenticated GET /api/users/me. Explicit Save uses the existing PATCH /api/users/me, a preference-only allowlisted payload, expected revision and stable idempotency key. Name/bio publication, accountability, Passport, privacy and notification choices are separate.
- Guests load/save a dedicated versioned device key through the existing secure-storage dependency. No member preferences or identifiers enter that key. Signing in loads account choices without copying guest choices to the server. Signing out restores guest choices, with synchronous private-state reset and late-response fencing.
- Defaults stay **left-handed OFF / profile swipe ON**. Overview/Posts/Comments remain tappable with swiping off. Draft switch changes take effect only after save acknowledgement; leaving without Save discards the draft, so setup remains skippable.
- Unconfirmed saves retain their payload/key for Retry. Revision conflicts reload current server choices and require an explicit reapplication. A missing schema or failed server read disables account saves and gives reload/unavailable guidance; it never adopts guest choices as account data. Corrupt guest storage requires explicit reset; failed writes never claim success.
- Haptics remains unavailable because it has no runtime consumer. Its old model default is unchanged. Existing server-saved Passport visibility and privacy defaults are unchanged.

## Storage and release gate

The inspected production schema has no storage for these choices. database/planetscale/proposals/profile-presentation-preferences.sql proposes three typed columns on identity.users: two booleans and a positive integer revision. It is a **proposal**, outside the approved migration manifest. Its paired rollback removes only those columns and loses their stored choices; export any values that must be retained before an approved rollback.

No new table, role, grant, resource or paid service is needed. Existing table-level runtime SELECT/UPDATE and privacy SELECT/UPDATE grants cover the new fields. The existing identity.users subject-data locator covers the authoritative row. Classification: private member presentation preferences, retained while the account exists, included in the owner's data export, reset during the existing authorized deletion workflow. Guest choices are device-only and belong to the device rather than an account.

The API reads new columns through schema-compatible JSON projection: before migration or after rollback, owner preferences are null and saves return presentation_preferences_unavailable (503). Public profiles never include them. Saves do not create profile/moderation/reputation/reward events. Export remains compatible with the old schema. The new erasure reset uses the privacy binding after authoritative content redaction and does not start or enable account deletion.

**Required release approval:** independent exact-head review, approved live schema baseline/fingerprint and migration reconciliation, classification/retention/DSR review, explicit human approval to apply this exact proposal to lythaus/lythaus-core/main, then serialized Worker/Flutter release and acceptance. No production DDL is executed by this lane. Applying UI defaults alone is not account persistence activation.

## Validation and limits

Disposable PostgreSQL17 validates canonical migrations/grants, proposal/rollback, private owner load/save, concurrent revision conflict, idempotent replay, public-field exclusion, guest denial, account isolation, grant-backed export and reset. Native workerd executes the actual Public dispatcher/auth/profile code against a local PostgreSQL transport. That fixture replaces the database transport only; it does not prove production Hyperdrive TLS. Export/reset SQL constants are the same projections invoked by Jobs; the entire deletion workflow is not certified by these tests.

AccountDeleteWorkflow already redacts identity.users through DB_PRIVACY_FRESH, whose existing UPDATE grant is validated. An early local version of the new preference reset used DB_JOBS_FRESH and correctly failed its narrower grants; the final reset uses the existing privacy authority. That local failure does not establish an existing workflow grant defect. End-to-end deletion acceptance remains required before production preference storage: the export/reset SQL tests do not certify the complete workflow or prove it reaches the new step.

Native iOS/Android, physical screen readers, owner UAT and deployed cross-device behavior remain unverified. P02 handles, P03 avatars and P04 collections remain separate contract/policy work.
