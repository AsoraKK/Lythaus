# Private Support and Feedback roadmap

## Scope and sequencing

Staged after Accounts on 2026-10-02 from Kyle's voice-call follow-up. This document defines a proposed increment; no ticket API, production migration, notification or reward is activated. Parent review and Astra policy reconciliation precede implementation.

Two separate app sidebar entries and forms:

1. **Report a problem** — Help/Bug: category, concise summary, expected/actual behavior and optional reproduction steps.
2. **Feedback and suggestions** — Ideas: concise summary, proposed improvement and why it would help.

Each has its own private submission history, detail, replies and visible status. The control panel has corresponding owner queues and triage views. A shared engine can implement ownership, transport, replies and audit, while retaining separate types, labels, validation and queues. No public voting board, promised SLA, paid helpdesk, automatic publication or roadmap promise.

## Current inventory and reuse

- `lib/ui/screens/adaptive_shell.dart` contains a Help link to `lythaus.co/help`; profile settings has the same help fallback. The older feed_screen.dart path is a coming-soon action. Coordinate the active shell change with the Flutter UI lane; do not opportunistically modify feed code in Accounts.
- `moderation.content_flags` and appeals are content-policy reporting/adjudication; they do not model app bugs or product ideas.
- `moderation.authenticity_beta_feedback` / `authenticity_alpha_feedback` are case-scoped authenticity feedback, with their own private research/policy contracts. Do not repurpose or delete them.
- Exact-email Account support is an owner-only identity lookup/history tool, not a user-submitted ticket store.
- Existing identity authentication, rate-limit/idempotency helpers, audit events, UUIDv7 conventions, account privacy/retention framework and transaction/outbox patterns are reusable. No durable generic Help/Bug/Ideas ticket model was found in the current API/schema inventory.
- Transactional-email delivery can be considered only after a separate approved support notification purpose/template and configuration are defined. Do not send support mail through verification/reset templates or create a mailbox/vendor/resource.

## Proposed bounded MVP contract

An authenticated user submits a private ticket and can list, read and reply only to their own records. Guest access requires sign-in before submission. Every read/update resolves the current authenticated identity; IDs in paths or pagination cursors never grant cross-user access. Owner operations require verified Access plus current active owner membership and identity, rechecked server-side. No widened management role or browser secret.

Proposed ticket fields: UUIDv7 ID, authenticated submitter ID, type (`problem` or `suggestion`), title, bounded text body, validated category, created/updated timestamps, owner-controlled status, nullable owner priority, nullable canonical duplicate ticket and private release-evidence references. Submitter identity comes from authentication, not request body. Personal email, session details and credentials are not copied into ticket metadata.

Replies are chronological records with author class (submitter/owner), bounded text, timestamp and ticket ownership checks. Internal triage notes, priority, abuse signals and another user's duplicate details remain owner-private. Public responses use explicit allowlists. Bounded pagination and timeouts apply to queues and histories.

Suggested user-visible statuses: received, reviewing, needs information, planned, resolved, closed. Priority is an owner decision. A “planned” state is not a delivery date promise. Duplicate linking preserves each submitter's private status/history without disclosing another ticket's body, author or identity. Resolution can reference a reviewed PR/release; no automatic announcement or publication.

Start with text-only forms. Explain that users should omit credentials and private content. Optional app version/platform data must be explicit and minimal. No automatic logs, device dumps or attachments; attachment/diagnostic support needs separate consent, redaction, malware/type/size checks, scoped private storage, retention and cost approval.

## Security, retention and verification dependencies

Before ticket implementation:

- Agree field length limits, categories, status transitions, per-user submission/reply limits, idempotency semantics and spam handling. A reward quota must never limit ordinary bug/feedback submissions.
- Define private retention, deletion, legal-hold behavior and subject-data inventory integration. State which operational audit/evidence may be retained after text removal.
- Design scoped DB grants and transaction boundaries. Any schema/index/grant migration is validated in disposable PostgreSQL 17, reconciled with the approved baseline and held for parent production-DDL approval.
- Test current-session/current-owner changes, cross-user list/detail/reply/duplicate access, retry races, cursor tampering, flood/spam limits, deletion/retention and audit failures. Verify private text and credentials never enter logs, aggregate metrics or notifications.
- Verify two distinct sidebar destinations/forms/queues across responsive layouts, themes, keyboard and large text. Route changes belong in a later coordinated Flutter increment.
- Enable notifications only for configured authorized destinations/channels and approved templates. No sends are authorized by this planning document.

Proposed future API names are a discussion contract, not routes added now: user `/support/problems` and `/support/suggestions`, own ticket detail/replies; corresponding owner `/admin/support/...` queues/triage. Reuse a common engine only behind explicit type and ownership checks.

## Contribution event and reward gate

Kyle approved **150 points per accepted suggestion quarterly**. The checkpoint's one accepted useful suggestion per user per quarter is a proposed eligibility interpretation; quarterly budget, period/boundary defaults and eligibility must be reconciled with parent/Astra before activation. Acceptance means an owner-reviewed useful contribution with recorded evidence. Submission alone earns nothing. Additional ideas and bug reports remain allowed and can be accepted without an award. Do not promise a reward in forms before policy activation.

Astra lane `01a0fd06` owns the reputation/reward policy, its monthly 13,500 model and ledger integration. Parent must reconcile these before ticket reward implementation. No hardcoded 150-point award, policy default, ledger write or activation is added here.

Proposed internal event interface:

| Field | Purpose |
| --- | --- |
| `eventId`, `acceptanceId` | UUIDv7 event/decision identifiers and retry idempotency |
| `kind` | `product.contribution.accepted` or `product.contribution.reversed` |
| `submissionId`, `canonicalTicketId` | Source contribution and duplicate linkage; no ticket prose |
| `contributorId` | Authenticated contribution owner, checked against ticket |
| `decisionAuditId`, `correlationId` | Current-owner audited approval and traceability |
| `policyVersion`, `effectiveAt`, `occurredAt` | Versioned policy and unambiguous decision/event time |
| `quarterKey` | Derived from the approved policy timezone/quarter convention, not browser input |
| `reversalOf` | Required accepted event reference for a reversal |
| `evidenceRefs` | Minimal private reviewed-change/release references, without bodies, credentials or unrelated user IDs |

Events are appended transactionally with the triage decision and delivered through an approved existing idempotent mechanism. The rewards lane decides eligibility and amount, not the ticket UI or generic status update. Repeated acceptance/retry or a duplicate suggestion must not award twice. An enforced uniqueness/quota contract must coordinate contributor + quarter + policy across concurrent requests; event-source and ledger idempotency both apply.

Reversal is a new audited event referencing the original acceptance/award, never ledger deletion or re-award by editing status. Astra must decide whether reversal restores quarterly eligibility and how duplicate winners, abuse, backdated decisions, policy changes and quarter boundaries reconcile with monthly limits. Keep these decisions disabled until agreed. No bug-report reward is inferred from the suggestion approval.

## Reviewable increments after Accounts

1. Finalize private ticket/retention/notification and contribution-event contracts with parent/Astra; report shared API/schema/Flutter overlaps.
2. Implement typed own-ticket storage and read/write authorization, bounded forms/history and two sidebar entries; synthetic tests and draft PR.
3. Add owner queues, replies, prioritization, duplicate links and reviewed-release evidence with audit and privacy tests.
4. Add configured notifications and any contribution reward only after explicit configuration/policy/activation gates; separate draft PR and release review.

Ultra action-plan lane retains backlog/disposition. This staging creates no issues, closes nothing and changes no release state.
