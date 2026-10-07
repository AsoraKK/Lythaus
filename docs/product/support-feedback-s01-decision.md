# S01: private support policy decision

7 October 2026. Recommendation version: `support_pending_v1`, **pending**, not
configured or owner-approved. Source baseline: main
`2477c001d9f5a93865f00664c6369ced8da7b5ec`; the complete PG fixture is
`packages/db/tests/support-feedback.postgres.mjs`, version `local_fixture_v1`.
Production defaults do not exist in source: a supplied serialized policy is
required. Other unit/UI fixtures use different values. The values below are the
tested pending baseline, not a report of live configuration.

**Recommendation:** confirm the narrow categories, reachable flows and technical
bounds below for beta planning. For production closed-content retention, prefer
30 days after closure, subject to Kyle/privacy-owner review; 90 days is a longer
alternative. Neither is configured or approved for support. The one-hour value
accelerates disposable tests only and is not a proposed production option. Keep
support, notifications and points OFF.

| Existing tested value | Rationale and recommended disposition |
| --- | --- |
| Problems: display/layout or account issues (`display`, `account`); suggestions: navigation improvements (`navigation`) | A small tested starting taxonomy. Kyle confirms whether it covers the private beta. |
| Problems start Submitted; the owner can move to Investigating, then Resolved, or directly to Resolved | Investigating uses reason `investigate` with no evidence requirement. Resolution uses reason `verified` and same-request `verification` evidence. No reopening transition exists in this fixture. |
| Suggestions start Submitted; the owner can move to Accepted | Acceptance uses reason `useful` and same-request `usefulness` evidence; it awards no points. Declined is named in the fixture but has no incoming transition, so the owner cannot decline in this baseline. Kyle must choose its reason/evidence rule if decline is wanted. |
| Title 128 UTF-8 bytes; each actual/expected or improvement/benefit field 512; reproduction steps 256; each app-version/platform field 64; member-visible decision message 256 | These are byte limits, not character promises; non-ASCII text can use multiple bytes per character. They do not certify all real reports fit. Attachments and unknown fields remain rejected. |
| Reply 256 bytes; private note 256; evidence description 256; evidence reference 128 | Keep the same tested small private/public payload limits. |
| Request pages 3; message pages 2; private-history pages/evidence references per decision 2; privacy batch 3 | Bounded QA pages/batches; pagination is implemented. These are engineering tuning values, not service promises. |
| Each member: 30 combined submissions/replies; each owner: 40 combined replies/notes/evidence/decisions per fixed one-hour window | Actor-scoped mutation quotas, not rolling-hour limits or limits on every read. A committed replay does not consume another mutation. Existing outer dispatcher limits also apply. |
| Fixture only: closed-content age 3,600 seconds; deletion request states `processing`; `deleteAudit: true` | One hour makes disposable expiry tests quick; it supplies no production rationale. Explicit account-deletion scrubbing is separate from the closed-content age. Open records are not age-purged by this adapter. `deleteAudit: false` is also supported and tested. |
| Deleted request remains as a content-free tombstone; this adapter has no age purge for retained tombstones/audit | No new expiry, indefinite-retention approval or legal-compliance claim is inferred. Kyle/privacy owner must specify their disposition. |
| Active subject legal hold prevents scrub/retention | Existing database mechanism. Recommend Kyle authorize hold placement/release and designate the existing privacy operator; no new UI, role or authority is created here. |

Engineering also enforces a 32 KiB HTTP/policy envelope and a 128-character ASCII
idempotency key. Those are existing parser bounds. Deployment flags, real grants,
cache/binding acceptance and production migration application are separate gates.

## Proposed production closed-content options

The [waitlist runbook](../runbooks/waitlist-release.md#waitlist-retention)
explicitly records an approved product policy: remove converted/withdrawn
waitlist-specific information within 30 days; active holds suspend deletion.
That approval covers waitlist data, not support. The committed public
[privacy copy](../../apps/marketing-site/src/pages/privacy/index.astro) describes
user-deleted content purge within 30 days and moderation cases through closure
plus 90 days. It is a policy precedent; this packet supplies no separate support
approval or fresh approval receipt for that copy.

| Proposed option, not approved | Basis and tradeoff |
| --- | --- |
| **30 days after closure — recommended for routine beta support** | Extends the approved finished-record waitlist pattern to a new purpose only after review. Limits retained ticket prose and private notes while allowing a month for verification/follow-up. Older reproductions and suggestion context become unavailable sooner. |
| **90 days after closure** | Uses the public closed-moderation-case duration as a comparison, not authority to classify every support ticket as moderation. Allows longer regression investigation and follow-up, but keeps all associated support content longer. Choose only with a documented need and support-specific approval. |

The current support policy has one global closed-content age. Either duration
can be represented (2,592,000 or 7,776,000 seconds); a routine-30/exception-90 split
would need an explicit classification/expiry contract and further implementation.
Neither option ages open tickets; review stale open cases without automatically
closing them. Deletion requests continue through the existing approved privacy
workflow rather than waiting for the closure deadline. An active subject hold
blocks support scrub, with placement/release authority still to be designated.

Decide audit/tombstone treatment separately from ticket prose. `deleteAudit: true`
removes linked support audits when content is scrubbed; `false` retains them. The
existing [365-day generic audit cleanup](../../apps/lythaus-jobs/src/index.ts) is
source behavior, not a support-specific approval or a 365-day ticket-body option.
Its hold predicate covers actor columns/user targets, but not support's metadata
actor/submitter and request-target associations. Parent must serialize that Jobs
gap before relying on retained support audit expiry. The adapter does not age
content-free request tombstones, which still carry a submitter ID. Their finite
expiry or approved pseudonymized disposition needs a separate decision and
implementation. Do not infer indefinite retention from the current adapter.

The locator tests expose another necessary privacy decision: an owner's replies,
notes, evidence and decisions on someone else's request survive the current
submitter-only scrubber. The proposal registers them as **present**, not as
completed deletion. Decide whether those contributions are redacted/anonymized
or retained under an explicitly approved rule. The serialized Jobs integration
must block a success receipt while disposition is unresolved; this package does
not silently delete another member's history or invent retention authority.

Kyle/privacy-owner review must settle the support purpose/duration, audit and
tombstone identity/expiry treatment, owner-contribution disposition, hold
authority and corresponding user-facing notice. These are necessary policy and
privacy/legal review inputs; the durations above are product proposals, not
statutory deadlines or a claim of compliance.

One question for parent to present after sharing the values/options above:

> Confirm these categories, flows and limits for beta; choose 30 days after closure
> (recommended) or 90 days for support content; and designate the privacy owner to
> settle audit/tombstone expiry, owner-contribution treatment and hold authority?

An answer approves the specified policy choices only. It does not activate
support, authorize production DDL or notification sends, or settle F01's optional
150-point quarterly placement/cadence/reversal decision inside the 13,500 cap.
