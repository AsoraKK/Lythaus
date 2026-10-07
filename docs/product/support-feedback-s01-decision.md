# S01: private support policy decision

7 October 2026. Recommendation version: `support_pending_v1`, **pending**, not
configured or owner-approved. Source baseline: main
`2477c001d9f5a93865f00664c6369ced8da7b5ec`; the complete PG fixture is
`packages/db/tests/support-feedback.postgres.mjs`, version `local_fixture_v1`.
Production defaults do not exist in source: a supplied serialized policy is
required. Other unit/UI fixtures use different values. The values below are the
tested pending baseline, not a report of live configuration.

**Recommendation:** use the existing narrow categories, reachable flows and
technical bounds for continued disposable QA. Keep support, notifications and
points OFF. Do not promote the fixture's one-hour deletion rule as an inferred
business or legal decision. No new retention duration is proposed here.

| Existing tested value | Rationale and recommended disposition |
| --- | --- |
| Problems: `display`, `account`; suggestions: `navigation` | A small tested starting taxonomy. Kyle confirms whether it covers the private beta. |
| Problems: initial `submitted`; `submitted → investigating` (`investigate`, nonterminal); `submitted/investigating → resolved` (`verified`, terminal, same-request `verification` evidence) | Preserve the tested owner workflow and evidence requirement. |
| Suggestions: initial `submitted`; `submitted → accepted` (`useful`, terminal, same-request `usefulness` evidence) | Acceptance is a workflow decision and awards no points. `declined` is in the fixture's allowed states but has no incoming transition; it is unavailable in this baseline. Kyle must choose its reason/evidence rule if decline is wanted. |
| Title 128 UTF-8 bytes; each detail 512; reproduction steps 256; each app-version/platform field 64; member-visible decision/reply message 256 | Exact current fixture bounds. They limit accidental sensitive dumps; they do not certify all real reports fit. Attachments and unknown fields remain rejected. |
| Reply 256 bytes; private note 256; evidence description 256; evidence reference 128 | Keep the same tested small private/public payload limits. |
| Request pages 3; message pages 2; private-history pages/evidence references per decision 2; privacy batch 3 | Bounded QA pages/batches; pagination is implemented. These are engineering tuning values, not service promises. |
| Fixed 3,600-second windows: 30 member mutations and 40 owner mutations per actor/window | Existing mutation quotas, not rolling-hour limits or limits on every read. A committed replay does not consume another mutation. |
| Closed-content retention 3,600 seconds; deletion request states `processing`; `deleteAudit: true` | **Test-only**: a closed record older than one hour can be scrubbed. Open records are not age-purged by this adapter. `deleteAudit: false` is also supported and tested. Kyle must approve or replace the duration and audit choice before activation. |
| Deleted request remains as a content-free tombstone; this adapter has no age purge for retained tombstones/audit | No new expiry, indefinite-retention approval or legal-compliance claim is inferred. Kyle/privacy owner must specify their disposition. |
| Active subject legal hold prevents scrub/retention | Existing database mechanism. Recommend Kyle authorize hold placement/release and designate the existing privacy operator; no new UI, role or authority is created here. |

Engineering also enforces a 32 KiB HTTP/policy envelope and a 128-character ASCII
idempotency key. Those are existing parser bounds. Deployment flags, real grants,
cache/binding acceptance and production migration application are separate gates.

The locator tests expose another necessary privacy decision: an owner's replies,
notes, evidence and decisions on someone else's request survive the current
submitter-only scrubber. The proposal registers them as **present**, not as
completed deletion. Decide whether those contributions are redacted/anonymized
or retained under an explicitly approved rule. The serialized Jobs integration
must block a success receipt while disposition is unresolved; this package does
not silently delete another member's history or invent retention authority.

One question for parent to present:

> Approve the tested categories/flows and limits above as the pending beta baseline,
> and confirm or replace the test-only one-hour closed-content/audit-scrub rule,
> including tombstone/owner-contribution treatment and who may place/release holds?

An answer approves the specified policy choices only. It does not activate
support, authorize production DDL or notification sends, or settle F01's optional
150-point quarterly placement/cadence/reversal decision inside the 13,500 cap.
