# Publishing and detection transition matrix

Review baseline: `6647e269ba379a53232922d50d0aadba7136230d` (`release113`). A
read-only `git ls-remote origin refs/heads/main` resolved remote `main` to this
same SHA. This note records source review and synthetic local tests only; it is
not a production acceptance record or activation decision.

## Publication transitions

| Path | State transition and evidence | Review boundary |
| --- | --- | --- |
| Member post create: `POST /api/posts` | `apps/lythaus-public-api/src/index.ts` validates disclosure/body, creates the post under review, and emits a source-revision outbox event. | A public visibility setting alone does not publish a post. Public reads require an allowed state and eligible declaration. |
| Member post edit: `PUT/PATCH /api/posts/{id}` | A body edit requires a fresh declaration, creates a new source event, clears `published_at`, and returns the post to review. | Jobs must match the current source event, body hash, declaration, and review state. Older deliveries are stale. |
| Comment/reply create and edit | `POST /api/posts/{postId}/comments` and `PUT/PATCH /api/comments/{id}` create or revise comments/replies under review with their own source event. | The parent must be available to the writer. Public comment reads also enforce the parent's state, visibility, deletion, and block/mute rules. |
| Ordinary Jobs moderation | `apps/lythaus-jobs/src/index.ts` validates the revision event, reloads and locks canonical content, stores detector evidence, and creates an open case plus a `queue` decision. Comment review is explicitly manual. | This path does not set content to allowed or emit `content.*.published`. Its policy is `evaluation-only-v1`; a model score or signal does not prove human origin or grant publication authority. |
| Explicit moderation decision: `POST /api/admin/moderation/cases/{caseId}/decision` | The Access-authenticated admin handler locks the case/content, checks active/current source, validates the disclosure and public label, records the decision using the case's stored `policy_version`, then updates visibility state and emits the publication outbox event on `allow`. | This is an explicit human moderation decision. The admission fixture seeds synthetic case/declaration prerequisites; its successful route test is not evidence that ordinary Jobs orchestration completed. |
| Recorded-policy appeal adjudication: `POST /api/admin/appeals/{appealId}/adjudications` | The handler accepts only an appeal row with the supported `APPEAL_POLICY.version`. An overturn locks/rechecks the current canonical content and source. Restoration requires a restrictive challenge, an exact-source human `allow`, a matching `content.post.published` or `content.comment.published` event after that source event and allow decision but before the challenged decision, current public visibility/eligible parent, no current-source non-superseded block/queue decision (evaluation-only queue is not treated as a safety hold), and normal declaration checks. Post `published_at` is restored from that historical publication event. A hold suppresses only content reversal; the appeal can still resolve and the audit records its decision/evidence IDs. | An appeal overturn cannot first-publish a post from a prior `allow` row alone: without an exact-source publication outbox record, it resolves with no content-reversal effect and content remains private/blocked. A same-source independent block/queue hold also suppresses restoration, including a restriction committed while the appeal waits on the locked content row. The local historical fixtures first use admin routes to publish a post and reply, then seed later blocked historical states to test restoration; those latter transitions are synthetic and not claimed as normal routes. A separate never-public post, an allow without publication evidence, generated content, and an older allowed revision all remain private after overturn. **Residual binding limit:** `moderation.appeals` has no `challenged_decision_id`; the handler derives a candidate as the latest decision on the case with `created_at <= appeal.created_at`, then records that ID/outcome/policy in the outcome audit. The test seeds the case and decision policy strings to `synthetic-historical-admission-v1`; runtime does not require either to equal the appeal policy version. Do not treat this fixture as proof of cross-record version binding. The decision identity is not stored as a durable appeal foreign key, so this remains a schema/design gate. Appeal reversal also does not emit a fresh content publication outbox event; feed/index/notification reactivation is unverified and remains withheld pending separate acceptance. Profile appeals remain unavailable to `lythaus_admin` and fail closed before content reversal where publication evidence or grants are unavailable. |
| New standard community appeal closure | `packages/db/src/community-appeal-closure.ts` uses the timed configured rules and equal-weight ballots. Restoration checks the frozen revision/content/evidence hashes and refuses changed/deleted content, independent holds, or declaration failures. | The route is gated by `COMMUNITY_APPEAL_RULES_VERSION`. D09 timing, quorum, extension, unresolved handling, and activation remain separate approvals; this lane sets no defaults. |
| Editorial News Board: `POST /api/admin/editorial/publications` | Administrator-only route immediately publishes an editorial title, optionally backed by a post. | This is a separate editorial surface. A post-backed item is still filtered by content state, declaration, visibility, deletion, and block/mute eligibility; it is not a member-post approval path. |
| Media | Upload finalisation is separately gated; the supplied deployment context says media flags are false and there is no picker plus valid pixel-inspection chain. | Keep media disabled. Evaluation-only image/safety adapters do not establish media publication readiness. |

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
- The actual Jobs Hyperdrive database username-to-role mapping is unverified. Local PG17 tests validate repository SQL roles, not the live DSN identity.
- Exact production DDL, grants, and provider-data permissions are not approved. No production schema/grant operation, credential change, provider request, or activation was made.
- The repository's `lythaus_admin` role grants do not include `USAGE` on `social` or `SELECT` on `social.profiles`. Post appeal adjudication now uses no social read and passes under this role. Profile appeals check those privileges first and return sanitized `appeal_profile_access_unavailable` (503), leaving the profile blocked and appeal open; granting profile access remains a separate unapproved decision.
- A rights- and provenance-approved labelled evaluation set with verified authorship/generation truth, independent safety labels, source-family lineage, and retention/deletion controls is still a prerequisite. No private member content was used. Numeric safety or authorship thresholds remain unset.
- The complete publishing acceptance packet still needs authenticated intake, declaration/media, safety review, durable Jobs/outbox, permitted visibility/cache, notifications, versioned appeal effects, privacy/export/deletion, and rollback coverage on synthetic fixtures. Local success does not certify a provider, production roles, production data, or deployment.

## Local test result

`npm run test:publication:pg17` passed against a disposable loopback PostgreSQL
17 container: moderation/Jobs 7/7, publication admission 28/28, safety evidence
preparation 93/93, and direct transaction tests 15/15 (143 total). The new Jobs
test confirms malformed evidence retries without detector/publication writes
and valid-format stale hashes are acknowledged without detector/publication
writes. Appeal fixtures verify that restoration requires a same-source human
allow plus its publication outbox event; a prior allow without publication
evidence, fresh human content, generated content, and a new revision with an
older allowed source all stay blocked/private while the appeal result resolves.
They also cover a previously published reply, a later same-source hold
committed while the appeal waits for the content lock, restoration of the
original publication timestamp, and a missing declaration that rolls back
restoration after prior-public evidence exists. These tests use synthetic state
and do not establish live appeal policy/version binding. A
test-fixture 10 ms timeout had produced three false timeout
results for non-timeout response scenarios; only the explicit timeout case now
uses 10 ms, while other synthetic failures use a 1 s budget.

Offline posting-feedback evaluation tests passed 37/37. Its validator reports
32 synthetic fixtures, zero external requests, and `publicPosting=WITHHELD`;
authorship remains abstaining and thresholds remain unset. This is harness and
measurement evidence only, not labelled human-origin or production evidence.

Source changes in this draft PR are not deployed or activated. No production
runtime, migration, grant, workflow, Flutter UI, or auth/email/session path was
changed. The draft changes the admin appeal route source and would alter its
restoration behavior if later merged and deployed. PR CI still needs the repository's existing
`.github/workflows/ci.yml` `native_runtime` job; no remote branch-protection or
live provider/production acceptance is claimed.
