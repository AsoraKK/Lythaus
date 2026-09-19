# WP007L — Native Camera Acquisition Integrity, JPEG Recompression Boundary & Forensic Tool Forge

## Disposition

WP007L is complete as a research instrumentation package. It does not qualify a broad `SUPPORTED` native-camera class and it does not authorize production routing.

Primary dispositions:

- `JPEG_NATIVE_PROFILE_MEASUREMENT_QUALIFIED`
- `JPEG_NATIVE_PROFILE_TOO_SPOOFABLE`
- `RECOMPRESSION_TOOLCHAIN_LIMITED`
- `RESAMPLING_DETECTION_LIMITED`
- `PRNU_NOT_PRACTICAL`
- `C2PA_EF1_INTEGRATION_RECOMMENDED`
- `NATIVE_CAMERA_SUPPORTED_ROUTE_NOT_DEMONSTRATED`
- `EVIDENCE_GRADE_V1_TOO_RESTRICTIVE_FOR_CURRENT_DATA`
- `FLUX2_REMAINS_SEALED`
- production authorization: `NO`

The package produced a reproducible set of narrow measurements. It did not produce an authenticity classifier, a single “original score,” or a camera-profile trust shortcut.

## Evidence categories

- **Observed Lythaus evidence:** the controlled descendant matrix, parser cross-checks, spoof harness, residual experiment, and sanitized aggregate files in this directory.
- **Published/tool evidence:** pinned repository and license audits in `github-forensic-tool-landscape.json` and `external-tool-rights-matrix.json`.
- **Inference:** architectural recommendations derived from the observed measurements.
- **Hypothesis:** work that requires fresh physical-device or signed-provenance data and is not claimed as resolved here.

## Controls and lineage

WP007L parent:

`WP007K_PARENT_SHA = 8a5188c1bc41a2a6208860ae63b3d871ecebf387`

The parent was PR #852, open and unmerged at audit time. No newer authenticity superseder was found. The WP007K inheritance discrepancy was independently recomputed before tool experiments. The canonical E1/E2 results are recorded in `wp007k-inherited-artifact-audit.json`; its SHA-256 is `1e4351584a0e08f127ed83e8a43c9db5f9d0691a254cd4db5a33e55631547f62`. Historical WP007K files were not rewritten.

SAFE-A was unchanged:

- upstream commit: `4e998724651b227def64f5be0cd60c0aa1552c35`
- checkpoint SHA-256: `b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e`
- threshold: `0.5864923000335693`
- weights/preprocessing/threshold modified: `false/false/false`

FLUX.2 and sealed EF2 future-device reserves were not opened. FLUX.2 pixel access was `false`; provider calls were `0`. No production routes, labels, enforcement, database, Safety, Judge, or Moondream authority changed.

## Experimental corpus

The frozen manifest contains 1,460 unique records:

- 60 approved camera-source parents;
- 36 development originals;
- 24 previously consumed, camera-claimed historical source families used as independent-from-fitting confirmation, not fresh physical-device ground truth;
- 1,380 controlled descendants;
- 20 synthetic camera-profile spoof descendants.

The primary unit was the source parent/source family. Descendants never became independent samples. The manifest was frozen score-blind before tool scoring. Its committed manifest SHA-256 is `373ee9a3ba80ce2bcce94169ac0dfe3da52f95330ae7f262a66a38fbdff71961`; the extracted feature-record SHA-256 is `ef0232bda0254865fcf84cb8db1e5e8ec674ac59ed02718cab8a0fc2cdaad0e0`.

The matrix included direct copies, requested JPEG qualities 100 through 50, 4:4:4/4:2:2/4:2:0 variants, same- and different-quality double JPEG, aligned and non-8-pixel crops, resize 75%/50%, screenshot-style rendering, JPEG-to-PNG, metadata stripping, camera-profile re-encoding, and synthetic profile spoofs. Current-byte changes were measured against known parents; they are not complete edit-history proof.

## Tool forge results

### JPEG structure and coefficients

The Lythaus-owned parser measured markers, DQT/DHT, SOF/SOS, sampling, progressive state, restart interval, metadata-marker presence, ICC state, dimensions, and PNG current-byte facts. `jpegio` 0.3.0 and `jpeglib` 1.0.2 were pinned and run on 60 real JPEG files.

Cross-check results in `jpegio-crosscheck.json`:

- dimensions: 60/60;
- quantization tables: 60/60;
- sampling factors: 60/60;
- luma coefficient shapes: 60/60;
- errors: 0.

This qualifies current-byte measurement, not acquisition or authorship inference. `jpegio` and `jpeglib` remain adoption candidates pending release/notice review; the Lythaus parser remains the auditable contract surface.

### Metadata and ExifTool

Pinned ExifTool 13.55, obtained from the pinned Sherloq bundle and executed through the available WSL Perl runtime, was used as a privacy-safe oracle on 36 development files. Dimensions and formats matched 36/36. Raw metadata was not persisted. The cross-check is recorded in `exiftool-crosscheck.json`.

ExifTool remains validation-only for now. Metadata fields are context and consistency evidence. Metadata presence does not establish authenticity; metadata absence does not establish manipulation or synthesis. GPS, serial, owner, and timestamp values were not committed.

### GitHub tool decisions

The pinned landscape and license decisions are in `github-forensic-tool-landscape.json`, `github-forensic-tool-landscape.md`, and `external-tool-rights-matrix.json`.

- `dwgoon/jpegio`: `ADOPT_CANDIDATE`, Apache-2.0 plus bundled-notice review.
- `martinbenes1996/jpeglib`: `ADOPT_CANDIDATE`, MPL-2.0 plus dependency review.
- `contentauth/c2pa-rs`: `ADOPT_CANDIDATE_FOR_LATER_EF1_INTEGRATION`, MIT/Apache-2.0; provenance only.
- `exiftool/exiftool`: `RESEARCH_ORACLE`, dual licensing and runtime/dependency review remain necessary.
- `GuidoBartoli/sherloq`: `RESEARCH_ORACLE`, GPL-3.0; no source was copied and it is not a production dependency.
- `tinankh/ZERO`: `REFERENCE_FOR_REIMPLEMENTATION`, AGPL-3.0; no source was copied.
- `DIFLabUnisa/PNU-Matlab`: `REFERENCE_FOR_REIMPLEMENTATION`, MIT; MATLAB is not a desired runtime.
- repositories with `NOASSERTION` licensing were retained as research references only.

### ZERO and Sherloq

ZERO was compiled with the existing WSL toolchain and run on one real controlled camera source/Q95 pair. It reported grid `(0,0)` and “No suspicious traces found.” A non-8-pixel comparison was correctly rejected because dimensions differed. This is a smoke test and oracle reference, not qualification. Sherloq was source-audited; its GPL GUI/modules were not run as a production path or copied. These results are intentionally weaker than a broad grid/resampling claim.

## Camera profile and acquisition evidence

Within the eight development device identifiers used for profile statistics, DHT and sampling were stable, while DQT and marker variation occurred within devices and across same-model devices. Across the four model groups, DQT uniqueness was 2–8 and marker-sequence uniqueness was 1–2. The observed signal is therefore more consistent with encoder/pipeline/model context than a proven physical-device identity signal.

The 24 confirmation sources are historical camera-claimed media, not a fresh device-controlled panel. They cannot qualify cross-device native acquisition.

The Lythaus metadata graph and thumbnail measurements remained contextual. Many controlled Pillow descendants lost or did not expose the source metadata/thumbnail structures; the thumbnail instrument therefore reports offset/presence only and makes no visual-correspondence claim. A consistent or absent thumbnail is not proof of pristine acquisition.

## Recompression, grid and resampling

All declared operations changed current bytes in the source-level summary at the expected bounded rates. Examples include:

- JPEG-to-PNG changed format, DQT, and sampling in the controlled path;
- non-8-pixel crop and resize changed dimensions/current bytes;
- Q95 and lower-quality re-encodes changed DQT and marker state;
- camera-profile self-re-encoding preserved DQT in the attempted path but changed marker/current-byte state.

These are known-operation measurements. Final bytes cannot prove that an image was never previously JPEG-compressed, and a PNG container does not restore JPEG history.

The grid proxy ran across the controlled descendant set and preserved known operation labels only as controlled-lineage labels. It is not an origin classifier. The external ZERO result was limited to one aligned pair. Resampling output was classified as measurement context; it did not achieve a validated real-world resampling detector. The results justify reason-coded `TRANSFORMATION_EVIDENCE_PRESENT` or `UNKNOWN` states, not a universal “recompressed” boolean.

## PRNU, CFA and physical-device signals

The exploratory residual correlation run used eight development device families and no RAW references. It produced 64 same-device and 566 different-device pairs:

- same-device mean `-0.000242`, median `0.0000246`;
- different-device mean `0.000124`, median `0.000112`.

The distributions overlap and the result is affected by content residual leakage, JPEG, ISP processing, small within-device counts, and no independent sealed-device confirmation. It does not qualify PRNU as a device identity signal and cannot imply synthetic origin from mismatch. `PRNU_NOT_PRACTICAL` is the current bounded-data disposition, with `FUTURE_RESEARCH` retained for a fresh owner-controlled/RAW-capable study.

CFA/demosaicing work was limited to RGB channel correlation and residual-parity context features. No classifier was fitted, no RAW ground truth exists, and no production camera identity was inferred. CFA remains `FUTURE_RESEARCH`.

## Spoof challenge

Twenty synthetic images were re-encoded with a camera-like profile. The challenge copied:

- DQT: 20/20;
- sampling: 20/20;
- selected EXIF tag set: 20/20.

It did not copy every marker/Huffman/ICC detail in this bounded Pillow path, but that is not a safety argument: static profile fields are demonstrably copyable. SAFE-A high evidence was 0/20 at the frozen threshold; the score range was approximately 0.0215–0.2392. The fact that this spoof lowered SAFE-A does not make the copied profile evidence of camera acquisition or human origin. It demonstrates why profile consistency cannot earn `SUPPORTED` alone.

The SAFE profile-spoof result is a defensive research result, not a public bypass recipe. No public deceptive media was distributed.

## C2PA

`contentauth/c2pa-rs` was pinned and source/license-audited as an EF1 provenance candidate. No approved signed fixture and no Cargo runtime were available in the bounded Windows/WSL environment, so valid/invalid manifest execution was exhausted as a runtime path and recorded as `SOURCE_AUDITED_NO_SIGNED_FIXTURE_EXECUTED`. This is a blocker for C2PA *qualification*, not a reason to invent a custom provenance format.

The recommended future EF1 path is a thin wrapper around the official implementation, with separate states for valid, invalid, unsupported, and absent provenance. Absent C2PA means `NO_PROVENANCE_EVIDENCE`, not fake or human. Trust/signing policy remains an owner/legal decision.

## What is measurable from final bytes

| Claim | WP007L disposition |
| --- | --- |
| Current JPEG/PNG container | Reliably measurable |
| Current DQT/DHT/markers/sampling/progressive state | Reliably measurable with cross-checks |
| Estimated standard-table quality | Conditional estimate, encoder/table dependent |
| Current grid/crop clues | Measurable context; limited validation |
| Double-JPEG evidence | Probabilistic/contextual; not complete history |
| Resampling evidence | Probabilistic/contextual; not qualified broadly |
| “Never compressed previously” | Not provable from final bytes alone |
| JPEG history after JPEG→PNG | Not generally recoverable from container alone |
| Complete edit chain | Unknowable without provenance |
| Camera acquisition | Requires independent acquisition/provenance evidence; profile alone is insufficient |
| Human authorship | Not emitted by any WP007L codec tool |

## Evidence-grade boundary

The current data supports these research states:

- `ACQUISITION_CONSISTENT`: current-byte facts and known lineage agree; context only.
- `LIMITED_FORENSIC_QUALITY`: controlled descendant or partial evidence supports limited analysis.
- `TRANSFORMATION_EVIDENCE_PRESENT`: known or measured current-byte changes warrant downgraded applicability.
- `UNKNOWN`: parser/provenance/history evidence is missing or contradictory.
- `UNSUPPORTED_FOR_CERTIFICATION`: history or applicability is unknown, destructive, or not independently qualified.
- `EVIDENCE_GRADE`: not demonstrated by this package.

No broad native-camera `SUPPORTED` class was earned. The bounded estimate cannot be converted into customer acceptance rates because the confirmation set is historical camera-claimed media rather than a fresh physical-device acquisition panel. The technically defensible product principle remains: analyze original uploaded bytes, keep physical acquisition and synthetic origin as separate axes, and report insufficient evidence instead of guessing.

For a future camera route, the minimum candidate combination is not a JPEG profile. It is independent provenance or enrolled physical-acquisition evidence, plus codec/profile consistency, plus no material transformation evidence. A camera-looking JPEG alone cannot earn certification.

## SAFE-A role

SAFE-A remains valuable for validated positive synthetic evidence in supported regimes. WP007L does not expand SAFE-A authority to camera-looking JPEGs, recompressed media, or unknown-history PNGs. It does not map low SAFE to human and does not route camera evidence through SAFE as a substitute for EF2.

## Build-versus-adopt outcome

The recommended modular ownership is:

- **Lythaus-owned:** marker/DQT/DHT bitstream contract, current-byte evidence schema, privacy-safe metadata consistency contract, source-linked descendant manifest, deterministic reason codes.
- **Third-party validation/adoption candidates:** `jpegio`/`jpeglib` for coefficient access after dependency review; `c2pa-rs` for later EF1 provenance integration.
- **Research oracle only:** ExifTool and Sherloq.
- **Reference/reimplementation:** ZERO and PNU-Matlab concepts, without copying copyleft/MATLAB runtime code.
- **Future research:** qualified PRNU/device evidence, CFA/demosaicing, broad double-JPEG/resampling classification, thumbnail visual correspondence.

The combined toolforge remains CPU-bounded and deterministic. The final feature extraction run processed 1,460 records in 1,031.624 seconds, about 706.6 ms per record on the Ryzen 7-class CPU. No GPU, paid service, or training run was used. That timing is a research benchmark, not a production SLO.

## Answers to the required questions

1. Native camera JPEGs were not distinguished from controlled recompressions with a qualified broad rule; current-byte changes are measurable.
2. DQT, DHT, marker, sampling, dimensions, metadata-marker and thumbnail-presence facts are the most useful current-byte signals.
3. DQT/marker profiles help characterize a pipeline/model context, not a physical device.
4. Static profiles are spoofable; DQT/sampling/selected EXIF matched 20/20 synthetic spoofs.
5. JPEG grid evidence detected measurable controlled-lineage differences, but the external oracle was only smoke-tested and does not prove history.
6. Double-JPEG and resampling evidence are limited contextual instruments, not qualified universal detectors.
7. Thumbnail and metadata consistency can expose contradictions or loss, but absence/presence is not authenticity.
8. ExifTool is useful as a privacy-safe validation oracle; not yet a production dependency.
9. `jpegio`/`jpeglib` are useful coefficient/current-byte oracles; adoption still requires dependency review.
10. ZERO is scientifically useful as a reference, but AGPL prevents direct production integration here.
11. Sherloq is a useful map/oracle, but GPL prevents copying or direct production dependency.
12. PRNU is exploratory and not practical for product identity with the current JPEG-only cohort.
13. CFA/demosaicing is not practical to qualify without RAW/device-controlled data.
14. C2PA integration is worth adding to EF1 later; execution was blocked by absent signed fixtures/runtime.
15. A broad evidence-grade camera route is not demonstrated; a multi-axis provenance/EF2 route remains a future candidate.
16. Camera uploads should not be routed primarily through SAFE; EF2 plus EF1/codec context is the appropriate camera path.
17. SAFE-A remains useful on validated digital/original regimes, but not as a universal camera-JPEG authority.
18. Unknown-history internet media, copied profiles, JPEG→PNG, and destructive/repeated transforms remain limited or unsupported for certification.
19. GPT-OSS, Safety, and Moondream require no architecture change.
20. FLUX.2 remains sealed.

## Single highest-value next experiment

WP007M should be a narrowly predeclared, owner-controlled acquisition study, not another detector search:

1. collect multiple fresh images from at least two physical devices per model, with original files and privacy-approved metadata;
2. collect RAW or highest-available sensor-preserving references where lawful;
3. create an independent device-held-out confirmation panel;
4. include controlled re-encodes, screen recaptures, metadata transplants, and synthetic profile spoofs;
5. qualify PRNU/CFA/thumbnail/provenance combinations against physical-device identity and false acceptance;
6. include valid and invalid C2PA fixtures in the same frozen protocol.

This experiment has higher information value than training another detector because it tests the missing evidence needed to earn a native-camera route. It must not open FLUX.2 or sealed EF2 reserves until the protocol and candidate evidence contract are frozen.

## Final boundary

WP007L is research-only. No production authenticity decision is authorized. No public label, upload restriction, enforcement route, appeal behavior, Safety policy, Judge authority, or database schema was changed.
