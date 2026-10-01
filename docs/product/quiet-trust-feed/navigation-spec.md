# Lythaus application navigation

This document describes the routed Flutter implementation after the UI standardisation. The user-approved product direction makes Profile and Rewards primary destinations. It supersedes the earlier proposed Alerts tab and Profile-only Rewards entry.

## Primary shell

1. Discover — `/` or `/?tab=discover`
2. Create — `/?tab=create`
3. Profile — `/?tab=profile`
4. Rewards — `/rewards`, redirecting to `/?tab=rewards`

Desktop uses a labelled left sidebar with Settings and Help. Tablet uses a rail. Mobile uses four labelled destinations, including the existing left-handed ordering preference. Text scaling can select the compact layout earlier. The reading pane is constrained to 760 logical pixels.

Visited tabs retain their widgets and scroll/draft state. Unvisited tabs are mounted on demand. Tab URLs retain unrelated query parameters. Native back restores the previous tab and its URL; browser history restores route selection. Guest Create remains blocked, and Rewards requires sign-in to load private data.

## Other routes and flows

- `/login`: existing account access, recovery, external signup and guest entry.
- `/invite/:code`: public invite validation/redemption; pending codes retain existing auth handling.
- `/post/:postId?commentId=…`: post and targeted reply context.
- `/user/:userId`: actual target profile, including native-link navigation.
- `/settings`: grouped preferences, privacy, security, notification centre and Help.
- `/settings/notifications`: notification preferences and device management.
- `/moderation`: moderator/admin guard; cases remain subordinate imperative screens.
- `/moderation/appeal`: existing private account-activity handoff and case-gated appeals.

Search, Trending, replies, profile editing, privacy/security, account activity and receipt sheets use their existing Navigator/sheet flows. Search preserves its query on return from a result. Supported `lythaus://` and `https://app.lythaus.co/` links remain supported; notification rows explain unsupported targets instead of pretending to navigate.

## Gates and contracts

Discover remains the launch feed section. Existing custom-feed and Black-only news implementations retain their gates; the redesign does not activate deferred entry points. Moderation is not an unrestricted primary tab. No saved-content destination or other hypothetical product is added.

Rewards contains the current server-backed offers, eligibility and history. Weekly, Monthly and Quarterly are separate unavailable sections until an approved action/point/recurrence contract exists. Navigation visibility does not mean those integrations are operational.

Existing guest write restrictions, device integrity checks, roles, subscription checks and service confirmations remain authoritative. Feed restoration still uses the existing best-effort item/offset snapshots; no ranking or persistence mechanism changes.

The complete route/state inventory and verification limits are in [the app migration matrix](../../design-system/app-migration.md).
