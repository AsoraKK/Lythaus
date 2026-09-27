# Lythaus UI/UX standardisation

Baseline: `8e3b3ebad2f846e61db2bfe819376723da7e9863` (`origin/main`, rechecked on 2026-09-27). Original checkout HEAD: `8a832e692110ec14083ca1c56bcf554ff10e1ebb`; unrelated untracked work is preserved there. Implementation is in the isolated `lythaus-design-system` worktree. The user authorised committing and pushing this work on 2026-09-27; the delivery branch is `codex/lythaus-design-system`. Merge, deployment, schema and infrastructure changes remain outside that authorisation.

## Work stages

1. Completed: inventory routes and capture baselines.
2. Completed: protect homepage and establish semantic foundations.
3. Completed locally: migrate reachable app journeys and secondary website; preserve deferred gates.
4. Completed locally: inspect rendered fixtures and repair regressions.
5. Completed: record reproducible verification and remaining acceptance dependencies.

The full product definition of done remains open for the Rewards recurrence contract,
approved policy conflicts and real integration/native accessibility acceptance.
See [the final verification report](verification-report.md), [app matrix](app-migration.md),
[web matrix](web-migration.md) and [homepage evidence](homepage-protection.md).

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
