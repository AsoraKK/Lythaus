# Lythaus Authenticity Benchmark v0

**Status:** design-only; no corpus downloaded or committed
**Purpose:** evaluate evidence quality before any model receives enforcement authority

## Design principles

- Small, legally auditable, provenance-first corpus.
- Separate source-image identity from transformed variants using a stable
  `groupId`.
- Keep generator families and model versions explicit.
- Hold out at least one generator family and one transformation combination.
- Never use normal Lythaus user content.
- Store manifests, hashes, rights evidence, and labels; keep media external or
  in an approved quarantine/evaluation R2 prefix.

## Initial target composition

The first materialisation should target **320 source images** and no more than
**2,880 derived variants**, subject to licence approval:

| Slice | Source count | Required coverage |
|---|---:|---|
| Camera-native | 80 | smartphone, dedicated camera, computational photography, HDR/night, low light, portraits, landscapes, indoor/outdoor, regions and skin tones |
| AI-generated | 80 | at least eight generator families, including diffusion, autoregressive, transformer/unified, and approved closed-source evaluation outputs |
| CGI/3D and digital art | 40 | renders, digital paintings, illustrations, game screenshots |
| Scans and scientific/medical imagery | 20 | scanned artwork/documents and non-social scientific imagery where rights permit |
| Screenshots and composites | 30 | UI screenshots, memes, composites, aggressively edited photography |
| Partial edits | 40 | inpainting, generative fill, local replacement, face manipulation only if permissioned, mixed-origin composites |
| Reserved unseen holdout | 30 | withheld generator/source family, never used for calibration |

The counts are targets, not permission to acquire material. If a legally clean
source cannot supply a slice, the slice is reported `UNKNOWN` or `BLOCKED`.

## Transformation matrix

Each eligible source image receives, where technically meaningful:

- `ORIGINAL`
- `JPEG_COMPRESSED` using quality 95 and 75 variants
- `RESIZED` at 75% and 50%
- `CROPPED` by 10%
- `SCREENSHOT` simulation
- `SCREEN_RECAPTURE` where a legally safe captured fixture exists
- `BLURRED`
- `SHARPENED`
- `METADATA_STRIPPED`
- `INPAINTED` or local-edit variant

Variants inherit the source rights and must retain a parent hash, transformation
parameters, decoder version, and deterministic seed where applicable.

## Required manifest fields

`sampleId`, `groupId`, `origin`, `transformation`, `generatorFamily`,
`generatorVersion`, `sourceDatasetId`, `sourceUrl`, `licenceClassification`,
`contentSha256`, `perceptualHash`, `width`, `height`, `mime`, `hasPii`,
`consentStatus`, `split`, `truthSynthetic`, `truthLocalManipulation`, and
`retentionClass`.

## Metrics and gates

Every model run must report false-positive rate, false-negative rate, precision,
recall, F1, AUROC, AUPRC, Brier/ECE calibration, abstention, per-generator and
unseen-generator results, per-transformation results, hard-negative results,
latency, memory, CPU time, and estimated cost.

The policy target for human-content false positives is **≤1% overall**. Any
material subgroup above **2%** triggers mitigation and human review. These are
eligibility targets, not current model claims. No benchmark result changes
publication or enforcement state.

## Reproducibility

Record dataset-registry version, manifest hash, model manifest ID/version,
evidence schema, policy version, transformation implementation version,
runtime/CPU, random seed, and artifact hashes. Large media remain outside
ordinary source control.
