# ADR: Email and guest authentication only

- Status: Accepted
- Date: 2026-08-08
- Scope: Initial Lythaus launch

## Decision

The initial Lythaus authentication surface consists of:

1. verified email authentication; and
2. guest access for the read-only product experience.

Google, Apple, World ID, Entra, Azure B2C, generic OAuth provider selection,
and provider-specific callback flows are removed from the launch surface. They
are not deferred implementation work and must not be restored as a missing
feature. Direct calls to a removed provider must return `provider_unavailable`.

## Rationale

Email and guest access are the smallest launch surface compatible with the
current Cloudflare Worker API, PlanetScale identity schema, and product access
rules. Removing unused provider flows reduces identity-linking, callback,
secret, and support complexity while the Lythaus identity model is stabilised.

## Consequences

- The Flutter auth choice screen exposes email and guest actions only.
- Native Workers accept email and guest identity paths only.
- Existing provider-link migrations remain checksum-immutable; forward
  migrations constrain active records to email and migration provenance.
- Any future provider requires a new ADR, explicit API/interface review, and
  a new launch decision before code or configuration is added.
