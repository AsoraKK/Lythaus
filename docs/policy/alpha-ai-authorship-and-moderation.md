# Alpha AI Authorship and Moderation Policy

Status: Approved amendment for controlled Alpha
Classifier: Lythaus Authenticity AI

## Public labels

Lythaus displays exactly one categorical label on every post surface:

- `Human-authored`
- `AI-assisted`
- `AI-generated`
- `Under review`

Public APIs may also return the user declaration, whether the current label came from disclosure, automated classification, human review, or appeal outcome, the review/appeal state, the label-policy version, and relevant timestamps. Numeric confidence, thresholds, vendor payloads, internal reasoning, and risk scores are never public.

## Creation policy

Users must declare `human`, `assisted`, or `generated`. Direct API calls without a valid declaration are rejected.

- Human-authored content is allowed unless it violates another content rule.
- AI-assisted content is allowed when disclosed and labeled.
- AI-generated content is allowed when disclosed and otherwise policy-compliant, but it cannot receive positive reputation awards.
- Undisclosed or deceptively declared AI content enters review when Lythaus Authenticity AI conflicts with a human declaration.
- Classifier unavailability follows the audited Alpha configuration: `under_review` or `fail_closed`.
- Sexual exploitation, credible threats, illegal content, malicious impersonation, fraud, prohibited manipulation, and other safety/legal violations remain blocked regardless of declaration.

AI-assisted content currently receives the neutral disclosure ledger event and no disclosure-specific score adjustment. It may receive ordinary reputation only where the canonical event policy explicitly permits it; AI-generated content never receives a positive award.

## Appeals

The appeal record retains the original disclosure, automated classification, internal score and threshold version, appeal reason, advisory community recommendation, human adjudication, final label, final moderation action, decision version, and timestamps.

Community voting is advisory, not binding. Votes alone cannot change content state or override legal/safety requirements. An authorized human records the final label and action; that update invalidates cached public representations through private/no-store or revalidation-safe response policies.

## Surfaces

The categorical label is rendered in Discovery, followed/home feed, custom feeds, News Board, profile feed, post detail, and Lythaus-generated post cards/previews. Public Flutter models and widgets do not contain numeric AI score fields.
