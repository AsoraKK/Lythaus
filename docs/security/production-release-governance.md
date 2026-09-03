# Production release governance

Lythaus remains a private GitHub repository. GitHub Pro native branch
protection is enabled on `main` with strict required checks, zero required
approvals for the solo-founder policy, resolved conversations, linear history,
admin enforcement, and disabled force pushes/deletions.

`.github/workflows/production-release.yml` verifies the native protection state
and provides additional release controls. It runs only from `main`, requires the candidate SHA to equal both the
checked-out revision and current `origin/main`, and requires successful exact-SHA
CI, CodeQL, dependency-review, secret-scan, and historical-reconciliation runs.
It also verifies that the candidate is the merge commit of a merged PR into
`main`, that all review conversations are resolved, that the candidate commit is
single-parent, and that no merge commits are introduced between the previous
canonical production SHA and the candidate. Existing historical merge commits
are preserved; the first canonical release may use `NONE` when no previous
exact-SHA production release exists.

Provider evidence remains fail-closed: Cloudflare and PlanetScale must be
verified before any deployment job starts. Production still requires manual
workflow dispatch and explicit confirmation, exact-SHA deployment outputs,
rollback artifacts, production smoke checks, and a sanitized release manifest.
The manifest is uploaded with a SHA-256 integrity digest. GitHub artifact
attestations are not used because they require GitHub Enterprise Cloud for
private repositories; requiring that feature would reintroduce a paid-plan
dependency.

The additional release controls provide defense in depth beyond native branch
protection and prevent a revision from becoming a production release unless it
satisfies the merged-PR, ancestry, exact-SHA, security, and provider evidence
gates.

Release certification is not a runtime authentication dependency. The release
plan deterministically chooses `STANDARD_RELEASE` or
`AUTH_CRITICAL_RELEASE`, deploys only changed components, and records reused
production versions with explicit provenance. Standard releases use automated
readiness and production smoke without Keeper, Gmail, human Turnstile, or a
real acceptance account. Auth-critical releases retain the protected real
Turnstile, signup, email, verification/replay, login/session, resend, reset,
and revocation acceptance. The stable Coordinator can certify a reused Public
version by binding its encrypted context to that candidate's source SHA.

The five release gates are `SOURCE`, `INFRASTRUCTURE`, `CANDIDATE`,
`PRODUCT_ACCEPTANCE`, and `ACTIVATION`. Failure evidence distinguishes safety,
product, certification, observability, and tooling domains. Component-scoped
rollback restores only captured positive serving traffic for changed
components; zero-traffic candidates are never used as rollback targets.
