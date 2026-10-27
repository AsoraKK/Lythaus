# Non-security earning and monthly settlement

Source baseline: `868be4ee163ba5f7968212230d731682ff005e45`.
Status: tested code preparation; no migration, deployment, collection or award activation.
Authority: [current policy authority](../policy/current-policy-authority.md), plus
the delegated owner's prohibition on AI-assisted contribution points. Historical
recorded policies and the signed catalogue remain unchanged.

## Implemented connection

Canonical content and final community-ballot events already feed versioned
contribution evidence, receipts and capped weekly revisions. Monthly assembly
selects the best four settled weeks, records a source revision and requests a
shadow assessment. Separately approved snapshots fix the following month's
level; paid-tier reward selection is resolved independently.

This slice closes three gaps along that path:

- Monthly assembly now checks relevant persisted final peer participation even
  when the caller omits peer rules. Missing, unavailable, later-start, overlapping
  or paused configuration cannot silently omit those contributions. The caller
  must explicitly supply the matching supported approved rules and drain their
  canonical events. Receipts preserve the consumed version; replay reuses the
  immutable source. No configuration is selected or activated automatically.
- A separately versioned weekly proposal excludes AI-assisted evidence from
  contribution awards, breadth families and reception support. It preserves the
  existing 50-point declaration-compliance award, independent human awards and
  all award amounts/caps. The exact pair is
  `weekly-earning-human-contributions-proposal-v2` /
  `human-contributions-2026-10-v1`; neither is seeded or configured. Legacy rules
  retain their existing result bytes. Existing weekly rules-version locking
  prevents converting a recorded period. This weekly proposal does not activate
  prospective aggregate monthly v2 or establish specialist eligibility.
- The API's top-level current-level fields require a confirmed snapshot.
  Pending default Level 1 and shadow levels remain distinct. Flutter validates
  the nested snapshot policy and following-month binding, keeps confirmed level
  authority separate from pending reward selection, and clears prior-account
  projections on session changes. Historical v1 retains 13,500; the existing
  explicitly disabled v2-preparation format can display a 13,650 shadow only.

The cumulative reputation evaluator and diminishing returns, auth/settings,
security award mapping, comment/reply producers, media/Jobs sources, API
entrypoint, runtime configuration and migration manifest are unchanged.

## Validation

All database work used a task-owned disposable loopback PostgreSQL 17.11
container and synthetic fixtures. Approved baseline migrations through 0021
and grants were validated locally. Fixtures removed their proposed schema.

| Check | Result |
| --- | --- |
| Peer omission regression before fix | Failed as expected: missing rules allowed a zero-point monthly source |
| Assisted contribution regression before fix | Failed as expected: assisted work could receive primary/reception awards |
| Contracts: earning, eligibility, monthly, maintenance, preparation and product policy | 79 passed |
| Earning calculator coverage | 100% lines, 98.64% branches |
| API projection and monthly read routes | 21 passed; new projection helper 100% lines/branches |
| Real PostgreSQL earning transactions | 12 passed, including replay, duplicate delivery, correction, deletion and rollback |
| Real PostgreSQL community appeals / monthly assembly | 28 passed in each suite |
| Real PostgreSQL immutable monthly snapshots | 26 passed, 6 skipped; positive prospective-v2 tests require a PostgreSQL clock after 2026-11-04 |
| Historical evaluator / persistence regression | 16 passed |
| Flutter model, widget, provider, rewards, profile and historical regression | 62 passed across 9 suites; Flutter 3.41.1 / Dart 3.11 |
| Native architecture / workflow pins | 69 passed |
| Native typecheck, Flutter analyzer and whitespace | Passed |

An initial architecture run failed because npm/Wrangler tried to use unavailable
home-directory caches. It passed using the existing writable workspace caches.
No tests remain failing. Positive prospective-v2 clock-profile acceptance was
not run in this slice; the six skips are not acceptance evidence.

## Integration and activation gates

No comment/reply producer patch is required: this slice consumes existing
canonical events and retained creation-mode facts. Coordinate merges of the
peer regression in `apps/lythaus-public-api/tests/community-appeals.postgres.mjs`
with the comment/reply lane. No shared API entrypoint patch is needed.

Before any new collection or awards, the parent must coordinate an approved
future rules/period cutover and explicit configuration, preserving recorded
period identities. Calendar ownership/timezone and settlement conventions
(D01/D02), breadth and contextual rubrics (D03/D05), specialist acceptance
sources/eligibility (D04), reception evidence/fairness (D06), and peer operational
defaults/participation (D09/D10) retain their existing approval gates. Missing
specialist and reception sources are not replaced by likes, follows, ticket
closure or detection feedback. The security choice/grace decision belongs to
the separate security lane and is not reopened here.

Approved migration/privacy review, first source/effective month, signed reward
obligations and commercial rules, exact-SHA CI, parent review and owner-controlled
deployment/activation remain separate. No live awards, claims, credential or
provider changes were performed.
