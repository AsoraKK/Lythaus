# Runtime architecture

Lythaus runs on three native Cloudflare Workers:

- `lythaus-public-api` serves public, email-authenticated, and guest product APIs.
- `lythaus-admin-api` serves protected moderation and administration APIs.
- `lythaus-jobs` consumes queues and runs background workflows.

PlanetScale PostgreSQL is the canonical datastore and is reached through existing
Hyperdrive bindings. R2 stores media. Queues and Workflows carry asynchronous
tasks. Cloudflare Email Service sends transactional messages from
`no-reply@mail.lythaus.co`.

Lythaus Authenticity AI is provider-neutral and Lythaus-owned. Automated output
is evaluation evidence only: it always enters human review and never directly
allows, blocks, removes, or publishes content. The configured monthly evaluation
budget is US$25.

Email and guest access are the only initial authentication modes. Backend
deployment implementation is `.github/workflows/native-workers-deploy.yml`.
Production releases are coordinated by `.github/workflows/production-release.yml`
from one reviewed main SHA. The generated release manifest is the cross-provider
record; it must remain blocked when Cloudflare inventory or deployment evidence
is unavailable.

## Authentication and certification boundary

Runtime authentication and release certification are separate planes. A real
user depends only on Turnstile, the Public API, PlanetScale auth/session/
challenge state, the transactional outbox, Jobs, and Cloudflare Email. The
protected Coordinator, Keeper, browser/Gmail convenience automation, and
delivery observer provide release evidence only; they are never required for a
valid runtime verification challenge to be consumed.

The canonical release has five conceptual gates: `SOURCE`,
`INFRASTRUCTURE`, `CANDIDATE`, `PRODUCT_ACCEPTANCE`, and `ACTIVATION`.
`STANDARD_RELEASE` runs automated readiness and production smoke without a
human auth ceremony. `AUTH_CRITICAL_RELEASE` additionally runs the existing
real Turnstile/email/signup/verification/replay/login/resend/reset/session
revocation acceptance. See
`docs/architecture/adr-004-release-certification-separation.md` and
`docs/runbooks/production-auth-release-simplified.md`.
