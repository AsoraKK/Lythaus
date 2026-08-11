# Quiet Trust Feed State Machines

**Status:** Current UI mapping for the repository contract. Server responses
remain authoritative; unknown values use safe, non-affirming fallbacks.

## Trust strip

Status precedence is `under_appeal`, `actioned`,
`verified_signals_attached`, then `no_extra_signals`. The receipt timeline is
chronological and may show content creation, moderation, an appeal submission,
reviewer-panel completion, adjudication, and a final appeal outcome. It must not
invent a public vote, staff override, or model-authored decision.

| Backend | Flutter UI value |
| --- | --- |
| `under_appeal` | `underAppeal` |
| `actioned` | `actioned` |
| `verified_signals_attached` | `verifiedSignalsAttached` |
| `no_extra_signals` | `noExtraSignals` |

Unknown trust status maps to `noExtraSignals`.

## Moderation action

| Backend | Flutter UI value |
| --- | --- |
| `none` | `none` |
| `limited` | `limited` |
| `blocked` | `blocked` |
| `removed` | `removed` |

Unknown moderation action maps to `none`.

## Appeal lifecycle

An eligible appeal is submitted in `open` state. Jobs independently assign
five trained reviewers. Known related-account groups may occupy at most one
seat. A recusal makes that assignment terminal and triggers independent
replacement. A submitted vote is immutable.

The panel outcome evaluator exposes `pending_quorum`, `no_consensus`,
`pending_adjudication`, `adjudication_disagreement`, or `resolved`. All five
valid reviews and a weighted majority of at least 60% are required before a
reviewer-panel decision exists. At most one trained Level 5 reviewer has weight
two. One trained Editorial or journalist adjudicator confirms a standard case;
two independently confirm a high-risk case. Only `resolved` carries a final
decision.

The workflow may mark an unresolved appeal `expired` after its review window,
but expiry never converts reviewer input into approval or rejection and applies
no outcome. There is no public voting, timed auto-resolution, moderator
override, or administrator override.

| Backend evaluation | Flutter presentation |
| --- | --- |
| `pending_quorum` | `inReview` |
| `no_consensus` | `needsReview` |
| `pending_adjudication` | `pendingAdjudication` |
| `adjudication_disagreement` | `needsReview` |
| `resolved` | `resolved` |
| `expired` | `expiredWithoutDecision` |

Unknown appeal state maps to `inReview`; it must not render as resolved.

## Timeline events

| Canonical event | Flutter presentation |
| --- | --- |
| `appeals.appeal_submitted` | `appealSubmitted` |
| `appeals.reviewer_assignment_changed` | `reviewerAssignmentChanged` |
| `appeals.vote_submitted` | `reviewSubmitted` |
| `appeals.reviewer_panel_result_reached` | `reviewerPanelCompleted` |
| `appeals.adjudication_recorded` | `adjudicationRecorded` |
| `appeals.appeal_resolved` | `appealResolved` |

Unknown timeline events render as a generic event using server-safe title and
explanation text. Raw vote details, reviewer identities, private metadata, and
forensic confidence must not be exposed.
