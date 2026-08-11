# Lythaus Authenticity AI Deterministic Spectral and Camera Baseline - WP003

## Implementation

`generateForensicFeatureBundleV1` is a deterministic, model-free branch. It
adds the following to the reusable `ForensicFeatureBundle`:

- multi-scale FFT magnitude and phase at 8x8 and 16x16 grids;
- DCT coefficients, Haar-like wavelet statistics, and high-pass residuals;
- JPEG quantisation and double-compression indicators;
- metadata/encoder/XMP/C2PA interface observations;
- channel-correlation CFA/demosaicing proxy;
- residual noise, edge-gradient coherence, chromatic consistency, and a
  conservative periodic moire proxy;
- a fixed-length 169-element feature vector;
- camera evidence details without a synthetic-origin verdict;
- audit metadata with `NO_ENFORCEMENT` and uncertainty `unknown`.

The camera branch exposes evidence states only. It never emits
`AUTHENTICATED_CAMERA`, and absence of camera evidence is not mapped to AI
generation.

## External attended measurement

The external cache contains 80 camera-metadata-selected Unsplash Dataset Lite
images. No normal Lythaus user content was used. The feature store was
regenerated after tightening the periodic moire proxy.

| Measurement | Result |
|---|---:|
| Original bundles | 80 |
| Feature vector lengths | 169 for all 80 |
| Execution time | 554-1,990 ms; mean 1,074.03 ms |
| Camera origin evidence | 80 `CAMERA_NATIVE_LIKELY` |
| Screen recapture likely | 0 |
| Moire score | 0-0.076059; mean approximately 0.000969 |
| Synthetic detector result | Not run; no neural model dependency |
| Enforcement authority | None |

These are preprocessing measurements, not accuracy, calibration, camera
authentication, or model-generalisation claims. The source slice has no
balanced synthetic or hard-negative truth labels, so FPR/FNR cannot be inferred
from it.

## Transformation coverage

The materialisation tool produced 720 descendants for the 80 originals:

- JPEG quality 95 and 75;
- resize 75% and 50%;
- crop 10%;
- mild blur;
- mild sharpening;
- metadata-stripped JPEG;
- screenshot-style resampling.

All descendants inherit the source rights and source-family identifier. The
current feature-store measurement pass is on the 80 originals; transformed
feature extraction and stability metrics remain a next measurement step.

## Interpretation

The deterministic branch is ready as a reusable preprocessing/evidence layer.
It is not ready as an authenticity classifier. Learned spectral or camera
branches require an approved Class A or Class C corpus, calibration, subgroup
metrics, transformation stability, and a human review gate.
