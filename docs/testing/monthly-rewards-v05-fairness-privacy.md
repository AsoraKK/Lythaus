# Monthly rewards v0.5 local fairness and privacy repair

Repair baseline: `7f37759b016ea0a644748cc644158b752a00d88d`.
This record covers the subsequent local repair, separately from the
[original v0.5 validation](monthly-rewards-v05.md). No deployment, activation,
production migration, provider or real credential operation is included.

## Repaired behavior

Reconciliation attempt progress is committed before the independent candidate
transaction. Missing candidates and rejected historical week policies therefore
cannot leave the first 50 subject/month pairs permanently ahead of later eligible
accounts. Candidate rollback and immutable report semantics remain intact. A
Jobs-only definer constrains writes to an active subject, a supported enabled
configuration and a closed source month within its configured range.

The Data Passport and inventory now include candidate-only records and attempt
records across all stored months/revisions. Paused collection does not hide
retained personal data. Exported candidates use whitelisted projections and
bounded queries, with overflow rejecting the export instead of silently returning
a partial result. Inventory retries preserve recorded deletion state and handle
concurrent inserts. Subject deletion erases both record types.

Optional candidate read/configuration/projection failures disclose only a fixed
unavailable status while preserving valid confirmed authority. Prospective Jobs
configuration/query/attempt failures no longer interrupt legacy monthly work or
the later scheduled pipeline. Authentication and legacy failure handling retain
their existing boundaries.

## Executed validation

All SQL runs use fresh, owned, disposable loopback PostgreSQL 17 databases.
Counts overlap and are not a distinct-test aggregate.

| Check | Result |
| --- | --- |
| Focused v0.5 contracts, assembly, privacy, scheduling, DSR and API projections/routes | 70 passed, no failures or skips |
| Expanded v0.5 real PostgreSQL role/DSR/inventory/erasure suite | 11 passed, no failures or skips |
| New real PostgreSQL fairness/concurrency suite | 4 passed, no failures or skips |
| Existing isolated rewards/public membership/admin membership suites | 5, 6 and 4 passed respectively |
| Required monthly contract coverage | 78 passed; 98.26% lines, 97.98% branches |
| Native architecture | 383 passed, no failures or skips |
| Marketing and exact source allocations | 107 passed, no failures or skips |
| Isolated PostgreSQL runner contracts | 7 passed, no failures or skips |
| Native TypeScript, repository hygiene, branding, documentation secrets and whitespace | Passed |

The actual fairness fixture establishes all of these boundaries:

- Fifty pre-collection pairs produce no candidate; the next batch still reaches
  39 eligible pairs after the remaining 11 unattempted pairs.
- Fifty recorded weekly-policy mismatches roll back candidate work; the next
  batch still creates 11 eligible candidates.
- A committed attempt survives an interrupted candidate transaction, whose
  candidate insert rolls back. Concurrent attempts keep one stable row and count
  all attempts. Concurrent inventory reconciliation succeeds without duplicates.

The first fairness fixture run failed because generated UUIDv7 order was not
guaranteed to match SQL UUID ordering. The fixture now explicitly sorts identifiers
before assigning the first 50 policy mismatches. No production assertion or policy
check was weakened. The failed run and passing rerun remain separate local logs.

The shared Jobs entrypoint delta was independently reviewed at exact Git blob
`1c0b7626e880156bd72ddbbb71d413a24dad292d`. The public API entrypoint remains at
its previously reviewed blob `91fa5fa0217ec18da0896f57adbffd04deb703f8`.

The full 44-module critical coverage result, Flutter/OpenAPI checks and historical
snapshot clock skips in the original record belong to baseline `7f37759`; they
are not claimed as reruns on this repair. A separate local validation manifest
records the repaired commit and the exact additional commands/results.

Actual security/suggestion evidence producers, positive quarterly SQL clock
acceptance, measured late-evidence completeness and finalisation/activation gates
remain open. Publication status is managed separately from these local checks.
