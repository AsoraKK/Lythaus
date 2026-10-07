# P01: preference authority decision

Prepared 2026-10-07 for WP02. **Pending owner decision; no storage change implemented.**

Current `settingsProvider` holds handedness, horizontal swipe and haptics in memory. Defaults remain false, true and true. The same app instance retains these presentation controls across account changes; restarting resets them. The Settings screen now says this explicitly. `social.profiles.trust_passport_visibility` is a different, existing server-saved preference read and updated through authenticated `/api/users/me`; it must never fall back to device settings when the server read fails.

## Recommended minimum

Persist only handedness and profile horizontal swipe on the current device using the existing local-preferences dependency. Keep the current defaults. Let guests use the same device controls. Retain them on signout and account switching so the device's accessibility choices remain usable. Do not sync them between devices; do not migrate or store Passport visibility, notifications, consent, account identity or other private settings in this store. Existing server-saved preferences retain their current authority. Haptics has no current runtime consumer or feedback implementation; its inert switch is replaced with an unavailable explanation, and it is excluded from the persistence proposal until a real implementation/policy is commissioned. Its existing model default is unchanged.

This option requires **no server endpoint, schema, migration, grant or provider resource**. Store only two booleans with a versioned local key and clear recovery behavior for an absent or corrupt store. A later device-local implementation would test write failure, reload/restart, guest/member switches, defaults, upgrade and unavailable storage; it must not report a failed write as saved.

## Exact decision needed

Approve the recommended device scope, unchanged defaults, guest behavior and retention across signout/account changes; or choose account-scoped local preferences or account-synced preferences. Record approver, UTC time, source/policy version and any expiry before dependent implementation.

Account-scoped local preferences would need a decision about guest-to-member migration, per-account keys and signout cleanup. Account-synced preferences would additionally need a canonical allowlisted API/DTO, database field/table and grants proposal, authoritative defaults, conflict/revision behavior, guest migration, retention and export/erasure locators. Existing notification and region APIs do not authorize storing these unrelated controls.

P02 handle, P03 avatar and P04 profile-list visibility are separate decisions. WP02's Comments tab truthfully explains that profile comment lists are unavailable; it does not query known-ID comments as a list or define comment/parent visibility policy.
