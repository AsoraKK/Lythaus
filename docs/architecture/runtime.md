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
deployments are performed only by `.github/workflows/native-workers-deploy.yml`.
