# Moderation operations

**Status:** Repository operational design / Partial deployment evidence. The exact reviewed SHA has not been verified in production.

Authority reconciled 11 October 2026: [current policy authority](../policy/current-policy-authority.md).
Reported release-108 deployment/smoke evidence does not certify production
authentication, detection or the full publishing pipeline. Public posting
remains withheld pending pipeline validation and separate activation approval.

## Runtime

The repository designs Lythaus moderation for the native Workers architecture:

- `lythaus-public-api-development` accepts content and records it as `under_review`.
- `lythaus-jobs-development` evaluates text, media, and profiles with Lythaus Authenticity AI.
- `lythaus-admin-api-development` exposes the protected human-review surface.
- PlanetScale PostgreSQL is the authoritative record for cases, detector runs, decisions, appeals, enforcement events, and audit entries.

There is no external classifier fallback. Evaluation failure leaves content under review for human handling.

## Daily triage

1. Open the Access-protected Lythaus control panel.
2. Review open cases from `GET /api/admin/moderation/cases`.
3. Prioritise credible threats, exploitation, self-harm, fraud, impersonation, and coordinated abuse.
4. Inspect the declaration, provider-neutral evaluation, policy version, and available context.
5. Record one decision through `POST /api/admin/moderation/cases/{caseId}/decision`.
6. Confirm the case, content state, public label, appeal state, enforcement event, and audit entry changed atomically; do not infer this from repository source alone—retain migrated runtime evidence.

Supported outcomes are `allow`, `block`, and `queue`. `queue` keeps the case open and the content under review.

## Appeals

Route appeals by their server-recorded policy version. New standard cases use
timed, private community review with one equal vote per eligible member, no fixed
trained panel or Level 5 weight, and no routine Editorial confirmation. Approved
timing/quorum rules and activation are separate gates; source presence is not
permission to enroll cases or collect ballots.

Historical `appeals-v1.0.0` cases retain their weighted trained-reviewer panel and
required adjudication. Follow the [historical admin operations](admin-ops.md)
for those cases; never mix historical ballots into the new evaluator or migrate
an open case by inference.

Restricted legal/safety cases and unresolved outcomes require accountable
protected handling. Ties, insufficient quorum, stale evidence, missing approval
or unsupported versions do not become a final decision. Inspect the recorded
policy/rules version, outcome, restoration hold and audit evidence. A new-policy
standard outcome may resolve without Editorial confirmation, but no appeal result
alone grants publication through a safety, privacy or publishing hold.

## Evaluation outage

1. Confirm the moderation queue and jobs Worker health.
2. Keep new content in `under_review`; do not bypass evaluation or publish a provider fallback.
3. Route urgent cases to the human queue.
4. Record the incident, affected event identifiers, queue depth, and recovery time without storing raw private content in operational notes.
5. Resume automated evaluation only after a synthetic event produces a detector run, decision, and audit record.

## Escalation

Escalate legal requests, credible imminent threats, exploitation material, and cross-platform abuse to the Trust and Safety lead and legal owner. Preserve evidence through the canonical audit and legal-hold paths; do not copy sensitive content into tickets or chat.

## Metrics

Track queue depth, time to first review, time to final decision, evaluation failure rate, appeal rate, appeal outcome, and decision reversals. Public APIs must never expose raw model scores, prompts, or internal reasoning.
