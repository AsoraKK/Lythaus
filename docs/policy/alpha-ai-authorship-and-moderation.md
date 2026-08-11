# Alpha AI Authorship and Moderation Policy

Status: Approved amendment for controlled Alpha
Classifier: Lythaus Authenticity AI

## Public labels

Lythaus displays exactly one categorical label on every post surface:

- `Human-authored`
- `AI-assisted`
- `Under review`

Public APIs may also return the user declaration, whether the current label came from disclosure, automated classification, human review, or appeal outcome, the review/appeal state, the label-policy version, and relevant timestamps. Numeric confidence, thresholds, vendor payloads, internal reasoning, and risk scores are never public.

## Creation policy

Users must declare `human` or `ai_assisted`. Direct API calls without a valid declaration are rejected.

- Human-authored content is allowed unless it violates another content rule.
- AI-assisted text is allowed when disclosed, labelled, normalised, trimmed, and no longer than 249 user-perceived Unicode characters. It is Discovery eligible but receives no authorship reputation.
- AI-assisted text at 250 user-perceived characters or more is blocked. AI-assisted image and video publication is blocked.
- AI-generated content is blocked from normal public publication and may exist only in an author-private feedback, review, edit, delete, or appeal state where supported.
- Undisclosed or deceptively declared AI content enters review when Lythaus Authenticity AI conflicts with a human declaration.
- Classifier unavailability follows the audited Alpha configuration: `under_review` or `fail_closed`.
- Sexual exploitation, credible threats, illegal content, malicious impersonation, fraud, prohibited manipulation, and other safety/legal violations remain blocked regardless of declaration.

Honestly disclosed AI-assisted content receives a neutral disclosure ledger event. It receives no authorship points and no automatic penalty solely for honest disclosure. AI-generated public content receives no authorship reputation because publication is blocked.

## Appeals

The appeal record retains the original disclosure, automated classification, internal score and threshold version, appeal reason, independent trained-reviewer result, human adjudication, final label, final moderation action, decision version, and timestamps.

Each appeal requires five independently assigned trained reviewers, the approved weighted quorum and majority, and at least one trained Editorial/journalist adjudicator confirmation. Higher-risk cases require two adjudicators. Reviewer votes alone cannot change content state or override legal or safety requirements. Final updates invalidate cached public representations through private/no-store or revalidation-safe response policies.

## Surfaces

The categorical label is rendered in Discovery, followed/home feed, custom feeds, News Board, profile feed, post detail, and Lythaus-generated post cards/previews. Public Flutter models and widgets do not contain numeric AI score fields.
