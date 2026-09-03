# Release manifest

`release-manifest.json` is the cross-provider record for a reviewed Lythaus
release. It is generated from a full 40-character reviewed Git SHA and records
the repository revision, native branch-protection and release-governance evidence, deployed
application surfaces, Worker versions, Pages projects/domains, Hyperdrive
target, and PlanetScale migration state.

Manifest v2 also records `releaseClass`, `releaseSha`, changed and reused
components, source/database/provider evidence, auth acceptance status and
expiry, activation/rollback/post-activation evidence, failure domains, and
per-component version status. Worker and Pages provenance is explicit:
`BUILT_FROM_RELEASE_SHA` for a new candidate or
`REUSED_KNOWN_GOOD_PRODUCTION_VERSION` for retained production state.

The five-gate state is recorded as `PREFLIGHT`,
`INFRASTRUCTURE_VERIFIED`, `CANDIDATE_READY`,
`PRODUCT_ACCEPTANCE_REQUIRED`/`PASSED` (or not required for standard
releases), `ACTIVATED`, `VERIFIED`, `ROLLED_BACK`, or `BLOCKED`.

Generate a local contract record with:

```text
RELEASE_SHA=<40-character-reviewed-sha> npm run validate:release-manifest
```

The manifest is intentionally `blocked` while Cloudflare deployment evidence
or surface-to-SHA mappings are unknown. Generation is read-only; it does not
deploy, alter DNS, change Hyperdrive, apply PlanetScale DDL, or rotate
credentials. Provider evidence must be collected separately and attached to
the release review before production approval. Native GitHub branch protection
must be `ACTIVE`; the manifest is ready only when the workflow's merged-PR,
resolved-conversation, linear-release-history,
prior-release-ancestry, exact-SHA security, and provider checks are verified.

For `STANDARD_RELEASE`, `authAcceptance.status` is `NOT_REQUIRED`; the absence
of a Keeper, Gmail, or human acceptance run is intentional. For
`AUTH_CRITICAL_RELEASE`, a `PASSED` status must retain the exact
`acceptanceRunId`, expiry, candidate source SHA, and dependency version IDs.
