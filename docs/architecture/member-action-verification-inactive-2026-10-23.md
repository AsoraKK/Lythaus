# Member choices and action verification: inactive implementation

This dependent slice starts at reviewed foundation
`68496e624790b6dc4a2ca2dd1b2971685e8829b6` (draft PR #1082). Main was read at
`ada165d3dd4da186b70503da76e4d1c96c324e0d`. The owner approved the design for
implementation, not activation. Keep both PRs draft until parent review; no merge,
release, migration execution, grants, provider changes, enrollment or awards are
part of this work.

Before publication main advanced to `868be4ee163ba5f7968212230d731682ff005e45`
(restore inventory PR #1083). Its instructions and delta were read; authentication
and monthly source files did not change. This branch retains the reviewed #1082
base. Restore files are untouched; integration with current main and its full CI
remain pending parent sequencing.

## Implementation scope

1. Persist the five approved device choices using the existing account-separated
   foundation store; confirm non-Off choices with existing OS authentication.
2. Prepare five-minute, single-use server password verification bound to the
   existing account, refresh family and exact sensitive operation. Preserve the
   current refresher and credential lifecycle.
3. Connect an explicitly configured choice timeline to existing versioned monthly
   shadow evidence. Withhold security evidence while the award mapping is pending;
   preserve other awards and signed catalogue bytes.

These are three distinct concepts. Local OS success never becomes server proof.
Token issuance/refresh time and reputation never establish account control.

## Disabled composition

| Switch | Default / prepared effect |
| --- | --- |
| Flutter `MEMBER_DEVICE_UNLOCK_SETTINGS_ENABLED` | False. No new card, storage read or OS prompt. When explicitly enabled for implementation testing, the card saves Off / Every reopen / After 1, 5 or 15 minutes away. It clearly says app-wide protection remains inactive. |
| Public API `MEMBER_RECENT_AUTH_ENABLED` | Absent/false. Existing requests retain their behavior. The new verification endpoint returns unavailable before its rate-limit/database work; no live route requires a proof. Explicit true activates the prepared reward/deletion checks and therefore requires separate approval. |
| API and Jobs `MEMBER_SECURITY_EVIDENCE_ENABLED` | Absent/false. No new evidence collection, choice reads or monthly selection filtering. Independent of action verification. |
| `MEMBER_SECURITY_EVIDENCE_MAPPING` | Absent. No default option-to-award mapping. A reviewed, versioned mapping and existing monthly collection/privacy/shadow configuration are all required. |

No flag is added to Wrangler, build/release settings or database feature flags.
The foundation preview flag retains its separate original meaning. No production
client is configured to send the new request headers.

## Device preference

The settings card uses the foundation secure store and per-account serialized
read/write queue. A non-Off selection requires successful OS confirmation before
saving. The adapter already permits OS passcode/password/pattern fallback with
`biometricOnly: false`; there is no new Lythaus PIN or biometric enrollment.
Unavailable web/hardware cannot enable a choice. Cancellation and lockout retain
the saved choice; Off remains available without confirmation or reward checks.
Storage failure is visible and reloadable.

The provider listens to session revisions and app lifecycle. Account changes
synchronously clear displayed state and fence late callbacks. The OS sheet's
inactive transition does not cancel itself; hidden/paused transitions cancel late
success. Existing timeout logic uses elapsed time plus conservative clock-change
handling. Resume never starts a prompt automatically. This slice does not mount
an app-wide blocking overlay or change browsing. Physical-device acceptance and
the eventual app-wide composition remain separate work before activation.

## Server verification and session binding

Existing `Principal`/JWT claims do not identify a refresh family and do not carry
original authentication age. Their format is unchanged. Rather than changing
session issuance or refresh, the new enabled path resolves the current existing
refresh credential with the existing read-only `lockRefreshSession` lookup. It
requires an active account/session/family and the current token version.

Web uses the existing HttpOnly `__Host-lythaus_refresh` cookie and existing
cookie-v1/origin rules. Native implementation clients can supply their current
existing refresh credential in `X-Lythaus-Session-Binding` over the same protected
API transport. This is a sensitive credential: it must never enter analytics,
request logs, URLs or new storage. No new credential, cookie or storage key is
created. Rotation racing the request can require retry with the current token;
it cannot extend or reset verification age. This design needs explicit client
integration review and acceptance before activation.

Prepared HTTP exchange:

```text
POST /api/auth/recent-verification
Authorization: Bearer <existing access token>
X-Lythaus-Session-Binding: <current existing refresh credential; native only>
Content-Type: application/json

{"password":"<existing account password>","operation":{
  "method":"POST","path":"/api/rewards/<id>/redeem","body":"{}"}}

Response: {proof, verifiedAt, expiresAt, action, maintenanceEvidence}

POST /api/rewards/<id>/redeem
Authorization: Bearer <existing access token>
X-Lythaus-Action-Verification: <proof>
X-Lythaus-Session-Binding: <current existing refresh credential; native only>
Content-Type: application/json

{}
```

The server classifies the operation rather than trusting a client action, user,
session, authentication time or local-unlock boolean. It checks the existing
verified email/password hash with the existing verifier. There is no hash upgrade,
password change, provider, enrollment or token issuance in this path. Per-IP and
per-user limits apply. Wrong password/proof use 403 and unavailable dependencies
use 503, avoiding an artificial 401 refresh loop.

Only a hash of the random one-time secret and a domain-separated HMAC of the
action/method/path plus query/raw body are persisted. The HMAC reuses the existing
PII HMAC key; no new secret is required. Verification and exact five-minute expiry
come from the database clock. Consumption locks the proof, matches subject/family/
version/operation/secret, then uses a single-use conditional update in the same
transaction as the protected effect. Rollback restores unused proof. Generic
idempotency may replay an already cached response without another effect; a new
effect still requires a valid unused proof. Refresh/local unlock cannot mint it.
Malformed UTF-8 is rejected before proof consumption. Valid body bytes, including
a leading BOM, are preserved when building the operation binding rather than
collapsed to replacement text.

The step-up retry contract deliberately preserves existing idempotency behavior.
A confirmed HTTP 403 `recent_authentication_required` occurs before the protected
effect and is stored as that key's completed denial. After genuine verification,
retry the exact operation with a **new** idempotency key and the fresh proof.
Reusing the old key replays its denial and does not consume the fresh proof. An
expired-proof denial follows the same renewal/new-key rule. The current Rewards
UI already clears its key after confirmed errors; the deferred step-up UX must
implement this explicit contract rather than assume every retry retains a key.

Do not put the proof in the operation hash, delete/reclaim completed denials, or
change the idempotency engine. A completed success replays with its original key
even after proof expiry, with no further effect or proof consumption. Concurrent
same-key attempts return an in-progress conflict or the completed response; a
different key cannot reuse a consumed proof. Network/5xx errors and
`idempotency_outcome_unknown` are **not** confirmed verification denials and do not
authorize discarding an operation key: preserve the existing quarantine and
reconcile the outcome. Finalization failure after a domain commit remains unknown,
not a verification retry.

| Approved action | Prepared integration |
| --- | --- |
| Reward claims | Existing POST `/api/rewards/:id/redeem` consumes proof inside its transaction when explicitly enabled. Maturity, reputation, catalogue and idempotency gates remain. |
| Account deletion | Existing privacy request with `requestType: delete` consumes proof inside its transaction when explicitly enabled. Export/rectification remain unchanged. No deletion is executed by this work. |
| Security/email changes | Closed policy types exist. There are no authenticated settings mutation handlers to integrate at this baseline. HTTP proof issuance for invented operations is unavailable. Existing logout/recovery/password-reset behavior is unchanged; integrate actual new settings handlers before activating their protection. |

All credentials, transport, access/refresh expiry, rotation, reuse detection,
revocation and automatic restoration implementations remain unchanged. No renewed
`iat`, arbitrary `auth_time` or extra claim can satisfy the separate proof.

## Monthly choice evidence

The new append-only proposed journal records server effective time, account-bound
revision, source kind, option, credential and enabled/disabled/revoked state.
Account locking serializes changes. Event IDs are idempotent; ownership and known
email credentials are checked. Callers cannot backdate choices. Disablement and
recovery never depend on award eligibility.

The owner subsequently approved one equal security benefit for qualifying choices
and a cumulative 24-hour allowance per calendar month. The separate versioned
adapter `member-security-calendar-grace-24h-v1` reconstructs account choice and
canonical protection intervals, rejects incomplete revision history, and counts
the union of verified unprotected intervals clipped to the source month. Exactly
24 hours is allowed; one millisecond more loses only that month's security benefit.
Repeated switches share the same allowance. Continuous transitions among mapped
qualifying methods preserve eligibility where actual evidence supports coverage.
Overlapping disablement, expiry and revocation gaps are counted once. Unknown
telemetry is kept separate and cannot be treated as protection or silently spent
as grace. A preference alone never creates coverage.

The member must already have qualifying enrollment and genuine protection
evidence at/before the calendar month's start; grace cannot backdate a midmonth or
last-day enrollment. Cross-month gaps consume only their portion in each month.
A matching server-verified authentication must occur during actual protected
coverage that month, rather than during a gap. Local biometric success, refreshed
tokens and reputation cannot satisfy it. UTC calendar boundaries and existing
configured settlement hours (72 in the candidate fixture) remain unchanged;
neither device timezone nor rolling 30-day windows apply.

The optional collector can append an existing `authentication` observation from
an actual new server password proof and a matching held account-credential choice.
It emits only the existing `credential` category, never MFA, points or reputation
updates. Monthly collection failure does not block account verification. The
assembly adapter replaces only security facts, retains nonsecurity maintenance,
and includes intervals, grace/unknown time and mapping configuration in the shadow
report/digest. Raw evidence keeps its real gaps: the adapter does not fabricate
protection spans to make the old strict calculator accept them. The new optional
shadow calculation applies one common explicitly mapped **existing catalogue
action**, reusing its existing maximum; it zeros the other security maintenance
component to prevent stacking. Neither a point amount nor a common award action
has a default. An old mapping lacking the new requirement version is unavailable.
Historical calculator and signed catalogue bytes are untouched.
Adopting or changing this policy for an existing assembly requires explicit review.

There is deliberately no client preference-to-qualifying-credential conversion,
default mapping, live choice enrollment endpoint, protection-coverage producer,
or runtime activation. Those dependent pieces stop at the mapping decision below.
Mere existence of an email/password credential does not invent maintained coverage.
Existing signed policy bytes, award amounts and prospective quarterly work are
unchanged. No points were awarded or punitive deductions introduced.

## Schema, privacy and acceptance gates

`database/planetscale/proposals/member_action_verification.sql` is an unregistered
proposal, not an executable migration. It adds private proof and choice-history
tables with application UUIDv7 IDs and account deletion cascades. No SQL was
executed, including local migrations. No grants or provider resources were changed.
Production roles do not acquire access from this PR. Missing tables/privileges
fail closed only when the corresponding new path is explicitly enabled.

Proofs contain subject/session/credential identifiers and keyed operation hashes;
choice history is private security/reputation metadata. Neither contains raw
passwords, biometrics, OS PINs, request bodies or proof secrets. Before schema
approval, the owner must agree retention/purge limits, export/deletion treatment,
least-privilege grants and reconciled migration/PG17 evidence with the owning lane.
The expiry column is authorization expiry, not a claim that physical purge exists.

## Activation decision packet

- **Already approved for implementation:** the five optional device choices, OS
  fallback, five-minute action-bound verification for reward claims, security/email
  changes and deletion; equal monthly benefit for qualifying choices and cumulative
  calendar-month grace of at most 24 hours. Browsing remains uninterrupted. No
  other reputation is deducted for exceeding the allowance.
- **Narrow unresolved policy question:** which account-level chosen option maps
  to the common existing security-maintenance award, and which existing catalogue
  action represents that common benefit? Should local unlock frequency remain
  preference-only, with only separately protected account credentials eligible?
  Email/password verification alone cannot be labelled MFA. Equal treatment and
  24-hour grace are settled; credential qualification and explicit catalogue
  mapping remain unavailable, with no arbitrary point amount selected.
- **Policy-lane acceptance:** explicit versioned mapping, qualifying credential
  coverage source and revocation semantics, UTC/settlement operational approval,
  privacy/retention and prospective-policy compatibility. No retroactive full-month
  credit before collection; no penalties for disabling or recovering access.
- **Implementation acceptance:** parent source/security review, real PG17
  transaction/concurrency/rollback and schema tests after separate permission,
  native and cookie client step-up integration, unchanged refresh/recovery tests,
  and actual iOS/Android/OS fallback/accessibility/lockout/offline/lifecycle tests.
  Settings preference acceptance does not certify an app-wide lock.
- **Activation remains withheld:** flags stay absent/false. Schema execution,
  grants, migration/release work, merging and enforcement require separate parent
  approval and coordination. The restore task owns deployment.

Test commands, outcomes and limitations are recorded in
[the validation record](../testing/member-action-verification-2026-10-23.md).
