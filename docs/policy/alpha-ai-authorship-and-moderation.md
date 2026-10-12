# Alpha AI Authorship and Moderation Policy

Status: Approved amendment for controlled Alpha
Classifier: Lythaus Authenticity AI

Authority reconciled 11 October 2026: [current policy authority](current-policy-authority.md).
The disclosure rules below remain unchanged. Public publishing stays withheld
until the complete pipeline is validated and activation is approved; this Alpha
policy and owner-test deployment do not certify authentication or detection.

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

The appeal record retains the original disclosure, classification and threshold
version, reason, policy-versioned review/outcome, final label and moderation
action, decision version and timestamps. Private scores and evidence remain
internal. Historical reviewer and adjudication evidence must be preserved.

New standard appeals use timed, private community review with one equal vote per
eligible member and no routine Editorial confirmation. The duration, quorum and
activation are separate approvals. Restricted safety and unresolved cases require
accountable handling; no outcome may override legal or safety requirements.

Historical `appeals-v1.0.0` cases retain five trained reviewers, weighted quorum
and majority, and trained Editorial/journalist confirmation (one standard, two
high-risk). These rules do not govern new standard cases. Final updates invalidate
cached public representations through private/no-store or revalidation-safe
response policies; a resolved appeal does not bypass publishing holds.

## Surfaces

The categorical label is rendered in Discovery, followed/home feed, custom feeds, News Board, profile feed, post detail, and Lythaus-generated post cards/previews. Public Flutter models and widgets do not contain numeric AI score fields.
