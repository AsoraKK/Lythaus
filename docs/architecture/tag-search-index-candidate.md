# Tag search index candidate

This is an offline implementation proposal. Its SQL lives in
`database/planetscale/proposals/0021_tag_search_index_candidate.sql`, outside
the canonical migration manifest. It is not approved production DDL. Both
Worker flags default off in runtime configuration; this change does not set
them, change an account setting, or enable search.

## Proposed token policy

The existing request parser remains authoritative for query normalization: it
accepts an optional leading `#`, applies NFC and lowercase normalization, and
accepts 1–64 Unicode letters, numbers, or underscores. The body parser in this
proposal uses the same normalization.

The proposed body token is `#` followed by 1–64 Unicode letters, numbers, or
underscores. `#` must be at the start of the body or follow a character that is
not a letter, number, underscore, or `#`. A token ends at a non-letter,
non-number, or non-underscore character. Repeated normalized tags count once.

Examples:

- `#City_Update` indexes as `city_update`; `#Café` and `#café` index as `café`.
- `#cityscape` does not match a search for `city`.
- `mail#city` and `##city` do not index `city`.
- `#city-news` indexes `city`; the hyphen is a token boundary in this proposal.
- A 65-character word after `#` is rejected as one token; it is not truncated.
- Repeating `#city` 20 times uses one distinct-tag slot.

The default cap of **16 distinct tags per post is proposed and unapproved**.
When tag-index maintenance is explicitly enabled, new post creation and body
edits above the configured cap return the clear `post_tag_limit_exceeded`
validation error before inserting/updating content or index state. The
maintenance flag defaults off, and this cap remains unapproved until the owner
chooses it.

Historical posts above the cap are handled separately during offline
backfill. Their index state remains complete and records
`legacy_tag_limit_exceeded` plus the exact observed tag count; no searchable
token rows are written for that post. The control row and backfill output
report `legacy_tag_limit_excluded_post_count`. This does not delete, unpublish,
or change visibility of old content: otherwise-eligible legacy posts remain in
ordinary public feeds, but are omitted from tag-search results. They consume no
tag candidate slots and cannot make a legitimate post's popular tag
unavailable. The owner must decide how to communicate or remediate this legacy
search exclusion before activation; the candidate performs no bulk content
mutation.

The 50,000-token ceiling is only an implementation safety bound, not a product
limit. A parser result above that ceiling or an invalid/inconsistent index
record is treated as systemic incompleteness and closes the global search gate.
That condition is distinct from a complete historical over-limit state, which
does not close the gate or fail individual tag searches.

The proposed query cap is **1,000 candidate posts per request**, also
unapproved and configurable. It bounds viewer-specific block/mute checks and
metadata joins. If those filters leave too few results within the cap while
more matching candidates remain, that request returns unavailable rather than
a partial page or false empty result. The response does not disable the global
tag index or other tags. A member with many blocked or muted authors among the
newest matches can therefore see a temporary unavailable state even when
older visible posts exist. The owner must approve this request-level
availability trade-off.

The parser uses JavaScript Unicode property classes and lowercase behavior so
indexing agrees with the existing Worker query parser. PostgreSQL does not
tokenize the body: locale-sensitive database regular expressions would not
provide the same Unicode contract.

## Data and query safety

The candidate keeps tokens in a private side table with a unique
`(post_id, tag_key)` key and a B-tree on
`(tag_key, indexed_published_at DESC, post_id DESC)`. A state row records the
extractor version, distinct count, completeness, and any per-post exclusion
reason; token rows also record whether they are searchable. The runtime cannot
select the private state or token tables. It calls a
`SECURITY DEFINER` search function that returns only bounded post identifiers
after checking active authors, published public posts, allowed moderation
state, accepted public-authorship labels, `review_required = false`, blocks,
mutes, and chronological keyset position.

The route repeats those checks against authoritative post/declaration rows and
keeps the existing chronological keyset order, trust fields, request rate
limit, account-block rules, and viewer-mute rule. It never searches post bodies
at request time. Guests can only read these public results. Unknown tags return
an empty page only after the index readiness gate succeeds; missing schema,
incomplete backfill, policy mismatch, cancellation, or query failure returns
`tag_search_unavailable`.

Post creation and body edits are checked against the configured cap before
their write transaction when the maintenance flag is explicitly enabled, then
write valid side-index entries in that same transaction. Database triggers
clear tokens when a post is soft-deleted or its body changes, refresh indexed
publication timestamps only for searchable complete state, and disable search
if an eligible post commits without complete index state.
The public query still checks current blocks, mutes, author status, visibility,
deletion, moderation, and review state on every request. No profile, admin, or
jobs source files are changed; `discovery_candidates`, `user_inbox`,
`auth_sessions`, `handles`, and `refresh_token_families` are untouched.

## Backfill and capacity evidence

`apps/lythaus-public-api/scripts/tag-search-index-maintenance.mjs` provides
local-only `backfill` and `reconcile` operations. It rejects non-local database
hosts, uses batches of at most 500 rows, persists a UUID keyset cursor in each
batch transaction, writes each extracted batch in one database round trip, and
resumes after interruption. A terminal completeness check triggers at most
one bounded restart sweep for rows that became incomplete behind the cursor;
if incompleteness persists, the command emits a blocked result and exits
rather than spinning without progress. Backfill reports legacy excluded-post
counts. Reconciliation compares body-derived tokens and exclusion state to
stored state, so clean overflow is not a mismatch and stale token rows remain
detectable. Neither operation enables search. Runtime
reads also require
`TAG_SEARCH_INDEX_READ_ENABLED=true`, a matching
`TAG_SEARCH_MAX_DISTINCT_TAGS_PER_POST` and
`TAG_SEARCH_MAX_CANDIDATES_PER_REQUEST`, and a control row whose policy,
backfill, and reconciliation gates are all approved and complete. Those
settings are not set by this change.

The scale test uses 75,000 synthetic posts, the exact SQL stored in the
bounded search function, a 4 MB `work_mem`, a 64 MB `temp_file_limit`, and no
parallel workers. On a fresh local PostgreSQL 17 database, a tag miss examined
zero posts in 0.107 ms (3 shared hits, no reads); a common-tag query returned a
26-row page after examining 1,000 bounded candidates in 13.087 ms (15,028
shared hits, no reads). Both plans used the tag B-tree; the common-tag plan
read at most 1,001 token rows (the 1,000-candidate cap plus its truncation
sentinel), used indexed point lookups for post, state, declaration, and author
metadata, and did not scan declarations. These are single-run local
measurements, not a latency target or a production forecast.

The one-tag-per-post fixture wrote 75,000 state rows and 75,000 token rows, or
two side-table rows per post. The token table used 8,192,000 heap bytes,
8,388,608 bytes for its primary key, 7,241,728 bytes for its lookup index, and
23,855,104 bytes total. The state table plus its primary key used 16,220,160
bytes. No separate overflow index is added: searchable and excluded tags reuse
the same primary key and lookup B-tree. At the proposed cap, 16 distinct tags
can add 16 token rows and 32 index entries per post, plus one state row. This
illustrates possible write amplification;
the test does not model production tag distribution, update churn, vacuum, or
replica/backup overhead. The test measures storage on a disposable local
synthetic corpus and does not estimate production bytes.

The owner supplied a PlanetScale weekly report for Sep 28–Oct 5: main PS-5 was
reported as 1/16 vCPU and 512 MB RAM, with average memory at 100% Sep 28–Oct 3,
65% Oct 4, CPU at 18–20%, and storage at 583 MB. Those figures are historical
telemetry, not proof of current pressure, an outage, or upgrade approval. The
constrained local test is a guard against an unbounded body scan; it is not a
simulation of that service tier. Before activation, the owner still needs to
choose a representative production corpus size, an acceptable query latency
and memory budget, a write-amplification/storage budget, and the operational
response when an individual query is unavailable or systemic corruption closes
the global gate.

## Decisions still required

1. Approve or change the exact boundary/normalization semantics, including
   whether hyphenated text such as `#city-news` should index `city`.
2. Choose the over-16 post policy: (a) reject/hold new and edited bodies with a
   clear per-post validation result, while legacy posts remain visible in
   ordinary feeds but are excluded from tag search and reported per post; or
   (b) approve a higher bounded tag cap after storage testing. The candidate
   implements (a) only when indexing maintenance is explicitly enabled; the
   cap and legacy remediation policy remain unapproved.
3. Keep the 1,000-candidate request cap and accept a retryable per-request 503
   when blocks/mutes consume the window, or approve a larger bounded cap after
   service-budget testing. Neither outcome disables other tag searches.
4. Approve production corpus, memory, latency, write-amplification, and storage
   targets using current PlanetScale telemetry.
5. Approve the canonical migration, maintenance-before-read rollout order,
   backfill/reconciliation evidence, and an activation owner. This proposal
   does not perform that rollout.
6. Define Trending ranking inputs, window, tie-breaking, eligibility, and
   privacy rules before implementing its destination. No ranking policy or
   public popularity counts are introduced here.

## Requirement map

| Requirement | Implementation evidence |
| --- | --- |
| Exact token search and input safety | `tag-search-policy.ts`; native route tests for NFC, boundaries, overlength, duplicates, and injection |
| No body scan; bounded query | Candidate B-tree and `TAGGED_DISCOVERY_SQL`; constrained PostgreSQL `EXPLAIN ANALYZE` scale test |
| Published-content and viewer privacy | `SECURITY DEFINER` search function, repeated route filters, and Worker integration tests for pending, deleted, generated-label, review-required, inactive-author, block, and mute exclusion |
| Pagination and trust identity | Existing cursor codec and `FeedResponseCandidate`; chronological keyset integration test |
| Unknown versus unavailable | Empty page only when the readiness gate is complete; explicit 503 tests for closed gate and query cancellation |
| Lifecycle and deletion | Same-transaction API indexing; candidate post/declaration/user triggers; local backfill/reconciliation script |
| Per-post overflow | Enabled writes reject before mutation; legacy rows retain feed visibility, record `legacy_tag_limit_exceeded`, and have no tag tokens; adversarial popular-tag, pagination, reconciliation, and backfill-report tests |
| Backfill progress | One bounded restart sweep recovers behind-cursor incompleteness; persistent state returns an explicit blocked result instead of an infinite loop |
| Safe activation boundary | Proposal outside canonical manifests, control row defaults false, and Worker flags default off |
| Rate and result bounds | Existing native 30-request rate limit, proposed 1,000-candidate scan cap, and integration tests for 429, complete guest pagination, and request-level unavailability for filtered windows |
