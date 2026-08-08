# Lythaus Authenticity AI

Lythaus Authenticity AI is the provider-neutral evaluation layer for text,
profile and media evidence. The jobs Worker runs evaluations through the
existing Cloudflare Workers AI binding and the `lythaus-ai` gateway.

## Decision boundary

- Model output is evidence for a human reviewer.
- Every model recommendation is normalised to `review`.
- Model output cannot publish, approve, reject or block content.
- An unavailable model or rejected budget reservation fails closed to human
  review without invoking a fallback provider.
- A later ADR is required before any authoritative automated decision.

## Runtime contract

- Package: `packages/authenticity`
- Consumer: `apps/lythaus-jobs`
- Evidence schema: `lythaus-authenticity-v1`
- Policy: `evaluation-only-v1`
- Provider label: `lythaus-authenticity-ai`
- Gateway: `lythaus-ai`
- Monthly budget cap: US$25

Production deployment remains gated on the corresponding PlanetScale
migrations and normal protected acceptance checks.
