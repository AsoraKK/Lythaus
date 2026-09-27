# Authenticity beta acceptance evidence

This is a sanitized engineering record. No checkpoint, user image, private cohort, signed URL or provider body is attached. Base SHA: `8e3b3ebad2f846e61db2bfe819376723da7e9863`. Tie subsequent CI receipts to the exact PR head, and live receipts to the reviewed merge SHA and deployed artifact versions.

Observed locally during implementation on 2026-09-27:

- Native TypeScript and separate Container Worker TypeScript checks passed.
- Thirteen beta contract/forensics tests and fourteen historical WP005A/WP005B regression tests passed using explicit protocol fixtures.
- Four Flutter beta API/screen tests passed at phone/desktop sizes before the final private-preview update; the final update requires a rerun.
- Control-panel suite passed: six files, thirteen tests.
- OpenAPI lint/bundle/example validation and 843 generated Dart tests passed before the final contract review. Four existing lint warnings remained.

These observations are not a claim that the complete candidate suite is green. PostgreSQL 17 handler CI, the final generated-type checks, final Flutter validation and real runtime/app acceptance remain outstanding. See the PR checks for current exact-head evidence and the readiness JSON for deployment status.

No real beta SAFE inference or GPT-OSS call has occurred. No container image has been built/pushed, no production migration applied and no beta Worker deployed. Peak memory, cold/warm/end-to-end latency, throughput, image size, beta confusion counts and provider charges are unknown, not zero. The proposed smoke envelope has not been executed or reserved with a provider.

Current activation blockers: checkpoint deployment rights unresolved; authorized real runtime unavailable under current local compute limits; protected review/release and migration approval outstanding. Public enforcement is not approved. Missing Torch is an execution blocker and says nothing about scientific model performance.
