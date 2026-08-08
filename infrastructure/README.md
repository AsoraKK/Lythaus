# Lythaus infrastructure

The active infrastructure surface is Cloudflare-only. The canonical inventory is
`lythaus-resource-registry.json`; scoped production configuration is under
`cloudflare/`.

Before changing any provider resource:

1. Inspect the live shared account and current registry.
2. Reuse an existing approved Lythaus resource where possible.
3. Document cost and rollback impact.
4. Obtain explicit approval before creating resources or adding cost.

PlanetScale schema and forward migrations live under `database/planetscale/`.
