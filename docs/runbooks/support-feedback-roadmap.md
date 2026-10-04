# Private Support and Feedback roadmap

## Scope and sequencing

Staged after Accounts on 2026-10-02 from Kyle's voice-call follow-up. PR910 now contains a bounded default-off support slice integrated with the public/admin dispatchers, OpenAPI/generated client, privacy jobs and Flutter member route. Its owner console and member UI remain disabled unless their independent feature flags are explicitly enabled. There is no production migration, notification delivery, reward or public-homepage change. Parent controls integration, activation and release. Astra policy reconciliation remains required before any reward integration.

Two separate private support flows and forms:

1. **Report a problem** — Help/Bug: category, concise summary, expected/actual behavior and optional reproduction steps.
2. **Feedback and suggestions** — Ideas: concise summary, proposed improvement and why it would help.

Each has its own private submission history, detail, replies and visible status. The control panel has corresponding owner queues and triage views. A shared engine can implement ownership, transport, replies and audit, while retaining separate types, labels, validation and queues. No public voting board, promised SLA, paid helpdesk, automatic publication or roadmap promise.

## Current inventory and reuse

- `lib/ui/screens/adaptive_shell.dart` retains its existing Help link to `lythaus.co/help`; profile settings exposes the private support route only when the member-build flag is enabled. The older feed_screen.dart path remains a coming-soon action.
- `moderation.content_flags` and appeals are content-policy reporting/adjudication; they do not model app bugs or product ideas.
- `moderation.authenticity_beta_feedback` / `authenticity_alpha_feedback` are case-scoped authenticity feedback, with their own private research/policy contracts. Do not repurpose or delete them.
- Exact-email Account support is an owner-only identity lookup/history tool, not a user-submitted ticket store.
- Existing identity authentication, rate-limit/idempotency helpers, audit events, UUIDv7 conventions, account privacy/retention framework and transaction/outbox patterns are reusable. No durable generic Help/Bug/Ideas ticket model was found in the current API/schema inventory.
- Transactional-email delivery can be considered only after a separate approved support notification purpose/template and configuration are defined. Do not send support mail through verification/reset templates or create a mailbox/vendor/resource.

## Bounded MVP contract

An authenticated user submits a private problem report or suggestion and can list, read and reply only to their own records. Guest access requires sign-in before submission. Every read/update resolves the current authenticated identity; IDs in paths or pagination cursors never grant cross-user access. Owner operations require verified Access plus current active owner membership and identity, rechecked server-side. No widened management role or browser secret. Both forms and histories remain distinct over the shared engine.

The API stores UUIDv7 ID, authenticated submitter ID, kind, validated category, title, revision/state and timestamps. Problem reports contain actual/expected behavior and optional reproduction steps, app version and platform; suggestions contain the proposed improvement and expected benefit. Submitter identity comes from authentication, not request body. Personal email, session details and credentials are not copied into ticket metadata.

Replies are chronological records with author class (submitter/owner), bounded text, timestamp and ticket ownership checks. Internal triage notes, priority, abuse signals and another user's duplicate details remain owner-private. Public responses use explicit allowlists. Bounded pagination and timeouts apply to queues and histories.

User-visible states and transitions are supplied as versioned policy. They are not an SLA or delivery-date promise. Owners record typed same-request evidence and a private decision record when closing a request, with a separate public explanation; no automatic announcement or publication occurs.

Start with text-only forms. Explain that users should omit credentials and private content. Optional app version/platform data must be explicit and minimal. No automatic logs, device dumps or attachments; attachment/diagnostic support needs separate consent, redaction, malware/type/size checks, scoped private storage, retention and cost approval.

## Security, retention and remaining verification

The published increment includes these controls:

- The policy contract requires explicit field limits, categories, states, transitions, per-user quotas, idempotency, privacy retention and evidence rules. The runtime rejects unsupported or mixed-kind inputs; rate limits are independent of rewards.
- Member and owner operations use current identity checks, object-scoped authorization, audit/idempotency transactions and no-store responses. The support-specific PostgreSQL 17 suite checks cross-user access, replay/concurrency, deletion/retention, active holds and audit failures.
- The SQL proposal remains outside automatic migrations. Production schema and least-privilege grants require separate review and approval before activation.
- The UI/API route tests and CI cover source behavior; actual deployed Worker bindings, production cache behavior, broad accessibility and responsive review remain release-head checks.
- Notifications remain off until authorized destinations, preferences, dedupe and dispatch-time privacy checks are configured and approved. This roadmap authorizes no sends.

The existing HTTP adapter and dispatchers expose member `/api/support/problems` and `/api/support/suggestions` histories/replies, plus owner `/api/admin/support/...` queues, replies, notes, evidence and decisions. The routes return 404 while the server flag is off; the separate UIs also default off. When all optional support tables are absent, ordinary account/privacy flows continue without support data. If any support table is present but a required privacy relation or grant is missing, export, deletion and retention fail and retry rather than completing without support data. Reuse the existing support engine only behind explicit type and ownership checks.

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

1. PR909 is merged into current main. PR910's service branch is rebased directly onto main and remains open for parent review before its merge; it contains services, API/OpenAPI/client, privacy integration, both UIs and scoped CI.
2. Resolve approved production schema/grants, privacy locators/completion, retention, legal-hold and rollback gates. Run final Worker authorization, no-store, audit, query-bound, navigation and responsive/accessibility acceptance at the exact release head.
3. Add configured notifications only after transport, preferences, dedupe and dispatch-time privacy checks are approved. Add no suggestion award until Rewards approves the 150-point quarterly policy boundaries and budget; keep bugs unrewarded by inference.

Ultra action-plan lane retains backlog/disposition. This staging creates no issues, closes nothing and changes no release state.
