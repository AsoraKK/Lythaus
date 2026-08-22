# Lythaus documentation

This directory contains current architecture, product, policy, legal, security,
and operational documentation. Implementation chronology belongs in Git history.

The only retained provider-retirement records are the final history note under
`history/` and the sanitized GitHub credential-removal record under `security/`.

Material classification:

- Runtime and deployment source lives under `apps/`, `packages/`,
  `database/`, `infrastructure/`, and `.github/workflows/`.
- Tests and validation live under `scripts/tests/`, `test/`, and
  `integration_test/`.
- Canonical current-state documentation includes `README.md`, the active ADR,
  `architecture/`, `security/`, and `runbooks/`.
- Dated files under `history/`, `evidence/`, and `reports/` are evidence or
  historical context and do not override live provider inventory.
- Generated artifacts belong under ignored `.artifacts/` or generated contract
  paths; temporary `.codex-*` material is ignored and rejected if tracked.

The consolidation evidence index is under `evidence/repository/` and
`evidence/production-cutover/`. Missing provider access is recorded as
`UNKNOWN/BLOCKED` rather than inferred from repository configuration.
