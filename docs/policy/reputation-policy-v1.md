# Reputation Policy v1

**Status:** Partial — the versioned repository policy is present; it is not a claim that the policy has been migrated, deployed, or approved for production operation.

**Canonical repository policy:** `packages/contracts/src/reputation-policy.ts` (`reputation-v2.0.0`). This document explains that policy for product, governance, and implementation review. The machine-readable catalogue is [Reputation Event Catalogue](../contracts/reputation-event-catalogue-v2.json).

## Purpose and boundaries

Reputation answers whether a person has demonstrated sustained, constructive, accountable, and trustworthy participation. It does **not** measure volume, virality, likes, followers, time spent, streaks, controversy, or subscription spend.

Reputation is separate from:

| Concept | Meaning | Prohibited coupling |
| --- | --- | --- |
| Subscription | Free, Premium, Black product entitlements | Cannot change reputation, moderation treatment, reviewer qualification, reviewer weight, or Editorial standing. |
| Reputation | Private Level 0–5, multi-pillar trust evaluation | Cannot buy News Board access, paid benefits, or Editorial status. |
| Editorial | Earned, merit-based, revocable role | Is not a paid tier and is not automatically given by Level 5. |

Public presentation is restrained: level and a qualitative label only. Detailed history, pillars, promotion blockers, enforcement information, numeric scores, and authenticity confidence are private.

## Levels and promotion gates

Every level needs the listed minimums **and** no unresolved serious enforcement, active feature restriction, suspension, manipulation investigation, or anti-gaming failure. The evaluator returns the next-level blockers rather than silently recalculating on the client.

| Level | Name | Score | Age | Active days / weeks | Qualifying human contributions | Minimum pillars |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 0 | New | 0 | 0 days | 0 / 0 | 0 | none |
| 1 | Accountable Participant | 10 | 1 day | 1 / 1 | 0 | accountability 20; conduct 20 |
| 2 | Consistent Contributor | 60 | 14 days | 4 / 2 | 2 | accountability 30; contribution 25; conduct 35; authenticity 30 |
| 3 | Trusted Contributor | 150 | 28 days | 12 / 4 | 8 | accountability 45; contribution 45; conduct 55; sourcing 15; authenticity 50 |
| 4 | Established Contributor | 300 | 60 days | 24 / 8 | 20 | accountability 65; contribution 65; conduct 75; sourcing 35; authenticity 70 |
| 5 | Highly Trusted Contributor | 500 | 105 days | 40 / 11 | 35 | accountability 80; contribution 80; conduct 90; sourcing 55; authenticity 85 |

Levels 1–5 require a verified registered account and a declared private accountability identity. A declaration is not proof of a legal identity; it must never be described as verification unless separately verified.

## Pillars

| Pillar | Starting baseline | What it represents |
| --- | ---: | --- |
| Accountability | 70 | Verified account and responsibly maintained private accountability signals. |
| Contribution | 0 | Qualifying, human-authored constructive contributions. |
| Conduct | 100 | Healthy participation; confirmed misconduct reduces it. |
| Sourcing | 0 | Useful, verified source contribution rather than link volume. |
| Authenticity | 100 | Honest declarations and absence of confirmed authenticity evasion. |
| Review reliability | 50 | Reliable, trained community-review participation. |

The baselines are calibration inputs in the shared policy, not public points. Level promotion requires more than a total: time, distributed activity, human contribution, pillar gates, conduct, and anti-gaming eligibility all apply.

## Content and authorship treatment

- **Human-authored public text:** may create a qualifying human-contribution signal after authoritative eligibility checks.
- **AI-assisted public text:** NFC-normalised and trimmed text of **249 or fewer** user-perceived Unicode characters is allowed with an `AI-assisted` label. It receives no authorship reputation.
- **250 or more AI-assisted characters:** blocked.
- **AI-generated public content:** blocked; it receives no positive reputation and cannot enter Discovery, custom feeds, or public profiles.
- **Accessibility support:** spellcheck, grammar assistance, formatting, and transcription of the user's own speech are not penalties solely for their use.
- **Evasion:** deliberate mislabelling may create an `authenticity_evasion` penalty after an authoritative decision. It is never inferred from a public numeric confidence score.

## Positive, negative, withheld, and reversed events

The event catalogue is immutable by source-event identity and carries policy version, pillar, impact, explanation code, status, and a private visibility class. At repository-policy level:

- `email_verified` and `accountability_identity_declared` are one-time positive accountability signals.
- `qualifying_human_contribution` has diminishing returns in a daily window: 100% for the first event, 50% for events 2–3, 25% for events 4–6, and 0 after that.
- Authoritative 429 safeguards are separate from reputation: 20 flags per day, 20 media-upload sessions per day, at most two follow/unfollow state changes for one relationship per day, and a 30-day privacy-export cooldown. They reject excess requests before they can become abuse signals or reputation inputs.
- `verified_source` and `reliable_review` are positive signals in their respective pillars.
- `confirmed_spam`, `confirmed_harassment`, and `authenticity_evasion` are proportional negative signals.
- AI-assisted content, AI-generated content, raw reactions, raw follows, self-interaction, and duplicate content are withheld at zero; they never farm reputation.
- A suspended account is withheld from normal positive earning. Negative signals remain recordable.
- A reversal requires a valid prior event reference and applies the exact inverse impact; the original event becomes reversed.

No raw reaction, follower count, popularity measurement, or paid entitlement is a direct reputation input.

## Demotion, recovery, and appeals

Reputation is recomputed from effective events and current standing. A person may be demoted when score/pillar gates fail or a serious standing blocker applies. Minor enforcement is not designed as permanent punishment: corrected behaviour, time, expiry/decay where later configured, and successful appeals can restore eligibility. A successful appeal must reverse linked reputation consequences idempotently and leave an auditable history.

The current repository contract does not make every moderation event automatically appealable. Appeal availability must be determined by the authoritative moderation case and shown as such in the private ledger.

## Reviewer qualification and governance

Reviewer state is separate from reputation: `none`, `eligible`, `trained`, or `suspended`. Only trained, independently assigned reviewers may vote. A Level 5 reviewer has weight two only when trained and selected; at most one weight-two reviewer is permitted per five-reviewer appeal. The result needs all five completed valid reviews, a weighted majority of at least 60%, and trained Editorial/journalist confirmation (one standard, two high-risk). Subscription never changes those rules.

## Privacy and transparency

- Reputation detail is private to the subject and authorised administrative/privacy viewers.
- Public surfaces receive only a restrained level/label summary; no detailed negative history, private accountability name, or forensic confidence is public.
- Event metadata must not contain raw content, request bodies, credentials, emails, passwords, secrets, cookies, or tokens.
- User-facing explanations use stable explanation codes and policy versions without revealing anti-abuse thresholds that would materially assist evasion.
- Reputation and appeal records participate in DSR export and deletion/retention processing subject to legal restrictions. The remediation preserves the prior reputation-event/appeal locator path, adds accountability-signal and notification preference/device coverage, removes private profile fields/retention rules/prior export artifacts on deletion, redacts appeal statements, and marks retained governance rows pseudonymized.
- Passport v3 includes notification metadata/preferences and accountability signals. The private accountability name is decrypted for the authorised export only when Jobs has `PII_ENCRYPTION_KEY_V1`; its secret provisioning and the deployed export path remain launch-acceptance gates.

## Implementation status and release gate

The shared policy, repository, migration `0012`, Worker/job wiring, and Flutter consumers are **resolved in the current worktree with Partial release evidence**. The critical coverage gate passes at least 80% lines and branches for its 20 listed modules across 12 domains, including extracted invoked runtime seams; it is not whole-route, migrated-database, deployment, or Flutter integration certification. PlanetScale `main` is reported through `0008`, while the reputation-profile/governance schema is in `0012`; approved PostgreSQL 17 migration and live deployment evidence are unverified. Do not issue a production reputation level, reviewer assignment, or public trust claim until the migration, exact-SHA tests, DSR passport-v3/delete/pseudonymized-retention handling, Jobs `PII_ENCRYPTION_KEY_V1` confirmation, disabled queue no-cost approval, conflict/recusal checks, and human governance readiness are verified.
