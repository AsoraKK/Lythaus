# Local-only integration review

Scope: publication and comment flows, their visible status, reputation and rewards projections, feed action state, account switching, and draft device-unlock preferences. Review performed on `review/e2e-reliability-20261025` (`c0963c36693476ecc49ab1fcba0572454926b4d3`). Read-only refs reviewed: `ef288ef2`, `b85fe4f1`, and `c1456d9b`. No business logic was changed and no live provider, detector, or user data was accessed.

## Findings

The initial 320 × 640 / 2× text run showed a 318px overflow with fallback Ahem glyphs; this was a fixture artifact. After the harness loaded bundled Manrope Regular, Medium, SemiBold, and Bold plus Material Icons, the actual comment screen passed at 320 × 640, 320 × 900, and 390 × 844 with no layout exception. The superseding screenshots and hashes are recorded in [followup-accessibility.md](followup-accessibility.md). No responsive layout defect is confirmed.

The targeted happy-path, session, reward, local-unlock, and action checks also confirmed these integration boundaries:

- Post creation success is rendered as “Post submitted. Publication checks are pending.” (`lib/features/feed/presentation/create_post_screen.dart:622`); comments similarly render an under-review state (`comment_thread_screen.dart:1223`). This avoids presenting submission as publication approval.
- Comment creation scopes durable mutation state by actor and post (`comment_thread_screen.dart:58`) and checks the actor/session epoch before applying async results (`:445-461`, `:515-547`). Account changes clear in-memory thread state, increment epochs, and reload (`:88-120`).
- Feed action reads/writes are bound to `FeedReadSession`; token changes invalidate the session, and async results are ignored when stale (`feed_read_session.dart:11-27, 47-80`; `interactive_feed_card.dart:102-145`). Pending outcomes remain distinguishable from confirmed state and are not automatically retried (`interactive_feed_card.dart:136-145, 547-571`).
- Monthly reputation cards distinguish confirmed, shadow, and pending states. Shadow copy explicitly says it does not confirm a monthly level or activate rewards (`monthly_reputation_widgets.dart:40-60`). Reward status comes from the snapshot provider, keyed by session revision (`reward_providers.dart`; `rewards_dashboard.dart:147-149`).
- Device-unlock preferences are stored locally under an account-derived secure-storage key (`device_unlock_preferences_store.dart:47-73`). The policy preview says the choice does not verify the account server-side and that unlock choices earn no points or reputation (`member_verification_policy_preview.dart:24-52`). The controller is disabled by default and changes local lock state only (`draft_device_unlock_controller.dart:34-37, 83-127, 138-166`).

## Execution limits

The cached Flutter SDK was used explicitly after resolving dependencies offline. Local mock/fake tests and synthetic Dio fixtures were used; no live service, detector, user data, or device biometric prompt was accessed. The reward-provider isolation test exercises the actual client providers over a local synthetic adapter. The comments/upload lanes supplied separate publication, browser-reload, screenshot, and semantics evidence. See the matrix and [follow-up execution record](followup-integration.md) for exact scope and limits.

## Follow-up

The actual browser reload case passed. It preserved the draft/disclosure and made no write before submit; the submit carried the restored draft text. The comments-lane browser log records the result and limits of CanvasKit text selection.
