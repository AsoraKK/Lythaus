# Azure GitHub secret and access removal — 6 August 2026

This record contains names and scopes only. Secret values were never read or recorded.

| Name or category | Scope | Deletion date | Operator | Verification status |
| --- | --- | --- | --- | --- |
| Azure candidate patterns | Repository Actions secrets | 2026-08-06 | Codex | Verified: zero matching names |
| Azure candidate patterns | Repository Actions variables | 2026-08-06 | Codex | Verified: zero matching names |
| Azure candidate patterns | `dev`, `staging`, `production` environment secrets | 2026-08-06 | Codex | Verified: zero matching names |
| Azure candidate patterns | `dev`, `staging`, `production` environment variables | 2026-08-06 | Codex | Verified: zero matching names |
| Azure candidate patterns | Repository Codespaces secrets | 2026-08-06 | Codex | Verified: zero matching names |
| Azure candidate patterns | Repository Dependabot secrets | 2026-08-06 | Codex | Verified: zero matching names |
| Azure deployment hooks and keys | Repository webhooks and deploy keys | 2026-08-06 | Codex | Verified: zero entries |
| Azure GitHub Apps | Account installation access | 2026-08-08 | Codex | Verified in signed-in GitHub UI: zero Azure deployment apps |
| Azure candidate patterns | Account Codespaces secrets granting repository access | 2026-08-08 | Codex | Verified in signed-in GitHub UI: zero secrets |
| Azure candidate patterns | Organisation Actions, Codespaces, and Dependabot grants | 2026-08-06 | Codex | Not applicable while owner is a personal account |

Repository Actions Azure secrets: 0
Repository Actions Azure variables: 0
Environment Azure secrets: 0
Environment Azure variables: 0
Organisation Azure grants to Lythaus: 0 (not applicable: personal owner)
Codespaces Azure secrets accessible to Lythaus: 0
Dependabot Azure secrets accessible to Lythaus: 0
Azure deployment GitHub Apps and webhooks: 0

## Final repository recheck — 7 August 2026

Codex rechecked the repository after the final retirement-cleanup commit. The
repository Actions, environment, Dependabot, repository Codespaces, deploy-key,
and webhook scopes contain zero Azure-pattern names or entries. Active
repository metadata also contains zero retired-brand labels, open milestones,
release titles, rulesets, or open issue and pull-request titles.

## Signed-in account recheck — 8 August 2026

Codex completed the two account-level checks in Kyle's signed-in GitHub user
interface. Personal Codespaces contains zero secrets. Installed GitHub Apps are
limited to ChatGPT Codex Connector, Cloudflare Workers and Pages, and Figma;
none is an Azure deployment integration. The Microsoft OAuth authorization has
profile and email read-only permissions and no repository or deployment access,
so it was retained. No valid non-Azure integration was removed.
