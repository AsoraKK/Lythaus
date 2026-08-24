# Production release governance

Lythaus remains a private GitHub repository. GitHub Free does not expose native
branch protection or repository rulesets for private repositories, so the
canonical release workflow records this as
`nativeBranchProtectionStatus: UNAVAILABLE_BY_PLAN` rather than pretending that
the ref is protected.

`.github/workflows/production-release.yml` provides the compensating release
control. It runs only from `main`, requires the candidate SHA to equal both the
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

This compensating model cannot physically prevent a force-push or deletion of
`main` on GitHub Free. It prevents such a revision from becoming a production
release unless it satisfies the merged-PR, ancestry, exact-SHA, security, and
provider evidence gates.
