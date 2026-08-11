# Lythaus Admin Operations Runbook (Beta)

## Purpose

Operate the Cloudflare Access-protected Lythaus admin Worker using only its
current `/api/admin/*` contract. The Control Panel is the primary interface;
direct requests are for approved incident response or automation only.

## Safe session and data handling

- Start from an approved Cloudflare Access session. Where the Worker accepts an
  admin JWT, use only the short-lived, approved principal for that session; do
  not place tokens in shell history, tickets, screenshots, or logs.
- Use the existing admin origin, `https://admin-api.lythaus.co/api`, and retain
  the returned correlation ID with the incident record.
- Admin responses contain sensitive operational data. Preserve
  `Cache-Control: private, no-store`; do not cache, replay, or forward a
  response through a shared proxy.
- Every write requires the contract's reason code or request body and must be
  reconciled against the audit stream. Stop on `401`, `403`, `400`, or an
  unexpected response rather than retrying an unchanged request.
- Retired admin and public-voting namespaces, direct appeal overrides, timed
  appeal resolution, and public voting are prohibited.

## Live operations

The following 16 operations are the complete supported admin surface. Paths in
this table are relative to `https://admin-api.lythaus.co/api`.

| Method | Path | Operational use |
| --- | --- | --- |
| GET | `/admin/health` | Check Worker and database health before an incident action. |
| GET | `/admin/privacy/requests` | Read recent privacy requests; do not alter request state from this endpoint. |
| GET | `/admin/moderation/cases` | List recent staff moderation cases. |
| GET | `/admin/audit` | Read recent admin audit events for reconciliation. |
| GET | `/admin/users/search?q=<query>` | Search users; `q` must be 2–120 characters. |
| GET | `/admin/privacy/legal-holds` | List active and released legal holds. |
| POST | `/admin/privacy/legal-holds` | Place a legal hold using the current `LegalHoldCreate` request. |
| POST | `/admin/privacy/legal-holds/<holdId>/clear` | Clear only the named legal hold after the required approval. |
| POST | `/admin/editorial/publications` | Publish an editorial News Board entry using `EditorialPublicationCreate`. |
| POST | `/admin/moderation/cases/<caseId>/decision` | Apply a staff moderation decision using `ModerationDecisionRequest`. |
| POST | `/admin/appeals/<appealId>/adjudications` | Record a trained editorial appeal adjudication. |
| GET | `/admin/appeals/pending-adjudication` | List appeals with a durable reviewer-panel outcome awaiting adjudication. |
| POST | `/admin/reviewers/<reviewerId>/qualification` | Set reviewer qualification for compatibility. |
| PUT | `/admin/reviewers/<reviewerId>/qualification` | Idempotently set reviewer qualification. |
| POST | `/admin/users/<userId>/status` | Update account status using `AccountStatusUpdate`. |
| POST | `/admin/users/<userId>/tier` | Update subscription tier using `AccountTierUpdate`. |

## Moderation cases

Use `GET /admin/moderation/cases` to identify the exact case ID, then submit a
documented `ModerationDecisionRequest` only through the decision endpoint. A
moderation decision does not resolve an associated appeal: that appeal remains
open until the independent reviewer and adjudication policy resolves it.

## Appeal governance

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

Reviewer training is separate from reputation. Qualification updates use the
same `ReviewerQualificationUpdateRequest` on either supported method and carry
the state (`none`, `eligible`, `trained`, or `suspended`) plus a reason code.

Admin users do not vote on behalf of reviewers. An independently assigned
trained reviewer uses the authenticated public appeal surface only for their
own assignment: `GET /api/appeals/reviewer/assignments`,
`POST /api/appeals/<appealId>/recuse`, and
`POST /api/appeals/<appealId>/vote` with `decision` set to `overturn` or
`uphold`. Votes lock when recorded. These reviewer actions are never exposed
as a public Flutter voting workflow.

## Privacy, account, and publication actions

Read privacy requests before considering a legal hold. A legal hold is
materially sensitive: place or clear only the exact named record with the
required approval, then verify the corresponding audit event. User search,
status, and tier changes must use the exact user ID returned by the current
search result and must be audited. Editorial publication is limited to the
existing News Board workflow; do not use a retired invitation or ingestion
endpoint as a substitute.

## Completion checks

1. Verify health before and after a material incident action.
2. Confirm the response is private/no-store and capture its correlation ID.
3. Confirm the expected event appears in `GET /admin/audit`.
4. For appeal work, confirm the returned policy version, reviewer count, and
   adjudication status rather than inferring a final content state.
