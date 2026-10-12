# Member feed and composer repair, 12 October 2026

Scope: narrow draft change based on main `18b019d6787c572c2204134dc9e35a4cccad5c35`.
Final integration also retains reviewed main
`5b87219ac647a4deedadfa66e145b4e87c0d2af9` through a normal merge.
Owner-testing release111 is `00f174d2`. This lane does not merge, deploy,
activate publication or detectors, change credentials, permissions or schema,
or modify rewards and support workflows. Release112 cancellation is coordinated
by the parent.

## Inspected evidence

Both resolved Library files were materialized into this executor using the
current Library resolved-reference helper, checked for existence and decoding,
and viewed as pixels before editing: `libfile_28a443a1d5c88191b06c7d905618d5ad`
(`27467.jpg`, 170870 bytes) and `libfile_d34a018b3b6081918a1318b64365a6d4`
(`27469.jpg`, 219539 bytes). Both images are 945 by 2048 pixels. They show the
UUID author label, published ADR fixture, expanded diagnostic chips, and raw
hash/source-entry cards described in the delegated report. No attachment picker
is visible. These user screenshots are not committed to the repository.

## Causes and changes

- Public post queries joined the active author for eligibility but selected no
  public name or handle. `Post.fromJson` then used `authorId` as its label.
  Public feeds, search, post detail and comments now select only the permitted
  `display_name` and handle, conditioned on an existing, public, allowed
  profile. Missing, hidden or moderated profiles use **Lythaus member**;
  blocked and deleted eligibility is unchanged. No owner-profile request,
  email, accountability name, private profile row or extra per-card fetch is
  introduced. A shared label guard also protects direct widget inputs and
  comment fallback labels. The original ID remains the profile navigation key.
- The composer directly exposed optional capture/edit hashes and attestation
  entry. Those cards and dialogs are removed from the ordinary member editor;
  evidence contracts and private authenticity/review workflows are retained.
  Required declaration choices and the normalized 249-grapheme assisted limit
  remain enforced by the existing client and server policy. Short guidance
  links to the detailed policy. The editor remains in the existing Manrope
  theme and restrained Lythaus layout. A mobile offline render exposed a long
  hover tooltip covering the editor; the submit/retry buttons now have no policy
  tooltip, and detailed policy opens only through the explicit link.
- Expanded feed trust details recursively rendered the diagnostic strip,
  including `complete`, `none` and `no_extra_signals`. Member feed/detail
  expansion now explains what the label means in prose. Appeals and pending
  review remain visible in plain language. Supplied supporting evidence is
  described as supplied, never as verified authorship. Self-declarations and
  explicit confirmed assessment metadata render different labels; absent or
  unknown assessment metadata stays Under review. A plain, accessible
  **View content history** action retains the existing drawer callback; its
  history and appeal controls keep their existing eligibility gates.
- A 201 is a submission receipt. Pending feedback uses an informational
  treatment; it does not say AI assessment passed. Unknown transport outcomes
  expose **Retry submission**, retain the frozen payload and durable key, and
  require an explicit retry. Close during an in-flight send gives feedback.
  Offline retry preserves the failure code and points to connection recovery;
  only an authentication failure asks the member to sign in again.
  Draft persistence, account fencing and submission ownership are preserved.
- The earlier white-screen root cause is documented in
  [the incident report](post-composer-incident-2026-10-10.md): a retained root
  Create tab could pop its parent route on success. Fix `9940561f` (#984) is
  already an ancestor of release111 and this base. This lane preserves it and
  reruns root/pushed navigation, Back/cancel and late-response regressions.
  Historical reproduction is source-backed; a new production incident on
  this exact candidate is not claimed.

Relevant source: [author SQL projection](../../apps/lythaus-public-api/src/feed-author-projection.ts),
[tagged query](../../apps/lythaus-public-api/src/tag-search-query.ts),
[post parsing](../../lib/features/feed/domain/models.dart),
[label guard](../../lib/features/profile/domain/public_author_label.dart),
[composer](../../lib/features/feed/presentation/create_post_screen.dart),
[declaration](../../lib/ui/components/authorship_disclosure.dart),
[member trust expansion](../../lib/ui/components/trust_strip_row.dart),
[durable submission](../../lib/features/feed/application/post_creation_providers.dart).

## Fixture provenance and production ambiguity

Read-only PlanetScale queries on `lythaus/lythaus-core/main`, database
`postgres`, on 12 October confirmed five actual records with the exact ADR
fixture body and screenshot author. This is neither client demo content nor a
client fallback. The exact body originates in
[authenticated acceptance A12](../../scripts/ci/run-adr003-authenticated-acceptance.mjs);
A11 also writes fixture profile text, and A13 flags that fixture.
All three fixture writes now require a loopback API address and fail closed on
direct promoted production Worker and public API addresses. The request helper
already uses manual redirect handling. Address and redirect restrictions do
not prove that a loopback server uses an isolated database. Disposable database
isolation is established separately by the existing local PG17 test target and
baseline checks; this harness does not certify that isolation. No keyword filter
hides genuine member content.

Published post `01a044ea-8e39-7c4a-bbdb-061688ba5906` was created on
27 August at 20:30:17.657 UTC. Its initial provenance was
`text_manual_review`, final decision `queue`. A subsequent moderation decision
`01a12cbe-8acf-7d0a-901e-c82f492ce5d2` recorded `allow`, label
`Human-authored`, policy `evaluation-only-v1`, at **11 October 20:54:06.876 UTC**,
exactly matching `published_at`. The other four remain `under_review` with no
publication timestamp. These are sanitized observed DB facts, not an attribution
to the evaluator or an operator. Ordinary [Jobs moderation](../../apps/lythaus-jobs/src/index.ts)
records queue/Under review; the [Admin decision path](../../apps/lythaus-admin-api/src/index.ts)
can record allow and publish while retaining the case policy version. The facts
are consistent with that admin path but do not prove which caller executed it
or identify an actor. Stored provider/model strings and this allow decision are
not detector-operational or full-pipeline acceptance evidence. Parent must
reconcile this observed publication with the current publishing hold.
This lane did not retrieve private operator identity or execute any production
write.

[Sanitized exact observed evidence](member-feed-fixture-evidence-2026-10-12.json)
records the post, provenance and decision metadata without private operator
identity or detector signal payloads. The body matches the A12 literal; the
exact historical acceptance request/run is not established by these queries.

Owner-only cleanup proposal, not executed: re-quarantine the exact published
test post through an authorized audited workflow, setting visibility private,
moderation state under_review, publication timestamp null, declaration label
Under review and review_required true. Preserve the post, historical decisions
and provenance. Confirm author
`01a044e4-3860-7f76-b819-5be99e0000f6` and exact body before mutation;
append a new cleanup audit record and account for the public feed cache window.
The remaining pending fixture IDs are `01a04af5-ccda-7e7f-ad71-9c14fae3010c`,
`01a04ad2-42c4-75c8-9952-ba98f4720deb`,
`01a047cd-5f46-7a9e-b579-ff3e143890a4`, and
`01a044fe-25a0-72d6-83e8-f681383cc5d4`. No deletion is proposed. Any cleanup
of the A11 profile bio also needs the owner's exact-row review; this lane did
not read or mutate its current profile text.

## Image dependency: deliberately unavailable

The old modal **Add media** dialog accepted an arbitrary URL; it was not a file
picker or uploader. That misleading surface and unsupported content-type
choices are removed. Both composers explain that photos await validated safety
and authenticity checks. No placeholder upload button is shipped.

The current chain is incomplete:

1. Flutter has no production picker/upload service for this editor.
   `CreatePostRequest.toJson` submits body and declaration; mediaUrl is not
   an attachment contract.
2. The public API has authenticated, idempotent upload-session/finalise routes,
   size/type/checksum checks, and quarantine storage. `MEDIA_UPLOADS_ENABLED`
   remains false. Credentials and storage configuration were not changed.
3. Jobs processing is gated by `MEDIA_PROCESSING_ENABLED=false`. Its existing
   transform and private-store path submits image metadata, not image pixels,
   to a generic evaluation interface; this is not operational image-detector
   evidence. The live detection collector remains unimported and hard-disabled.
4. Post creation does not bind an owned reviewed media object to the post;
   feed SQL does not return reviewed attachment URLs. The Flutter card can
   render permitted mediaUrls when a future contract provides them, but this
   PR does not fabricate attachment publication.

Acceptance dependency: an approved owned-object attachment contract; bounded
picker and upload/cancel/recovery wiring; quarantine ownership and checksum
validation; validated image-byte safety/authenticity handling; durable review
and publication holds; private/approved media access and attachment projection;
and synthetic rejection, replay, interruption, account-switch, privacy/deletion
and cache tests. A separately approved complete-pipeline activation decision is
still required. No provider calls, detector activation or media publication
enablement were performed for this repair.

## Existing history service dependency

The clean trust expansion retains the existing `ReceiptDrawer` entry point.
UI regressions exercise eligible, disabled and already-open appeal action data
and the existing case-only informational dialog; no appeal submission is enabled
from this content view. The native public Worker and canonical OpenAPI currently
do not define `/api/posts/:id/receipt`. The restored drawer therefore retains a
recoverable unavailable/retry state for that native response. Synthetic receipt
fixtures prove callback and control accessibility, not a live history-service
contract or permission grant. Binding a supported, audience-safe history reader
remains an explicit backend dependency; this PR does not add a route or activate
an appeal workflow.

## Regression and visual evidence

Local validation uses Flutter 3.41.1, Chromium, and disposable PostgreSQL 17.
It never connects the test Worker to production data. The Worker/PG17 journey
test exercises real runtime SQL privileges, hidden/allowed author projection,
block/deletion isolation, private pending reads, revision and replay behavior.
Policy and release-governance tests cover declaration limits and production
fixture rejection. Native TypeScript and Flutter analysis are run separately.

The Flutter widget suite covers root/pushed composer navigation, interrupted
and repeated sends, cancel/Back, unknown outcomes, durable draft/key retention,
late responses, account switching, inaccessible profiles, and 320px/200% text
layout. The browser suite renders actual production Flutter components against
a loopback synthetic API, including lost acknowledgements, restart/retry,
pending owner reads, account switching, offline preservation and explicit
reconnect retry. Browser failure artifacts are kept distinct from final passing
evidence.

[The member browser suite](../../scripts/tests/member-experience.browser.mjs)
renders feed, expanded member trust details, empty composer, accessible full
policy, and submitted-pending states at 320/390px in light/dark themes. It is
part of the existing content-journey CI run and artifact upload. Inspect the
exact PR-head `content-journey-browser-evidence` artifact for screenshots and
`member-experience-results.json`; `browser-results.json` records the broader
journeys. Local generated screenshots were viewed as pixels, not inferred from
DOM assertions. No production screenshot or personal data is used in generated
visual evidence.

Full local and exact-head CI results are reported in the handoff. These checks
establish regression and UI evidence, not production pipeline certification.
No device APK/native camera acceptance is claimed, and no release is deployed.
