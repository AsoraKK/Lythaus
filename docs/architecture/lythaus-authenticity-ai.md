# Lythaus Authenticity AI

Lythaus Authenticity AI is the Lythaus-owned authenticity decision system for
text, profiles and feature-gated media. Provider integrations are replaceable;
the evidence schema, model registry, policy engine, thresholds, evaluation
datasets, versioning, appeals and rollback remain Lythaus responsibilities.

## Decision boundary

- User declaration and deterministic policy checks are authoritative for the
  explicit publication rules.
- Model output is structured evidence for policy and human review.
- The first reasoning/orchestration candidate is
  `@cf/openai/gpt-oss-20b` through Workers AI and AI Gateway.
- The reasoning model is not an authorship detector and cannot be the sole
  blocking authority.
- Every evaluation currently normalises to `review`.
- Unavailable inference or a rejected budget reservation fails closed to human
  review without invoking a fallback provider.
- A future blocking model requires a model card, dataset lineage, independent
  evaluation, shadow mode, rollback and appeal testing.

## Pipeline

`Submit -> Declaration -> Deterministic policy -> Provenance/C2PA -> Specialist text/image/video/audio models -> Behaviour and duplication signals -> Versioned reasoning -> Lythaus policy engine`

Video and audio checks remain feature-gated until their modality-specific
acceptance gates pass. Thread segmentation, screenshots and other evasion
patterns are evaluated cumulatively.

## Publication policy

- Human-authored text is allowed, Discovery eligible and reputation eligible.
- AI-assisted text of at most 249 normalised user-perceived Unicode characters
  is allowed with its categorical label, Discovery eligible and not eligible
  for authorship reputation.
- AI-assisted text of 250 or more characters is blocked.
- AI-assisted media and AI-generated public content are blocked and excluded
  from Discovery, custom feeds and public profiles.
- Blocked AI-generated content may remain temporarily in an author-only private
  feedback state for editing, deletion or appeal.

Spellcheck, grammar correction, formatting, accessibility assistance and
transcription of the user's own speech do not automatically change authorship.

## Evidence record

Each decision records the submission/content ID, declaration, evidence bundle,
classifier and reasoning-model versions, policy and threshold versions,
correlation ID, timestamp, final classification, publication/discovery/
reputation eligibility and appeal outcome. Internal scores support calibration
and enforcement but are never public metadata. Hidden model reasoning is not
stored as an ordinary audit field; store concise reason codes and evidence
references instead.

## Acceptance targets

- human-content false-positive rate at most 1% overall;
- no material subgroup or supported-language rate above 2% without approved
  mitigation;
- independent modality-specific test sets and human-adjudication comparison;
- shadow-mode deployment before any automatic blocking authority;
- measured latency and cost with a hard monthly budget stop; and
- tested rollback and appeal paths.

## Runtime contract

- Package: `packages/authenticity`
- Consumer: `apps/lythaus-jobs`
- Application evaluation schema: `lythaus-authenticity-v2`
- Foundation evidence schema: `lythaus-authenticity-evidence-v1`
- Foundation policy: `lythaus-authenticity-policy-v1`
- Provider label: `lythaus-authenticity-ai`
- Gateway: `lythaus-ai`
- Monthly evaluation cap: US$10 experimental ceiling

Production deployment remains gated on the corresponding PlanetScale
migrations, exact-SHA deployment checks and protected acceptance evidence.
