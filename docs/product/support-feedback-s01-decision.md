# S01: private support policy decision

Updated 7 October 2026. **Partially approved; activation remains gated.** Parent
reports Kyle's “Happy with this” at 10:09:36 UTC against its 07:54:53 recommendation
in source thread `01a0f327-a7ab-771d-a745-2172db8580e6`. This approves distinct
bugs/suggestions, review and needs-information flows, resolved/accepted,
declined/duplicate outcomes, titles up to 160 characters, explanations/replies
up to 2,000, five new tickets per hour and twenty per day per member with separate
reply limits, and closed ticket text deletion after thirty days unless held.
The exact reply rates, audit retention, deletion safeguards/hold authority and
F01 are **not approved** by that receipt. No production policy version,
configuration, DDL, activation or notifications are approved by inference.

`applyApprovedSupportCompletionLimits` composes only the approved numerical
values with a complete explicitly supplied candidate. It has no reply, owner,
audit or taxonomy defaults. Character counts use Unicode scalar values after
trimming; byte and HTTP bounds remain independent. The implementation and
current requirements matrix are in
[the completion packet](../testing/support-feedback-completion-2026-10-07.md).

The following is the **historical PR947 fixture inventory**, recommendation
version `support_pending_v1`; it is not the newly approved production policy.
Its source baseline is main
`2477c001d9f5a93865f00664c6369ced8da7b5ec`; the complete PG fixture is
`packages/db/tests/support-feedback.postgres.mjs`, version `local_fixture_v1`.
Production defaults do not exist in source: a supplied serialized policy is
required. Other unit/UI fixtures use different values. The values below are the
tested pending baseline, not a report of live configuration.

The original fixture remains unchanged so the earlier reviewed evidence is
reproducible. New synthetic completion cases exercise the approved states and
limits. The one-hour fixture age accelerates disposable tests only. The thirty-day
direction is now approved; executing deletion still needs the separate safeguards
and privacy review. Support, notifications and points remain OFF.

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

## Historical retention comparison

The [waitlist runbook](../runbooks/waitlist-release.md#waitlist-retention)
explicitly records an approved product policy: remove converted/withdrawn
waitlist-specific information within 30 days; active holds suspend deletion.
That approval covers waitlist data, not support. The committed public
[privacy copy](../../apps/marketing-site/src/pages/privacy/index.astro) describes
user-deleted content purge within 30 days and moderation cases through closure
plus 90 days. It is a policy precedent; this packet supplies no separate support
approval or fresh approval receipt for that copy.

| Option and current status | Basis and tradeoff |
| --- | --- |
| **30 days after closure — direction approved 7 October 10:09:36 UTC** | Limits retained ticket prose and private notes while allowing a month for verification/follow-up. Older reproductions and suggestion context become unavailable sooner. Deletion safeguards and hold authority remain gated. |
| **90 days after closure** | Uses the public closed-moderation-case duration as a comparison, not authority to classify every support ticket as moderation. Allows longer regression investigation and follow-up, but keeps all associated support content longer. Choose only with a documented need and support-specific approval. |

The current support policy has one global closed-content age. Either duration
can be represented (2,592,000 or 7,776,000 seconds); a routine-30/exception-90 split
would need an explicit classification/expiry contract and further implementation.
The thirty-day rule does not age open tickets; review stale open cases without automatically
closing them. Deletion requests continue through the existing approved privacy
workflow rather than waiting for the closure deadline. An active subject hold
blocks support scrub, with placement/release authority still to be designated.

Decide audit/tombstone treatment separately from ticket prose. `deleteAudit: true`
removes linked support audits when content is scrubbed; `false` retains them. The
existing [365-day generic audit cleanup](../../apps/lythaus-jobs/src/index.ts) is
source behavior, not a support-specific approval or a 365-day ticket-body option.
The completion candidate now adds support metadata actor/submitter hold
associations, tested through native Workflows. Parent review and serial integration
remain required; no support-specific audit duration is inferred. The adapter does not age
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
Deleted requests containing any residual member-visible decision text are also
registered as present. A deletion timestamp alone does not prove their content
was scrubbed; the real-PG regression checks the proposed completion count.

Kyle/privacy-owner review must settle the remaining audit and
tombstone identity/expiry treatment, owner-contribution disposition, hold
authority and corresponding user-facing notice. These are necessary policy and
privacy/legal review inputs; the thirty-day direction is a product approval, not
statutory deadlines or a claim of compliance.

Parent's remaining decision request is limited to exact reply/owner rates,
taxonomy/reason/evidence rules, audit/tombstone expiry and identity disposition,
owner-contribution deletion, contributor hold safeguards and hold authority.
Do not ask Kyle to reconfirm the already-approved numerical values or thirty-day
direction. Synthetic reason and quota fixtures are not production choices.

An answer approves the specified policy choices only. It does not activate
support, authorize production DDL or notification sends, or settle F01's optional
150-point quarterly placement/cadence/reversal decision inside the 13,500 cap.
