# Support server lifecycle slice

Base: `dba135ca3720b1311c5ec3d1d9e00ab7a67a568d`, verified against remote
`main` on 2026-10-10. PRs #975–#978 are included. Open PR #947 owns the
unapplied support schema/grants proposal; this slice does not promote it.
No `.agents/skills/SKILL.md` exists in this saved checkout; `AGENTS.md` and
`README.md` were read before editing.

## Demonstrated defect

The canonical `SupportUnsupportedMedia` response says mutations require
`application/json`. The support dispatcher previously called the bounded JSON
reader without checking media type. A regression on the base returned 201
instead of 415 for a member submission without that header (9 passed, 1 failed).
Valid JSON labeled `text/plain` was likewise eligible for a real mutation.

`packages/db/src/support-feedback-http.ts` now validates the media type before
reading the body or dispatching a mutation, accepts case-insensitive JSON with
parameters, and maps the fixed `unsupported_media_type` code to 415. The
existing unavailable-policy/schema response takes precedence. The Admin
Worker's existing origin/media guard remains in place; no shared router or
OpenAPI changes are needed.

## Requirements, code and tests

| Requirement | Existing or changed code | Regression evidence |
| --- | --- | --- |
| Separate problem/suggestion flows, disabled activation | Existing kind parser, two route collections, Worker feature checks | Existing contract/routing tests; new lifecycle cases run both kinds |
| Reject attachment transport without a partial logical operation | Changed support HTTP media guard | HTTP cases assert 415, zero body reads/dispatches; actual Public Worker cases assert no marker, content or quota use and same-key JSON retry |
| One logical member/staff reply | Existing actor-scoped markers and transactional service | Concurrent same-key replies in both kinds/channels produce one record, audit, intent and quota unit; changed payload conflicts; replay projects current state |
| Concurrent edit/status safety | Existing request row lock and expected revision | Eight deterministic scenarios cover closure versus member reply/private note, both lock orders and both kinds; actual PG blocking is observed; loser marker rolls back |
| Current authority, isolation and enumeration | Existing signed subject, fresh account/version, current owner membership, kind/subject filter | Signed account switching gives identical peer/unknown detail/reply 404s; non-owner staff gets 403; guest write gets 401 |
| Minimize private evidence and deny attachment access | Existing strict submissions, owner-only evidence, public/system projections | New cases reject attachment IDs/arrays and member private actions; owner evidence references never appear in member output; existing tests verify minimal audit/intent/replay metadata and same-request closure evidence |
| Retention redaction and safe retries | Existing bounded privacy scrub, holds and provenance guards | Both closed kinds lose notes, evidence, decisions, messages, refs, markers, intents and configured audits; old replies/notes return 404; peer/open records survive; retry is a no-op |
| Optional schema safely absent/incomplete | Existing readiness guards and privacy adapter | Existing real-PG absent/partial relation and grant tests plus canonical and native Jobs child suites |

New lifecycle cases are in
`packages/db/tests/support-feedback-lifecycle.postgres.mjs`, registered by the
existing PG17 entrypoint. Its query-capture hook now awaits an optional callback
so lock winners are controlled by explicit gates instead of timing guesses.

## Local validation

Node 22.23.3, disposable loopback PostgreSQL 17.11. The existing fixture applies
approved migrations and support proposals only to per-run disposable databases;
it never accesses a provider database. The local container is removed after use.

- Native TypeScript: `npm run typecheck:native` passed.
- Scoped contract/policy/HTTP/runtime/Worker routing command from
  `.github/workflows/support-feedback-pg17.yml`: 38 passed, zero failed/skipped.
- Existing `support-feedback.postgres.mjs` command: 57 outer cases passed,
  including all five new lifecycle cases; child processes verify 17 canonical
  cases and 12 native Jobs Workflow cases, zero failed/skipped.
- HTTP source coverage: 100% lines, 87.72% branches, 100% functions;
  explicit 80% line/branch gates passed (10 tests).
- OpenAPI lint passed with its two existing unrelated warnings.
- Migration baseline, native Worker config, repository hygiene, retired-provider
  validator, new test syntax and `git diff --check` passed.
- Existing rendered staff-console test passed at 1280×900 and 390×844 using
  explicit synthetic API fixtures on a loopback Vite server (one test, two
  viewports). Keyboard selection, separate queues, Unicode limits, closed
  replies, no horizontal overflow and no page errors were verified. Screenshots
  are local at `/tmp/lythaus-support-lifecycle-browser/`; no UI code changed.

Full production/provider acceptance and owner hands-on tests are unrun. Owner
testing is postponed to Sunday October 11. Exact-head hosted receipts are
reported in the PR/handoff after completion.

## Gates and rollback

Read-only PlanetScale MCP confirmed `lythaus/lythaus-core` is ready, only `main`
exists, and `postgres.support` has no relations. No development branch is
created. Six-relation deployment, least-privilege grants, privacy locator/Jobs
integration review, provider acceptance, unresolved product settings and owner
approval remain gates. Suggestions' requested 150 quarterly/fixed calendar
quarter rule is outside this slice; no award implementation or policy change is
made. Support and rewards remain disabled; no provider resource, credential,
live migration, live user mutation, merge or deployment occurs.

GitHub denied `GET /repos/{owner}/{repo}/branches/main/protection/required_status_checks`
for the canonical repository with HTTP 403, `Resource not accessible by integration`. That operation stopped;
the required-context configuration is unknown. Visible checks can still be
monitored against the exact PR head without substituting another protection
access route.

Rollback is a reviewed revert of this slice. There is no schema/data/config
rollback. Keep the activation gates closed during parent-controlled integration.
