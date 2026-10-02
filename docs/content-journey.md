# Posts and comments

The Flutter journey uses canonical body, declaredCreationMode, and reply
parentId fields. Creation and text edits require an explicit Human-authored
or AI-assisted declaration. Existing public-content and device-integrity
policies remain authoritative.

Submission acknowledgements and locally retained edits show pending publication
checks. Only the author sees edit and delete controls, and deletion requires a
matching server acknowledgement before the client removes content.

Content requests are saved to an account-bound journal in platform secure
storage before sending. Restarting the app restores the original key, body,
disclosure and reply target. Conflicting edits and deletes remain held while
an earlier request is unresolved. Storage failure prevents a new request from
being sent. A matching successful acknowledgement atomically clears its draft
and records an opaque owned-content ID.

Unsent text drafts expire after 24 hours. Frozen request text expires after
seven days. Expiry is enforced when the journal is accessed. Logout and account
changes clear private in-memory state immediately and remove saved text and
drafts from that account's journal. Reopening a composer refreshes the journal
and applies expiry even without restarting the app. Discarding a draft waits
for storage confirmation; failed storage leaves the draft available to edit.
Unresolved keys, fingerprints and routing
IDs remain so re-entering the same text can check the original request safely.
Another account cannot restore them. Browser storage belongs to the current
origin and device profile; restoring a fresh device does not transfer drafts.
The journal contains no session credentials, email addresses or content logs.

An initial definitive failure permits correction. A permission, authentication
or rate-limit failure during an unresolved retry cannot establish the earlier
outcome, so its key remains held. The backend's quarantined
idempotency_outcome_unknown state remains explicit; the client never replaces
it with a new request. Late responses from a previous session cannot overwrite
the current user's draft.
Content input widgets are recreated on account changes so stale browser
accessibility values cannot retain the previous account's text.

GET /api/posts/{id}/owner-view and GET /api/comments/{id}/owner-view return
known-ID content only to its active author. Responses use private, no-store
caching and vary by Authorization. Allowed and under-review text is returned;
blocked, deleted and generated content stays unavailable. Owning a post grants
no access to another author's pending comment or parent body.

The public post, comment and feed filters retain their publication checks.
Your submissions opens locally acknowledged posts through the private owner
view; comment threads restore locally acknowledged own pending IDs. Server
responses determine ownership and moderation state. A pending declaration
never becomes a confirmed public authorship label. Pending post edits clear
previous verification badges. New comments on pending posts and replies to
pending comments wait for publication; owner edit and delete remain available.
Feed mapping preserves server trust status, the complete timeline, appeal and
proof/eligibility flags. An open appeal cannot fall back to "No extra signals"
or "Moderation: none" while passing from parsed posts to feed cards.
A deletion whose response
was lost remains explicitly unconfirmed and can replay its saved key even when
the body is no longer readable.

Regression coverage lives in test/features/feed/application/content_mutation_test.dart,
test/features/feed/application/content_recovery_test.dart,
test/features/feed/presentation/post_comment_journey_test.dart,
apps/lythaus-public-api/tests/owner-content-reader.test.mjs,
apps/lythaus-public-api/tests/content-journey.postgres.mjs, and the existing
feed, composer, repository, network, and policy suites. These checks use synthetic
fixtures. Real-email/signup and exact-SHA owner acceptance remain separate gates.

The reproducible browser fixture is built with:

```sh
flutter build web --debug --no-pub --no-wasm-dry-run --target test/browser/content_journey_entry.dart --output build/content-journey-web
node scripts/tests/content-journey.browser.mjs
```

It uses real content widgets, a loopback synthetic API whose data persists across
page reloads, platform secure storage, and browser contexts restored from the
same device storage. It records canonical requests, exact retry keys, screenshots
and expected injected HTTP failures. PostgreSQL tests cover real authentication,
owner predicates, public exclusion and duplicate outbox prevention.
