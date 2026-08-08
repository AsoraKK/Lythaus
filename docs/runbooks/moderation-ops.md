# Moderation operations

## Runtime

Lythaus moderation is handled by the native Workers architecture:

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
6. Confirm the case, content state, public label, appeal state, enforcement event, and audit entry changed atomically.

Supported outcomes are `allow`, `block`, and `queue`. `queue` keeps the case open and the content under review.

## Appeals

Appeals remain open until an authorised human decision resolves the linked case. Community signals are advisory and cannot directly publish or block content. The appeal lifecycle Workflow closes appeals only after the case is resolved and records the action in the audit log.

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
