# Product gap goal checklist

WP00/WP02 source refresh: 2026-10-07. Actual main is `8f9293fd7ee1bb54382101c04955dff4be7d5499`. PR [#921](https://github.com/AsoraKK/Lythaus/pull/921) began at `cc464bd9f2ae0f7866094cb14dc625f05c3b86e0`; initial main refresh `eb0142ca100be7837e2bb43ac86284b144954c3c` and subsequent PR942/main refresh `13093e177f490d2380ab8afe38d8cfc016b3dfdc` merged without conflicts. It remains draft and unmerged under the prior ready/merge boundary. Final candidate/check identities belong in the exact-head review packet; older green checks are not assigned to a new candidate.

Implementation, tests, merge, deployment, activation and owner acceptance are separate states. Release102 deployment facts below are supplied coordinator evidence for main f757d35a, not an independent provider inspection by this lane. The baseline is deployed but owner uncertified; authentication UAT remains pending October10.

| Goal | Implemented | Tested | Merged | Deployed | Enabled / accepted |
| --- | --- | --- | --- | --- | --- |
| Profile | Main optional partial edits/owner-public separation. Draft921 adds private own-post pagination, follow-session fencing, Overview/Posts/Comments controls and account-first settings. | Retained draft checks at cc464bd9; new local/final-head evidence reported separately. | Main editor yes; draft delta no. | Main editor in release102; draft delta no. | Draft awaits review/release. Comment/follower collections unavailable. Owner acceptance open. |
| Discovery/search | Main923/924 author links, chronological Discover, offline exact-token search candidate. | Existing scoped tests; this lane does not certify search. | Yes. | Source in release102 per coordinator. | Coordinator reports tag search OFF. Index/maintenance budgets and schema gates remain. Separate owner. |
| Rewards | Existing Rewards/report/monthly calculator/persistence foundations. | Existing scoped tests; economics/real providers not certified by WP02. | Foundations yes. | Code in coordinator baseline. | Global Rewards OFF is **not established**. Preserve existing behavior. New monthly proposal activation/owner/provider gates remain. |
| Support | Merged909/910 private problem/suggestion engine and separate destinations. | Existing runtime/PG/UI evidence; activation not certified here. | Yes. | Code in release102 per coordinator. | Coordinator reports support OFF; schema/grants/retention/policy/acceptance remain separate. |
| Passkeys | Candidate893 default OFF. | Dated f2412a33 checks; not rerun by this lane. | No; draft/paused. | No draft inclusion evidence. | Prior ready/merge denial persists; no activation. |
| Navigation | Existing Discover/Create/Profile/Rewards. Profile sub-tabs reuse current routes with profileTab=overview/posts/comments. | Shell/router and profile tab/history/swipe/keyboard/scroll regressions in WP02. | Four destinations yes; profile sub-tabs draft. | Existing shell baseline; additions no. | No fifth primary tab/shell rewrite. Native/SR and owner acceptance open. |

## Exact profile dependencies

- **P01 preferences:** handedness/profile swipe last only while the app is open; the UI says so. The [decision packet](profile-preference-authority-decision.md) recommends device-local persistence with unchanged defaults, no schema/API change. Haptics has no runtime consumer and is explicitly unavailable. New storage authority is pending. Passport visibility remains server saved through `/api/users/me`.
- **P02 handles:** `identity.handles` and owner reads exist; reservation/rename/history/reuse rules and an owner rename API are incomplete.
- **P03 avatars:** `social.profiles.avatar_object_id` exists; current projection returns `avatarUrl: null`. Owner attachment, moderation, serving/cache, DSR and resource policy are incomplete.
- **P04 collections:** individual follow status/POST/DELETE exist; follower/following endpoints and pagination/visibility policies are absent. Known-ID owner comments are not a profile list. Public author-post collections and parent-aware comment lists need explicit contracts/privacy/cost decisions. Tabs show unavailable, never fabricated empty data.

Explicit Save, optional setup, discard/error/retry and session cancellation are retained. Visitors receive no subscription guess, owner tools, private tracker or private owner-post request. Guests remain read-only. WP02 makes no provider, production DDL, credential, queue, activation or release action.
