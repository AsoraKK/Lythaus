# Release manifest

`release-manifest.json` is the cross-provider record for a reviewed Lythaus
release. It is generated from a full 40-character reviewed Git SHA and records
the repository revision, deployed application surfaces, Worker versions,
Pages projects/domains, Hyperdrive target, and PlanetScale migration state.

Generate a local contract record with:

```text
RELEASE_SHA=<40-character-reviewed-sha> npm run validate:release-manifest
```

The manifest is intentionally `blocked` while Cloudflare deployment evidence
or surface-to-SHA mappings are unknown. Generation is read-only; it does not
deploy, alter DNS, change Hyperdrive, apply PlanetScale DDL, or rotate
credentials. Provider evidence must be collected separately and attached to
the release review before production approval.
