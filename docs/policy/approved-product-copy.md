# Approved Product Copy (AI Policy + Tier Entitlements)

Status: Approved by CEO
Last Updated: 2026-08-11
Scope: Current dev-to-release track

## 1) AI authenticity and appeals copy

Approved wording:

- "AI-generated content is blocked at publish time."
- "AI-assisted text must be labeled and remain meaningfully human-led."
- "Automated authenticity signals are evidence for trained human review and never act as the sole blocking authority."
- "If content is blocked, you'll see a neutral notice."
- "You can appeal this decision."
- "Appeals are reviewed by five independently assigned trained reviewers and a trained adjudicator."

Code references:

- `lib/features/feed/presentation/create_post_screen.dart`
- `lib/core/error/error_codes.dart`

## 2) Tier entitlement copy

Approved wording:

- Free:
  - "Discovery feed"
  - "1 custom feed with personalized filters"
- Premium:
  - "Discovery feed"
  - "2 custom feeds with personalized filters"
- Black:
  - "Discovery + News Board"
  - "3 custom feeds with personalized filters"

All tiers use the same posting safety limits, moderation treatment, reputation
rules, appeal rules, and reward eligibility. Subscription never buys reputation,
reviewer qualification, vote weight, Editorial standing, or a moderation bypass.

Code reference:

- `lib/data/mock/mock_rewards.dart`
