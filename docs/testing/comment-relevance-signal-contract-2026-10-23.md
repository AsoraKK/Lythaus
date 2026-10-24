# Smallest trusted relevance slice

Engineering proposal for parent/product review, not an activated policy. The
current option remains unavailable. No AI service, text-length score, raw likes,
reply-volume boost or author reputation weight is required.

## Signal contract

- An assessment targets one canonical root comment and its exact moderation
  source revision, with post/root IDs, server-derived reviewer ID, helpful or
  not-helpful verdict, event ID, recorded time and policy version. It is an
  explicit helpfulness assessment, separate from moderation/publication approval.
- Reuse existing authenticated member-action verification, active-account checks,
  rate limits and database/outbox patterns. Exclude self-assessments and actors
  unable to view the parent. One current verdict per reviewer/comment revision;
  retries return the same result. A changed verdict creates auditable superseding
  evidence. Never accept client-supplied reviewer identity or aggregate totals.
- Editing, withdrawing or hiding a comment/ancestor/post invalidates its eligible
  assessment projection. Delayed events must compare current revision and
  visibility. Reversal/revocation removes the assessment from subsequent ranked
  reads. Keep reviewer identities and raw ballots out of public API responses.
- The existing monthly `WeeklyReceptionEvidence.helpful` input is not by itself
  proof of a persisted, revision-bound comment assessment. Reuse independently
  verified source evidence only after an explicit mapping review; do not infer
  comment quality from points, a ticket status or the optional suggestion award.

## Deterministic first ranking

Propose at least three distinct eligible reviewers before scoring a root. Use
the 95% Wilson lower confidence bound for its helpful-versus-not-helpful verdicts
(`z = 1.96`); equal scores use newest `(created_at, id)`. This estimates observed
helpfulness conservatively; it does not establish truth or semantic relevance.
Opening comments alone determine top-level order in the first version, avoiding
reply-farming gains. Replies stay chronological.

Show assessed roots first, then an explicitly unassessed group ordered newest.
Do not assign unassessed roots a negative quality score or call an entirely
chronological result relevance. Keep the option unavailable until the signal has
real eligible evidence and acceptance coverage. Explain the signal in the UI,
freeze ranked page snapshots/cursors and recheck current visibility on every
read. No live reshuffling; the existing default stays Newest.

Three accounts are not proof of independent people. Existing verification/rate
limits are a starting eligibility gate, not a Sybil guarantee. Reviewer
eligibility, minimum evidence, per-actor limits and manipulation calibration need
product/security review before activation. There is no earning/reputation effect
or hidden punitive author adjustment in this proposal.

## Smallest implementation

Add one revision-bound assessment writer/projection and its read-only aggregate,
an accessible Helpful/Not helpful action, then a pure tested ranker behind the
existing unavailable capability. Reuse Workers, PostgreSQL and outbox; add no
provider or model. Schema execution/activation remain separately gated.

Acceptance must cover self/foreign/inactive actors, duplicate and concurrent
votes, changed verdicts, reversals, stale edits/events, privacy/blocks, missing
signals, equal scores, deterministic cursor/filter switching, vote-volume and
colluding-account simulations, and ranking snapshots without reading-position
loss. Review the resulting evidence before enabling Most relevant.
