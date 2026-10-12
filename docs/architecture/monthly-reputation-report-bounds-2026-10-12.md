# Monthly reputation report engineering bounds

This preparation bounds the existing synchronous private v1 JSON/CSV reads and
the disabled disposable v2 reader/export helpers. It introduces no runtime v2
route, policy activation, pagination, database change, deployment or grant.

The limits are engineering resource budgets, not award limits, quotas on recorded
evidence, retention decisions or permission to omit corrections. Successful v1
response shapes, CSV columns/bytes and the historical 13,500 denominator retain
their fixtures. Disabled v2 retains 13,650, the optional 150 suggestion component,
fixed following-month authority and all prospective quarterly calendar expiry.
The prospective timezone remains the existing pending decision; the documented
UTC preview does not establish an approved production timezone.

## Trusted configuration

`monthlyReputationReportBounds` validates optional internal overrides from reader
`input.bounds`, route `dependencies.reportBounds` or serializer arguments. No
request parameter controls an owner, row limit or byte limit. Each route request
authenticates again and binds its queries to that fresh principal.

| Budget | Default | Hard ceiling |
| --- | ---: | ---: |
| Source revisions per subject/month/policy | 128 | 512 |
| Snapshot revisions per subject/effective month/policy | 256 | 1,024 |
| Assembly plus assessment JSON per source row | 512 KiB | 1 MiB |
| Assembly plus assessment JSON across source rows | 2 MiB | 4 MiB |
| Items in any JSON array, including private evidence | 2,048 | 4,096 |
| JSON nodes visited | 65,536 | 131,072 |
| JSON nesting depth | 32 | 48 |
| UTF-8 bytes in one string or object key | 64 KiB | 128 KiB |
| CSV data rows, excluding the header | 4,096 | 8,192 |
| Serialized JSON or CSV UTF-8 bytes | 2 MiB | 4 MiB |

Overrides must be positive safe integers, use known keys and stay within every
hard ceiling; the per-source byte budget cannot exceed the aggregate budget.
Absent overrides use frozen defaults. Invalid trusted configuration fails before
monthly data reads. These ceilings bound inputs and serialization structures;
they are not a claim of an exact JavaScript heap measurement or a benchmark.

## Database transfer and projection

The source query first materializes only scalar source identifiers/metadata,
scoped by authenticated subject, source month and recorded policy, with a
`LIMIT maximumSourceRevisions + 1` probe. A second materialized CTE computes
`octet_length(report::text) + octet_length(calculation::text)` within PostgreSQL.
It checks the row count, every row's combined JSON byte size and the aggregate
size. The final select uses guarded `CASE` expressions for both JSON payloads
and preparation matching. If any SQL budget is exceeded, it returns null JSON
payloads with `bounds_exceeded = true`; oversized payloads do not cross into
the Worker. It does not select raw source input or the separate assembly
`evidence_ids` column. Nested action evidence identifiers in the bounded stored
report are inspected internally and omitted from the public projection.

PostgreSQL must still inspect the stored JSON sizes within the bounded row set;
these transfer checks do not guarantee a specific database CPU or heap budget.
The reader runs in the caller's existing transaction and statement-timeout
boundary. No production schema or writer-size constraint is added here.

PostgreSQL must still inspect the stored JSON size for the bounded candidate
rows. This does not impose a universal database CPU or scratch-memory guarantee;
transaction statement-timeout protection remains the caller's responsibility.
The row/byte/node limits bound transfer into the Worker and subsequent structures.

Snapshot history independently uses a subject/month/policy-scoped `LIMIT + 1`
probe. The reader rejects either overflow before building correction lists.
Transferred JSON is also checked for array width, node count, depth, individual
strings and aggregate/per-row bytes before validation or action/week projection.
No evidence or correction list is sliced into a successful partial response.

JSON serialization counts its exact UTF-8 representation before constructing
the final string. CSV validates source structures, then checks each data row and
counts escaped cells, commas and CRLF bytes incrementally before joining bounded
lines. Formula prefixes remain protected; quoting, embedded line breaks and
multibyte characters count toward the final output budget.

## Overflow, privacy and complete access

The synchronous v1 route returns the existing documented HTTP 503 shape:
`error: monthly_report_resource_limit_exceeded` plus a fresh server-generated
`correlationId`, with `Cache-Control: private, no-store`. The error contains no
score, correction, evidence or subject identifier. It carries no CSV attachment
header. Existing unavailable/pending successful responses stay private and retain
their v1 shapes.

The owner-scoped private DSR/Data Passport mechanism remains the complete-data
access workflow. Its monthly adapter discovers all owner months and uses this
same reader; overflow propagates rather than returning already-read months as a
complete export. Jobs awaits that result in `build-data-passport` before storage
and completion, so an oversized request must remain incomplete for retry or
handling. This change does not deliver a complete large-history export capability.

A scalable full-history DSR export and any versioned pagination require a
dependent proposal preserving all corrections, evidence scope, immutable snapshot
identity and complete-data rights. The #964 response-contract preparation remains
a dependency for prospective API/consumer contracts. Pagination is not introduced
into the published v1 response, and affected v2 routes remain disabled. Review of
complete oversized DSR handling remains an activation prerequisite; increasing a
trusted limit cannot bypass the hard ceilings or certify that prerequisite.

## Evidence

Focused report/config tests cover SQL `LIMIT + 1` and guarded size expressions,
rejection before JSON access/projection, revision overflow, invalid configuration,
array/node/depth/string budgets, exact UTF-8 JSON/CSV boundaries, formula escaping
and historical CSV SHA-256 preservation. Route tests cover private overflow and
unavailable responses, fresh authentication, server-generated error correlation
and ignored request owner/limit inputs. The DSR adapter test proves overflow after
an earlier month propagates without returning a partial included result.

The existing PostgreSQL report suite now includes source and snapshot overflow,
cross-owner isolation, per-row and cumulative JSON budgets, and assertions that
oversized JSON is null in the real query result before Worker transfer. Final
commit-specific results and hosted checks belong in the draft PR review packet.
No synthetic fixture or this document authorizes a production provider operation
or runtime v2 activation.
