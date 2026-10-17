# Lythaus Admin Operations Runbook (Beta)

## Purpose

Operate the Cloudflare Access-protected Lythaus admin Worker using only its
current `/api/admin/*` contract. The Control Panel is the primary interface;
direct requests are for approved incident response or automation only.

Read the [current policy authority](../policy/current-policy-authority.md) before
appeal work. Route by the recorded policy version. The new standard community
direction and historical `appeals-v1.0.0` operations below are distinct;
documented endpoints do not imply deployment or activation approval.

## Safe session and data handling

- Start from an approved Cloudflare Access session. Where the Worker accepts an
  admin JWT, use only the short-lived, approved principal for that session; do
  not place tokens in shell history, tickets, screenshots, or logs.
- Submit admin mutations through the approved same-origin Control Panel at
  `https://admin.lythaus.co/api/admin/*`. The request must carry an `Origin`
  matching both its URL origin and `CORS_ALLOWED_ORIGINS`, plus
  `Content-Type: application/json` (including bodyless legal-hold clearing).
  Direct callers must meet the same admission contract. Missing or untrusted
  origins return `403`; a missing or non-JSON content type returns `415`.
  Retain the returned correlation ID with the incident record.
- Admin responses contain sensitive operational data. Preserve
  `Cache-Control: private, no-store`; do not cache, replay, or forward a
  response through a shared proxy.
- Every write requires the contract's reason code or request body and must be
  reconciled against the audit stream. Stop on `401`, `403`, `400`, `415`, or an
  unexpected response rather than retrying an unchanged request.
- Retired admin namespaces and direct appeal overrides remain prohibited.
  New-policy community review is authenticated and private. Timed resolution
  belongs only to its separately approved version and operating rules; it cannot
  replace historical adjudication or bypass restricted safety review.

## Live operations

Generated Dart clients share the Public API base URL by default. Create an
Admin client with
`LythausApiClient(basePathOverride: 'https://admin.lythaus.co/api')` before
using its Admin methods. The mutation Origin argument defaults to the approved
admin origin. Legal-hold clearing keeps its optional body and sends the required
JSON media type when that body is omitted. Approved Access authorization is
still required.

The following operations document the legal-hold, moderation, account, and
read-only admin surface. Paths in this table are relative to
`https://admin.lythaus.co/api`.

| Method | Path | Operational use |
| --- | --- | --- |
| GET | `/admin/health` | Check Worker and database health before an incident action. |
| GET | `/admin/privacy/requests` | Read recent privacy requests; do not alter request state from this endpoint. |
| GET | `/admin/moderation/cases` | List recent staff moderation cases. |
| GET | `/admin/audit` | Read recent admin audit events for reconciliation. |
| GET | `/admin/waitlist?limit=50&cursor=<opaque>` | Read administrator-only waitlist email addresses. Every successful view records `marketing.waitlist_viewed`; never copy addresses into operational logs. |
| GET | `/admin/users/search?q=<query>` | Search users; `q` must be 2–120 characters. |
| GET | `/admin/privacy/legal-holds` | List active and released legal holds. |
| POST | `/admin/privacy/legal-holds` | Place a legal hold using the current `LegalHoldCreate` request. |
| POST | `/admin/privacy/legal-holds/<holdId>/clear` | Clear only the named legal hold after the required approval. |
| POST | `/admin/editorial/publications` | Existing News Board contract using `EditorialPublicationCreate`; public publishing remains withheld pending full pipeline validation and activation approval. |
| POST | `/admin/moderation/cases/<caseId>/decision` | Apply a staff moderation decision using `ModerationDecisionRequest`. |
| POST | `/admin/moderation/cases/<caseId>/rereview` | Reopen a resolved case for review using its current revision, expected state, and structured reason code. |
| POST | `/admin/appeals/<appealId>/adjudications` | Historical `appeals-v1.0.0`: record a trained editorial adjudication. |
| GET | `/admin/appeals/pending-adjudication` | Historical `appeals-v1.0.0`: list durable reviewer-panel outcomes awaiting adjudication. |
| GET | `/admin/appeals/community/queue` | Candidate new-policy triage queue, including restricted and unresolved work; activation-gated. |
| GET | `/admin/appeals/<appealId>/evidence` | Candidate private new-policy triage evidence; never copy it into public ballots or logs. |
| POST | `/admin/appeals/<appealId>/triage` | Candidate new-policy standard/restricted routing using `CommunityAppealTriageRequest`; no routine Editorial confirmation for standard outcomes. |
| POST | `/admin/reviewers/<reviewerId>/qualification` | Set reviewer qualification for compatibility. |
| PUT | `/admin/reviewers/<reviewerId>/qualification` | Idempotently set reviewer qualification. |
| POST | `/admin/users/<userId>/status` | Update account status using `AccountStatusUpdate`. |
| POST | `/admin/users/<userId>/tier` | Update subscription tier using `AccountTierUpdate`. |

## Moderation cases

Use `GET /admin/moderation/cases` to identify the exact case ID and its current
state. Submit a documented `ModerationDecisionRequest` through the decision
endpoint for an open case. A resolved case may return to review only through
`POST /admin/moderation/cases/<caseId>/rereview`, with
`expectedCaseState: "resolved"`, the listed `revision` as `expectedRevision`,
and a structured `reasonCode`. The revision combines the exact resolution
timestamp, source event ID, and latest decision ID; stale state or revision
returns a conflict.

Treat `revision.resolvedAt` as an opaque string and retain its six fractional
digits, including trailing zeroes. Re-review returns a `reviewCycleId`, also
available on the current case list. Decisions for a reopened case must send
that value as `expectedReviewCycleId`; requests from any earlier review cycle
conflict. Community appeal closure waits for a fresh eligible staff decision
recorded against that cycle and continues to respect independent holds.
For this closure guard, the recorded decision actor must remain active with an
active owner, administrator, or moderator membership.
Profile re-review remains unavailable under the canonical admin grant boundary;
this endpoint does not expand profile permissions.

Re-review atomically reopens the case and changes its current content state to
`under_review`. For a post it clears `published_at` while preserving visibility,
declaration, provenance, existing decisions, enforcement records, and their
actors. It appends an audit event with the requesting admin and reason code.
Continue through the normal decision endpoint to finish review; a normal allow
decision can restore feed visibility under the existing publication rules. A
moderation decision does not resolve an associated appeal: that appeal remains
open until its own versioned appeal lifecycle resolves it. Do not treat a staff
case decision as authority to replace either historical or new-policy outcomes.

## Appeal governance

### New standard community appeals

The owner approved timed community review with equal votes for new standard
cases on 2 October. Eligible members do not need a trained-panel seat or Level 5
weight, and approved standard outcomes require no routine Editorial confirmation.
The existing candidate routes and closure service remain subject to separate
timing/quorum/default and activation approval. Inspect `policyVersion`,
`rulesVersion`, `reviewClass`, evidence version and lifecycle state before acting.
Use the canonical [community contract](../../api/openapi/community-appeals.yaml)
and [authority table](../policy/current-policy-authority.md); do not invent a
replacement endpoint or operator override.

Restricted safety cases and unresolved outcomes remain accountable work in the
protected queue. No quorum, ties, missing approval, stale evidence or unsupported
versions cannot be converted into approval by staff. A final allow result is
distinct from restoration: content changes/deletion, independent holds and
publication-rule holds can prevent visibility. Public publishing is withheld
until the complete pipeline is validated and separately approved for activation.

### Historical appeals-v1.0.0 operations

An appeal is submitted only from an eligible resolved moderation case. The
service independently assigns five trained reviewers. Their immutable reviewer
decisions establish a panel outcome, but they do not directly change content
state. Standard-risk cases require one trained editorial adjudicator; high-risk
cases require two independent trained adjudicators.

Editorial, administrator, and owner roles may use
`GET /admin/appeals/pending-adjudication` to view pending work. Only a trained
editorial adjudicator who is not the appellant, subject, or an assigned
reviewer may call the adjudication endpoint. Its body is exactly:

```json
{
  "decision": "uphold",
  "reasonCode": "APPEAL.PANEL_CONFIRMED"
}
```

`decision` is `uphold` or `overturn`. A response of `pending_adjudication`,
`no_consensus`, or `adjudication_disagreement` leaves the appeal unresolved;
only `resolved` applies a final outcome. Never replace this process with an
administrator override, a timer, or a public vote.

## Reviewer qualification and reviewer actions

This section applies to historical `appeals-v1.0.0` assignments only. Its
training and immutable-vote requirements do not exclude eligible members from
new standard community review. New ballot revisions follow their own contract.

Reviewer training is separate from reputation. Qualification updates use the
same `ReviewerQualificationUpdateRequest` on either supported method and carry
the state (`none`, `eligible`, `trained`, or `suspended`) plus a reason code.

Admin users do not vote on behalf of reviewers. An independently assigned
trained reviewer uses the authenticated public appeal surface only for their
own assignment: `GET /api/appeals/reviewer/assignments`,
`POST /api/appeals/<appealId>/recuse`, and
`POST /api/appeals/<appealId>/vote` with `decision` set to `overturn` or
`uphold`. Votes lock when recorded. These reviewer actions are never exposed
as an anonymous public voting workflow. New-policy review has its separate
authenticated private queue and versioned ballot body.

## Privacy, account, and publication actions

Read privacy requests before considering a legal hold. A legal hold is
materially sensitive: place or clear only the exact named record with the
required approval, then verify the corresponding audit event. User search,
status, and tier changes must use the exact user ID returned by the current
search result and must be audited. Editorial publication is limited to the
existing News Board workflow; do not use a retired invitation or ingestion
endpoint as a substitute. The owner withheld public posting until full pipeline
validation; this runbook does not authorize live publication.

## Completion checks

1. Verify health before and after a material incident action.
2. Confirm the response is private/no-store and capture its correlation ID.
3. Confirm the expected event appears in `GET /admin/audit`.
4. For appeal work, confirm policy/rules version, review class, outcome and
   restoration state; inspect reviewer/adjudication status only for the historical
   version that requires it. Do not infer public visibility from a timer or vote.
