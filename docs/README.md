# Lythaus documentation

This directory contains current architecture, product, policy, legal, security,
and operational documentation. Implementation chronology belongs in Git history.

The only retained provider-retirement records are the final history note under
`history/` and the sanitized GitHub credential-removal record under `security/`.

Material classification:

- [Current policy authority](policy/current-policy-authority.md) records the
  latest supplied owner decisions and takes precedence for prospective policy.
  It separates historical versions, implementation evidence and activation.
- `policy/reputation-policy-v1.md` explains historical `reputation-v2.0.0` and
  weighted `appeals-v1.0.0`; its historical body is preserved unchanged and does not govern new
  standard community appeals. The dated monthly v1 candidate and signed catalogue
  likewise do not override the 7 October calendar-quarter-end decision.
- Public/legal copy remains at the reviewed baseline in this alignment PR.
  Public terms and community-guideline amendments require separate deliberate
  review; technical authority records do not automatically amend them.

- Runtime and deployment source lives under `apps/`, `packages/`,
  `database/`, `infrastructure/`, and `.github/workflows/`.
- Tests and validation live under `scripts/tests/`, `test/`, and
  `integration_test/`.
- Canonical current-state documentation includes `README.md`, the active ADR,
  `architecture/`, `security/`, and `runbooks/`.
- Product implementation and release-state tracking: [product gap goal
  checklist](product/gap-goal-checklist.md).
- Dated files under `history/`, `evidence/`, and `reports/` are evidence or
  historical context and do not override live provider inventory.
- Generated artifacts belong under ignored `.artifacts/` or generated contract
  paths; temporary `.codex-*` material is ignored and rejected if tracked.

The consolidation evidence index is under `evidence/repository/` and
`evidence/production-cutover/`. Missing provider access is recorded as
`UNKNOWN/BLOCKED` rather than inferred from repository configuration.

Run the local [authority alignment checks](testing/authority-alignment.test.mjs)
with `node --test docs/testing/authority-alignment.test.mjs`. These checks cover
documentation contradictions; they do not certify runtime policy or provider state.
