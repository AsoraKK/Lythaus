# WP007L 110% Completion Self-Audit

The unit of completion is the scientific question, not the number of files. `BLOCKED` rows below are validated blockers after the approved local/runtime paths were exhausted; they are not silently counted as successful tool qualification.

| Achievable | Experiment ran | Independent cross-check | Spoof tested | Rights audited | 110% status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| WP007K inheritance audit | Yes, raw v2/by-encoder recomputation | Compact, grouped, and raw paths agree; stale aggregate identified | N/A | Inherited artifacts only | `110_PERCENT_VALIDATED_COMPLETE` | `wp007k-inherited-artifact-audit.json` |
| Runtime/lineage preflight | Yes | GitHub PR state, local ancestry, environment and resource checks | N/A | N/A | `110_PERCENT_VALIDATED_COMPLETE` | `current-state-audit.json` |
| GitHub forensic tool scout | Yes | Pinned source/license/feature audit plus local runs | N/A | Yes | `110_PERCENT_VALIDATED_COMPLETE` | `github-forensic-tool-landscape.json/.md` |
| Licence firewall | Yes | Official LICENSE/NOTICE/source checks | Copyleft source was not copied | Yes | `110_PERCENT_VALIDATED_COMPLETE` | `external-tool-rights-matrix.json`, `tool-build-vs-adopt.json` |
| Camera source inventory | Yes | Hash/source-family and privacy-safe manifest checks | N/A | Yes | `110_PERCENT_VALIDATED_COMPLETE` | `camera-source-inventory.json` |
| Controlled descendant lab | Yes, 1,460 records | Parent hashes, unique IDs, parser/oracle checks | Yes | Yes | `110_PERCENT_VALIDATED_COMPLETE` | `controlled-descendant-manifest.json`, `toolforge-sanitized-run-summary.json` |
| JPEG bitstream/coefficient tool | Yes | jpegio and jpeglib: 60/60 dimensions, DQT, sampling and coefficient shape | Profile spoof included | Yes | `110_PERCENT_VALIDATED_COMPLETE` | `jpegio-crosscheck.json` |
| Recompression analysis | Yes, known operation matrix | Source-linked operation labels and current-byte summary | Yes | Yes | `110_PERCENT_VALIDATED_COMPLETE` | `recompression-results.json`, `source-level-operation-summary.json` |
| JPEG grid analysis | Yes, Lythaus proxy across matrix | ZERO compiled and smoke-tested on a real controlled pair | Yes | Yes | `110_PERCENT_VALIDATED_COMPLETE` | `jpeg-grid-results.json`, `zero-oracle-results.json` |
| Resampling analysis | Yes, crop/resize/screenshot descendants | Known-operation labels and independent decoder checks | Yes | Yes | `110_PERCENT_VALIDATED_COMPLETE` | `resampling-results.json` |
| Metadata consistency | Yes | ExifTool 13.55: 36/36 dimensions and formats | Metadata-transplant/spoof harness | Yes/privacy | `110_PERCENT_VALIDATED_COMPLETE` | `metadata-consistency-results.json`, `exiftool-crosscheck.json` |
| Thumbnail context | Yes | Lythaus parser plus independent metadata oracle | Re-encode/metadata paths | Yes/privacy | `110_PERCENT_VALIDATED_COMPLETE` | `thumbnail-consistency-results.json` |
| Camera profile stability | Yes | Model/device grouping and parser cross-check | Yes | Yes/privacy | `110_PERCENT_VALIDATED_COMPLETE` | `camera-profile-development-results.json`, `camera-profile-confirmation-results.json` |
| Synthetic profile spoof | Yes, 20 synthetic spoofs | SAFE-A frozen checkpoint/threshold and parser cross-check | Yes | Yes | `110_PERCENT_VALIDATED_COMPLETE` | `safe-camera-profile-spoof-results.json`, `spoof-challenge-results.json` |
| PRNU feasibility | Yes, 64 same-device/566 different-device pairs | Aggregate residual sanity checks; no identity claim | Synthetic/profile challenge remained separate | Yes/privacy | `110_PERCENT_VALIDATED_COMPLETE` | `prnu-feasibility.json`, `prnu-results.json` |
| CFA/demosaicing feasibility | Yes, bounded RGB/residual measurements | No RAW/device oracle available; limitation itself validated | N/A | Yes | `110_PERCENT_VALIDATED_COMPLETE` | `cfa-feasibility.json` |
| C2PA EF1 validation | Source audit ran; runtime execution did not | Approved signed fixture and Cargo runtime unavailable after local/WSL checks | N/A | Yes | `BLOCKED` with validated blocker at 110% | `c2pa-feasibility.json` |
| Eligibility boundary | Yes, post-tool/spoof synthesis | Independent parser/oracle and spoof results | Yes | Yes | `110_PERCENT_VALIDATED_COMPLETE` | `eligibility-boundary-analysis.json`, `final-report.md` |
| Build/adopt/runtime decision | Yes | Repeated bounded CPU run and pinned dependency records | N/A | Yes | `110_PERCENT_VALIDATED_COMPLETE` | `tool-build-vs-adopt.json`, `runtime-benchmark.json` |
| Role/privacy contracts | Yes | WP007L and historical authenticity tests | Codec spoof and contradiction cases | Yes/privacy | `110_PERCENT_VALIDATED_COMPLETE` | `packages/authenticity/tests/wp007l.test.mjs`, `validation-summary.json` |
| FLUX.2 reserve | No access by design | Manifest/assertion and code-path tests | N/A | N/A | `110_PERCENT_VALIDATED_COMPLETE` | `flux2-zero-access.json` |
| Regression validation | Yes | Focused, historical, JSON, syntax, scope and diff checks | N/A | N/A | `110_PERCENT_VALIDATED_COMPLETE` | `validation-summary.json` |
| Unmerged PR | To be created only after final validation | GitHub PR head/base and diff review | N/A | N/A | `IN_PROGRESS` until PR exists | PR URL and final head |

## Validated blockers

- C2PA could not be executed because the approved environment had no Cargo/runtime and no approved signed fixture. Source/rights audit was completed; the correct result is later EF1 integration, not a guessed cryptographic result.
- Broad native-camera qualification could not be completed because the available confirmation media are historical camera-claimed files rather than a fresh physical-device panel. That is why the final disposition is `NATIVE_CAMERA_SUPPORTED_ROUTE_NOT_DEMONSTRATED`.
- PRNU and CFA could not be promoted because the available media are JPEG/ISP outputs without RAW ground truth or a fresh device-held-out panel. The negative/limited feasibility result is the scientific output.
