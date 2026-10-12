# Publishing and detection transition matrix

Release baseline: `6647e269ba379a53232922d50d0aadba7136230d` (`release113`).
The draft integrates main `4055f63444478a3b5db8e3b91991f0ed46d2937c` and its
auth test-only PR1007 through merge commit `e54634efcee18be9243c8f0d31f219fe396995f0`.
This note records source review and synthetic local tests; production acceptance
and activation remain separate.

## Publication transitions

| Path | State transition and evidence | Review boundary |
| --- | --- | --- |
| Member post create: `POST /api/posts` | `apps/lythaus-public-api/src/index.ts` validates disclosure/body, creates the post under review, and emits a source-revision outbox event. | A public visibility setting alone does not publish a post. Public reads require an allowed state and eligible declaration. |
| Member post edit: `PUT/PATCH /api/posts/{id}` | A body edit requires a fresh declaration, creates a new source event, clears `published_at`, and returns the post to review. | Jobs must match the current source event, body hash, declaration, and review state. Older deliveries are stale. |
| Comment/reply create and edit | `POST /api/posts/{postId}/comments` and `PUT/PATCH /api/comments/{id}` create or revise comments/replies under review with their own source event. | The parent must be available to the writer. Public comment reads also enforce the parent's state, visibility, deletion, and block/mute rules. |
| Ordinary Jobs moderation | `apps/lythaus-jobs/src/index.ts` validates the revision event, reloads and locks canonical content, stores detector evidence, and creates an open case plus a `queue` decision. Comment review is explicitly manual. | This path does not set content to allowed or emit `content.*.published`. Its policy is `evaluation-only-v1`; a model score or signal does not prove human origin or grant publication authority. |
| Explicit moderation decision: `POST /api/admin/moderation/cases/{caseId}/decision` | The Access-authenticated admin handler locks the case/content, checks active/current source, validates the disclosure and public label, records the decision using the case's stored `policy_version`, then updates visibility state and emits the publication outbox event on `allow`. | This is an explicit human moderation decision. The admission fixture seeds synthetic case/declaration prerequisites; its successful route test is not evidence that ordinary Jobs orchestration completed. |
| Recorded-policy appeal adjudication: `POST /api/admin/appeals/{appealId}/adjudications` | The handler accepts the server-recorded supported historical `APPEAL_POLICY.version` and evaluates its immutable reviewer/adjudicator records. Historical `moderation.appeals` has no durable challenged-decision reference and the outcome contract has no authority-held status. An adjudication that would resolve an overturn returns sanitized `appeal_resolution_unavailable` (503) and rolls back its provisional adjudication. | The appeal stays open with no resolution, enforcement reversal marker, provenance change, final activity, notification effect, audit claiming restoration, or resolved/publication outbox event. No timestamp or policy label substitutes for binding. Permitted historical upholds retain their transactional resolution path. Profiles return `appeal_profile_access_unavailable` (503) before unauthorized profile access. |
| New standard community appeal closure | `packages/db/src/community-appeal-closure.ts` uses the timed configured rules and equal-weight ballots. Restoration checks the frozen revision/content/evidence hashes and refuses changed/deleted content, independent holds, or declaration failures. | The route is gated by `COMMUNITY_APPEAL_RULES_VERSION`. D09 timing, quorum, extension, unresolved handling, and activation remain separate approvals; this lane sets no defaults. |
| Editorial News Board: `POST /api/admin/editorial/publications` | Administrator-only route immediately publishes an editorial title, optionally backed by a post. | This is a separate editorial surface. A post-backed item is still filtered by content state, declaration, visibility, deletion, and block/mute eligibility; it is not a member-post approval path. |
| Media | Upload finalisation is separately gated; the supplied deployment context says media flags are false and there is no picker plus valid pixel-inspection chain. | Keep media disabled. Evaluation-only image/safety adapters do not establish media publication readiness. |

## Historical appeal authority path

| Stage | Authority and resulting behavior |
| --- | --- |
| Public intake | The historical member endpoint locks a resolved case, checks ownership, preserves the historical appeal version, and emits one created event for the open appeal. It records a case ID, not a challenged decision. The test uses this actual endpoint. New community sessions use their separate frozen decision/revision/evidence contract and remain gated. |
| Adjudication and API/UI | Editorial training/conflict checks and the existing historical evaluator remain. A would-be final overturn is unavailable before outcome/effect writes; the provisional adjudication rolls back. The control panel's existing error path displays failure instead of its resolved message. Earlier pending adjudications can remain pending; upholds can resolve. No new status, enum or timing rule is introduced. |
| Enforcement/provenance/activity | Deferred overturns create no effective reversal marker, provenance resolution or successful reversal activity. A supported uphold retains its ordinary non-reversal records. Audit/transaction failures roll back those records and the appeal state together. |
| Outbox | Deferred overturns emit neither a resolved event nor a content-published event. A historical uphold emits its actual canonical admin resolved event after transactional resolution. |
| Jobs | The consumer reloads the canonical outbox. An old historical overturn is acknowledged without penalty reversal or reviewer awards, including payloads claiming a binding or restoration. Upheld reviewer processing requires matching persisted appeal/outcome state, supported policy, aggregate, subject and content identifiers. Delivery payloads cannot substitute for the canonical event. Unknown/malformed data fails without reputation writes. Inbox retry/duplicate behavior is tested. |
| Reputation ledger | The former latest-negative-event lookup is removed. Older source penalties and later independent penalties stay effective. Historical penalty fixtures are seeded by the isolated fixture's privileged client using the actual ledger policy and explicit decision IDs from admin audit correlation; they are not reported as successful canonical Jobs effects. Ordinary unrelated reversal paths are unchanged. |
| Account standing | Refresh still honors existing suspension, feature restriction and the historical 90-day block window. A later unbound same-case `appeal_overturn` marker no longer clears any block. Existing markers remain stored; source review cannot reconstruct their challenged enforcement from timestamps. |
| Current role gate | Canonical local `lythaus_jobs` has SELECT on `identity.users` but lacks UPDATE, while `recordReputationSignal` uses SELECT FOR UPDATE. Actual block and upheld-reviewer event delivery therefore retries with no ledger writes. The tests assert this limitation, not synthetic success. No grant or locking scheme is changed in this lane. |

## Public and private reads

Public-capable reads are the discovery feed (`GET /api/feed/discover`), personal
feed (`GET /api/feed`), direct post (`GET /api/posts/{id}`), post comments and
replies (`GET /api/posts/{postId}/comments`), News Board
(`/api/feed/news`, `/api/news-board`), and tagged discovery
(`TAGGED_DISCOVERY_SQL`). They require an allowed post, an eligible public
label, an active/non-deleted author/content record, and the relevant visibility,
relationship, and block/mute checks. Feed and tag queries also require a
publication timestamp. Post detail passes through the shared feed response
eligibility check.

`GET /api/posts/{id}/owner-view`, `GET /api/comments/{id}/owner-view`,
`GET /api/users/me/posts`, and `GET /api/users/me/comments` intentionally expose
pending authored content only to its owner. They are private, no-store reads and
do not make pending content public. Delete and retention paths clear public
visibility/timestamps or block the content.

## Evidence boundary

- `packages/contracts/src/content-policy.ts` normalizes NFC, trims, counts user-perceived graphemes with `Intl.Segmenter`, caps AI-assisted public text at 249 graphemes, and rejects AI-generated public text. Missing segmentation support fails closed.
- The actual Jobs post path keeps the stored outcome at `queue` even when a synthetic low-risk model response and a detection signal are present. Safety flags, authorship/provenance, declaration compliance, and quality remain separate axes.
- `apps/lythaus-jobs/src/post-safety-evidence.ts` is return-only preparation marked `evaluation-only`; it does not persist or apply an allow/block result. The posting-feedback evaluation suite is offline, scripted, and synthetic. Its plan has no posting thresholds, authorship abstains, and its artificial `human` scenarios are not verified human-written samples.
- Existing publication admission tests exercise actual Workerd public and admin dispatchers over disposable PostgreSQL transport. Existing Jobs tests exercise ordinary queue processing. They are distinct pieces of evidence; synthetic admission prerequisites do not substitute for the complete orchestrated production pipeline.
- Required in-repo CI path is `.github/workflows/ci.yml` job `native_runtime`, which runs `npm run test:publication:pg17`. That runner creates a fresh local PostgreSQL 17 database and validates the canonical migration/grant baseline for each suite. Remote branch-protection requirements are not established by this source review.

## Remaining gates

- Production publishing remains withheld. The submitted private owner test and older pending posts are outside this synthetic lane and were not read, changed, or resubmitted.
- The evaluation ledger schema was absent at the last authorized check. No schema was applied. Seven-day retention is approved; longer-lived tombstone handling remains unresolved.
- The actual Jobs Hyperdrive database username-to-role mapping is unverified. Local PG17 proves the canonical `lythaus_jobs` role cannot execute the reputation writer's user-row lock because it lacks `identity.users` UPDATE privilege. Block penalties and upheld-reviewer rewards retry without ledger writes. The real role, appropriate lock/grant design and production permissions remain separate gates.
- Historical restoration requires an approved immutable link among appeal, challenged decision, source revision, enforcement and reputation event, plus prior-publication evidence and current visibility eligibility where restoration is permitted. Existing historical intake and admin block outbox payloads do not establish this link; the block payload also omits decision/source IDs. Reconciliation of effects already applied by old unbound outcomes is separate authorized work; this patch preserves history and prevents new effects.
- Exact production DDL, grants, and provider-data permissions are not approved. No production schema/grant operation, credential change, provider request, or activation was made.
- The repository's `lythaus_admin` role grants do not include `USAGE` on `social` or `SELECT` on `social.profiles`. Post appeal adjudication now uses no social read and passes under this role. Profile appeals check those privileges first and return sanitized `appeal_profile_access_unavailable` (503), leaving the profile blocked and appeal open; granting profile access remains a separate unapproved decision.
- A rights- and provenance-approved labelled evaluation set with verified authorship/generation truth, independent safety labels, source-family lineage, and retention/deletion controls is still a prerequisite. No private member content was used. Numeric safety or authorship thresholds remain unset.
- The complete publishing acceptance packet still needs authenticated intake, declaration/media, safety review, durable Jobs/outbox, permitted visibility/cache, notifications, versioned appeal effects, privacy/export/deletion, and rollback coverage on synthetic fixtures. Local success does not certify a provider, production roles, production data, or deployment.

## Local test result

The complete `npm run test:publication:pg17` runner passed 152/152 on Node
22.23.3 and PostgreSQL 17.11: moderation 7/7, admission 37/37, safety evidence
93/93, and transaction client 15/15. This includes 10 historical authority tests
using actual member intake, admin adjudication/outbox, Jobs queue
consumption and reputation refresh. Cases cover full rollback of unavailable
and interrupted adjudications; duplicate/concurrent attempts; previously public
posts/replies; missing declarations and generated content; stale revisions;
a restriction transaction started before intake but written and committed after
it with default `now()`; independent queue/block records; old canonical payloads,
malformed data and forged binding labels; inbox retry; old enforcement markers;
suspension; high-risk pending adjudications; unsupported policy versions; and
audit failure. Canonical-role reward/penalty failures and privileged
historical fixture seeding are explicitly distinguished. Full relevant workflow
results and the exact draft head are recorded in the PR handoff.

Relevant CI commands were reproduced with Node 22.23.3. Native architecture
passed 335/335; the critical coverage gate passed all 44 required production
modules; the separate auth/email/owner-reader Workerd commands passed; publication
target isolation passed 4/4; authenticity foundation passed 43/43; identity and
budget checks passed. Public/Admin PostgreSQL cases passed 145/145: 101 on the
auth target, tag cases 18/18 on their permitted content target, and community
appeal cases 26/26 on their permitted monthly target. The broad local glob first
rejected the four differently scoped files at their isolation guards; those
files were rerun on freshly owned permitted databases without changing guards
or pretending to run in GitHub Actions. Merged auth failure/recovery/session
Workerd passed 7/7, password-screening Workerd 1/1, auth units 43/43, and the
real coordinator test and its coverage gate passed. Final native typecheck and
diff whitespace checks passed. This evidence does not identify the cause of an
earlier remote CI failure; denied log storage was not retried.

Offline posting-feedback evaluation tests passed 37/37. Its validator reports
32 synthetic fixtures, zero external requests, and `publicPosting=WITHHELD`;
authorship remains abstaining and thresholds remain unset. This is harness and
measurement evidence only, not labelled human-origin or production evidence.

Source changes in this draft PR are not deployed or activated. No production
schema/grant, provider resource, activation flag, member UI, or auth source is
modified. The draft defers unbound historical overturn resolution, suppresses old overturn
reputation effects, and ignores unbound reversal markers during standing refresh. PR CI still needs the repository's existing
`.github/workflows/ci.yml` `native_runtime` job; no remote branch-protection or
live provider/production acceptance is claimed.
