# Lythaus UI/UX standardisation

Baseline: `8e3b3ebad2f846e61db2bfe819376723da7e9863` (`origin/main`, rechecked on 2026-09-27). Original checkout HEAD: `8a832e692110ec14083ca1c56bcf554ff10e1ebb`; unrelated untracked work is preserved there. Implementation is in the isolated `lythaus-design-system` worktree. The user authorised committing and pushing this work on 2026-09-27; the delivery branch is `codex/lythaus-design-system`. Merge, deployment, schema and infrastructure changes remain outside that authorisation.

## Live delivery, 2026-09-28

The user accepts the presented appearance and asks to fix the old UI still served by
`app.lythaus.co`. This authorises progressing the existing UI through review, merge and
the protected frontend deployment workflow, then verifying the live domain. The visual
review notes below remain follow-up findings, not a reason to withhold the requested
release. Backend/database changes and activation of incomplete features are outside scope.

1. Completed: prepare UI release in PR #872 against current main.
2. In progress: pass exact-revision CI and release checks.
3. Pending: publish the approved frontend artifacts.
4. Pending: verify live UI, asset identity and homepage preservation.

Provider inventory `36460645612` confirms the app still serves deployment
`b954be3b-625c-45b7-8b1c-e3cf3c1b9666`, source
`3dc65b477fd8898ec898fbc62e3ad00378fd2144`, created 29 August 2026. This is the
recorded app rollback target. Marketing serves deployment
`4b5367fa-53f1-48df-9051-193d390ba1a5`, source
`8e3b3ebad2f846e61db2bfe819376723da7e9863`. Both existing projects use production
branch `main`; the app's automatic deployments remain disabled. No provider setting
was changed by this inventory.

## Work stages

1. Completed: inventory routes and capture baselines.
2. Completed: protect homepage and establish semantic foundations.
3. Completed locally: migrate reachable app journeys and secondary website; preserve deferred gates.
4. Reopened on 2026-09-28: visual acceptance does not meet the requested product quality. The live/branch comparison confirms that contrast and navigation improvements alone do not complete the redesign.
5. Completed: record reproducible verification and remaining acceptance dependencies.

The full product definition of done remains open for visual quality, the Rewards recurrence contract,
approved policy conflicts and real integration/native accessibility acceptance.
See [the final verification report](verification-report.md), [app matrix](app-migration.md),
[web matrix](web-migration.md) and [homepage evidence](homepage-protection.md).

## Live and branch review, 2026-09-28

The user reports that `app.lythaus.co` still looks low quality. Fresh desktop (1440px)
and phone (390px) captures confirm that production is not displaying the design branch.
`a8e8780ae8db35ceb19af7bc419683883acc236d` is absent from the refreshed `origin/main`
(`8c5f7ffed09653d05aeaed3c09a88e48e683071c`), and no PR exists for the branch.
The public JS bundle hashes to `3dc9ecbf2bee3b548f4dc7ccbe21f12428381c09e149b01b948c13f4a106ad0c`;
the tested local branch bundle hashes to `f589d3c0dc025fec6c05c8b41d76f29bef7f758eb7435a8975b1c25d284417cd`.
This identifies a different build, not an exact production source revision.

The branch also fails the intended visual standard: sign-in retains the generic sparkle
icon and undifferentiated vertical action stack; the empty feed lacks useful next actions
and a considered desktop composition; the guest Profile is a single sentence without a
sign-in action. Shared tokens, passing tests and route coverage do not establish visual
completion. Do not deploy this branch as the finished redesign on the strength of the
earlier verification summary.

Fresh evidence is in `C:/Users/kylee/AppData/Local/Temp/lythaus-live-review-2026-09-28-comparison/`.
Live sign-in and guest feed were exercised at both widths; branch sign-in/feed were
captured at both widths and branch guest Profile on desktop. The branch uses intercepted
empty-feed fixtures; live captures use the public guest experience. No credentials,
account writes, production mutations or authenticated-route acceptance were performed.

## Direction

Warm editorial precision: constrained reading surfaces, local Manrope typography, warm neutral hierarchy, small intentional radii and amber selection. Use the existing Flutter design system and an isolated opt-in Astro secondary layout. Three reusable details are the amber navigation edge, an authorship disclosure rule, and quiet ledger rows. Native control semantics, existing service contracts, and system appearance remain authoritative.

The generated app concept is a preview reference for hierarchy, not product data or a new logo: `C:/Users/kylee/.codex/generated_images/01a0dc9a-c39e-7ac0-89a2-df1887406bb5/exec-7a84aee9-1f7e-438f-bab5-ef45358b6f75.png`. Its component-reference band is explicitly excluded from production. Bundled Manrope is used as the documented body fallback because no licensed DM Sans asset is present.

## Boundaries discovered

- `lib/main.dart` uses the existing `LythausTheme` and system appearance. `AdaptiveShell` is routed; `LythausAppShell` is a legacy entry tested separately.
- The current Rewards contract contains partner offers, eligibility and redemption history. It does not contain point awards, weekly/monthly/quarterly tasks, recurrence, verification methods or renewal dates. Those cannot be invented by the presentation layer.
- The old Quiet Trust Feed spec restricting Rewards to Profile conflicted with the new explicit request. Its canonical navigation document now describes the actual four-destination implementation and preserved gates.
- Baseline local tooling is Flutter 3.44.2 / Dart 3.12.2; pubspec names Flutter 3.32.0. Verification reports must identify that difference.
- The `update_plan` tool is unavailable in this session; this file records the lightweight plan instead.

Detailed route/state matrices and homepage evidence are maintained alongside this file. Unverified states must not be marked complete merely because they inherit a new theme.
