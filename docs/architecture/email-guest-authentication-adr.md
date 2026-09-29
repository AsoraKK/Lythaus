# ADR: Email and guest authentication only

- Status: Accepted
- Date: 2026-08-08
- Scope: Initial Lythaus launch

## Decision

The initial Lythaus authentication surface consists of:

1. verified email authentication; and
2. guest access for the read-only product experience.

Google, Apple, World ID, Entra, Azure B2C, generic OAuth provider selection,
and provider-specific callback flows are removed from the launch surface. They
are not deferred implementation work and must not be restored as a missing
feature. Direct calls to a removed provider must return `provider_unavailable`.

## Rationale

Email and guest access are the smallest launch surface compatible with the
current Cloudflare Worker API, PlanetScale identity schema, and product access
rules. Removing unused provider flows reduces identity-linking, callback,
secret, and support complexity while the Lythaus identity model is stabilised.

## Consequences

- The Flutter auth choice screen exposes email and guest actions only.
- Native Workers accept email and guest identity paths only.
- Existing provider-link migrations remain checksum-immutable; forward
  migrations constrain active records to email and migration provenance.
- Any future provider requires a new ADR, explicit API/interface review, and
  a new launch decision before code or configuration is added.

## Incident repair contract (2026-09-28)

This is the implementation target, not certification of the serving release.
Account enforcement, credential verification, recovery-token state, delivery
state and browser session state are independent. A neutral `202` acknowledges
intake only; neither it nor `provider_accepted` proves mailbox receipt.

| Identity/credential state | Allowed transition | Forbidden shortcut |
| --- | --- | --- |
| No account | Atomic pending identity, challenge and encrypted email intent | Session before verification |
| Active, verified credential | Password verification and session; mailbox reset | Applying new-password minimum to stored passwords |
| Active/relink, unverified credential | Resend or mailbox-proven recovery; verification instructions after correct password | Replacing the password on repeated signup |
| Trusted legacy contact, no credential | Mailbox proof then credential setup on the original user ID | Credential activation from an unsolicited signup link alone |
| Restricted/deletion-pending identity | Neutral recovery suppression; protected support | Recovery lifting enforcement |
| Missing/conflicting trusted linkage | Protected support | Guessing, merging or recreating a user |

Creation and reset accept 15–128 Unicode code points, without normalization,
trimming, case conversion or truncation. Login accepts bounded nonempty input
and verifies the recorded hash, including historical 12–14-character passwords.
`packages/contracts/fixtures/password-policy.json` is consumed by API and Dart
regression tests. Password screening and hashing are separate controls; input
validation does not establish password strength or hash compatibility.

Only omitted auth mode retains the deployed-client default of `login`.
Unknown or malformed explicit modes are rejected. Verification/reset remain
intentional POST actions; expiry, supersession and consumption are enforced
atomically. Existing 30-minute token lifetimes remain unchanged pending an
explicit policy decision.

Auth UI and navigation must not await analytics. Every network operation has a
bounded deadline. A failed userinfo fetch cannot leave a newly persisted partial
session. These client rules do not replace server session revocation.

Release approval requires the canonical exact-candidate flow and real mailbox
receipt at two independent authorized external providers. Local fixtures, mocks,
unit tests and source presence are not production acceptance. Production schema
changes, identity repair and traffic activation require separate authorization.
