# Quiet Trust Feed Screen and Component Inventory

## Journey Coverage

This inventory defines state ownership, guest/authed behavior, analytics hooks, and accessibility for core Lythaus journeys.

## Screen Inventory

### First Open

- Screen: Discover root (`/discover`)
- States: loading skeleton, populated, empty, retryable error
- Guest actions: browse, open post, open receipts, share
- Auth-gated actions: all write actions
- Analytics: `discover_opened`, `feed_loaded`, `auth_gate_shown`
- Accessibility: feed chip labels, post card semantics, actionable elements have hints

### Auth Sheet

- Screen: Unified auth sheet (`/auth/sheet`)
- States: idle, email loading, email error, cancelled
- Guest actions: dismiss, continue as guest
- Auth actions: email
- Analytics: `auth_sheet_opened`, `auth_method_selected`, `auth_completed`, `auth_failed`
- Accessibility: clear email and guest labels and failure text

### Onboarding

- Screen: onboarding flow after first successful auth
- States: step transition, skipped, completed
- Guest actions: none (auth required)
- Auth actions: interests, notifications preference, trust explanation
- Analytics: `onboarding_started`, `onboarding_step_completed`, `onboarding_finished`
- Accessibility: keyboard traversal and readable progress text

### Discover

- Screen: discover rail + feed list
- States: initial load, pagination load, refresh, empty, error fallback
- Guest actions: full read + share
- Auth actions: likes/comments/follows/bookmarks/post actions
- Analytics: `feed_chip_selected`, `post_opened`, `trust_strip_opened`
- Accessibility: horizontal rail supports semantics for selected/unselected

### Create Post

- Screen: `/create`
- States: idle, uploading image, validation error, submit loading, submit success/fail
- Guest actions: blocked and redirected to auth sheet
- Auth actions: submit text/images, optional proof tiles
- Analytics: `create_opened`, `post_submit_attempted`, `proof_tile_added`, `post_submitted`
- Accessibility: announce upload progress and validation failures

### Alerts

- Screen: `/alerts`
- States: loading, grouped list, empty, retryable error
- Guest actions: read-only empty/education state
- Auth actions: open alert detail, mark read
- Analytics: `alerts_opened`, `alert_opened`, `alerts_mark_read`
- Accessibility: notification cards expose category and action

### Profile

- Screen: `/profile`
- States: own profile, public profile, empty, error
- Guest actions: read public profile/trust passport view
- Auth actions: edit profile/settings, open rewards, trust passport visibility controls
- Analytics: `profile_opened`, `trust_passport_opened`, `trust_visibility_changed`
- Accessibility: visibility toggles have explicit mode labels

### Receipt Drawer

- Surface: bottom sheet from trust strip tap
- States: loading skeleton, populated timeline, unavailable with retry
- Guest actions: open and read, learn-more links
- Auth actions: appeal CTA when eligible
- Analytics: `receipt_loaded`, `receipt_retry_tapped`, `receipt_event_id_copied`
- Accessibility: timeline order announced chronologically and CTA labels explicit

### Moderation and Appeals

- Surfaces: actioned content explanation, appeal submission, appeal status detail
- States: submit idle/loading/success/error, pending/in-review/resolved
- Guest actions: cannot appeal or vote
- Auth actions: appeal submit, appeal status review, moderator voting (role-gated)
- Analytics: `appeal_started`, `appeal_submitted`, `appeal_status_opened`
- Accessibility: plain-language explanations with policy links

## Component Inventory

- `LythausBottomNav` (4-tab shell only)
- `FeedRail` (discover and custom feed chips)
- `FeedCard` and post action row
- `TrustStripRow`
- `ReceiptDrawer`
- `ProofTilesEditor`
- `TrustPassportCard`
- `AuthGatePrompt`
- `NewPostsPill`

## Guest vs Authed Behavior Matrix

| Capability | Guest | Authenticated |
| --- | --- | --- |
| Read feed and post detail | Yes | Yes |
| Open receipt drawer | Yes | Yes |
| View public profile and trust passport | Yes | Yes |
| Share post externally | Yes | Yes |
| Like/comment/follow/bookmark | No | Yes |
| Create/edit/delete post | No | Yes |
| Submit appeal | No | Yes |
| Vote on appeals | No | Role-gated |

## Auth Edge Ownership

- Every blocked write action must trigger auth sheet with remembered intent.
- Returning users resume the attempted action post-auth.
- Guest experience must never dead-end without a clear path (dismiss or sign in).
