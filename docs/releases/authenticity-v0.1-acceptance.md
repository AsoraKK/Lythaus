# Authenticity beta acceptance evidence

This is a sanitized engineering record. No checkpoint, user image, private cohort, signed URL or provider body is attached. Base SHA: `8e3b3ebad2f846e61db2bfe819376723da7e9863`. Tie subsequent CI receipts to the exact PR head, and live receipts to the reviewed merge SHA and deployed artifact versions.

Integration: [PR #862](https://github.com/AsoraKK/Lythaus/pull/862). Engineering source for this receipt: `4d3480eb2b48147f0899b8e95ff20973024d274d`. The documentation commit carrying this report is not a substitute for reviewed-merge release evidence.

Observed on 2026-09-27:

- Native TypeScript and separate Container Worker TypeScript checks passed.
- The separate Container Worker package's `npm audit --package-lock-only --ignore-scripts` reports zero known vulnerabilities. This does not audit an unbuilt Python/system container image.
- Fourteen beta contract/forensics tests and fourteen historical WP005A/WP005B regression tests passed using explicit protocol fixtures.
- Twelve Flutter beta API/screen tests passed, including phone/desktop layout, exact-byte upload, consent/progress, private preview authorization, destination rejection, reconnect, failures, feedback, finalise/cancel/delete and a local rewards preview. Analyze passed. Provider/file-picker doubles are explicit; these are not live acceptance.
- Control-panel suite passed: six files, thirteen tests.
- OpenAPI lint/bundle/example validation, 843 generated Dart tests, and route/contract tests passed. The Windows contract run used the equivalent explicit Jest testMatch to avoid its existing mixed-separator discovery issue: 33 passed, 17 existing skips. Four existing lint warnings remained.
- Native release governance: 146 passed. Four beta release-control tests cover bounded evidence/approval, account-allowance pricing, configuration-only candidate selection, stale Worker refusal and an ambiguous KV write's rollback marker. No Cloudflare calls occur in these tests.
- [PostgreSQL 17 CI](https://github.com/AsoraKK/Lythaus/actions/runs/36324314354) passed at the stated source. It applies all migrations and actual role grants, verifies canonical 0017 relation/function fingerprints, and exercises handlers for ownership, consent, forged events, original-byte integrity, duplicates, Safety stop, persisted advice, review, stale objects, deletion during inference, purge, budget and kill switches. R2, Safety and model outputs are protocol fixtures.
- [Native Workers CI](https://github.com/AsoraKK/Lythaus/actions/runs/36324314561/job/108634009209) passed at the stated source. Separate Linux runtime validation also passes the checkpoint-integrity tests without importing Torch. A local Windows attempt cannot import the Linux-only `resource` module; it is not recorded as passed.
- [Flutter web release build](https://github.com/AsoraKK/Lythaus/actions/runs/36324314327/job/108634302026) and web smoke passed at the stated source. Local Android debug build is blocked by absent `google-services.json`; no replacement provider configuration was fabricated.

[Main baseline CI](https://github.com/AsoraKK/Lythaus/actions/runs/35186343169) passed at `8e3b3ebad2f846e61db2bfe819376723da7e9863`. The earlier branch Flutter run at `96093db46da49fd3d73bd781bb650febc18d6d67` failed the unchanged 87% coverage gate with 86.54%. After testing the missing beta paths, [full Flutter coverage](https://github.com/AsoraKK/Lythaus/actions/runs/36324314327/job/108634302074) passes with 11,543/13,247 lines (87.14%). [Complete CI](https://github.com/AsoraKK/Lythaus/actions/runs/36324314561) also passes at the stated engineering source. No coverage threshold or release check was reduced.

[Dependency review](https://github.com/AsoraKK/Lythaus/actions/runs/36324314274) is the remaining failing check at that source: GitHub's dependency graph is unavailable and the fallback refuses changed Dart manifests. This remains a release blocker, not a passing audit. See current PR checks before approving any later SHA.

No real beta SAFE inference or GPT-OSS call has occurred. No container image has been built/pushed, no production migration applied and no beta Worker deployed. Peak memory, cold/warm/end-to-end latency, throughput, image size, beta confusion counts and provider charges are unknown, not zero. The proposed smoke envelope has not been executed or reserved with a provider.

Current activation blockers: checkpoint deployment rights unresolved; authorized real runtime unavailable under current local compute limits; fresh account allowance/budget evidence absent; supported dependency review and protected review/release/migration approval outstanding. Public enforcement is not approved. Missing Torch is an execution blocker and says nothing about scientific model performance. The [runbook](../runbooks/authenticity-v0.1-beta.md) consolidates the exact owner actions and executable disabled-deployment/activation/rollback path.
