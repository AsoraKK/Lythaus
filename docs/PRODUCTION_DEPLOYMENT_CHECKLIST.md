# Production release checklist

Production releases are coordinated by
`.github/workflows/production-release.yml` from one reviewed 40-character main
SHA. The workflow delegates to the exact-SHA marketing, Flutter web,
control-panel, and Workers/jobs workflows, then uploads the release manifest.

Use `docs/runbooks/release-manifest.md` for the manifest contract and
`infrastructure/cloudflare/production-gates.json` for the provider and rollback
gates. A green repository run is not production approval; Cloudflare,
PlanetScale, credential-rotation, rollback, and human approval evidence must be
complete before `GO`.
