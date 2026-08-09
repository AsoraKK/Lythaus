# Benchmark v0 external materialisation ledger

**Status:** `PARTIAL_PROVENANCE_FIRST`
**Contains normal Lythaus user content:** `false`
**Media location:** outside Git at `C:\Users\kylee\Projects\Lythaus-data\authenticity-wp003`

## Materialised source

The official Unsplash Dataset Lite archive was downloaded on 2026-08-09 from
the dataset project source and retained outside the repository. The selected
slice contains camera metadata and is registered as
`CLASS_B_EVALUATION_ONLY` with `trainingGate=DO_NOT_TRAIN` and
`distillationGate=DO_NOT_TRAIN`.

| Artifact | Value |
|---|---|
| Archive | `unsplash-research-dataset-lite-latest.zip` |
| Archive SHA-256 | `aa0fcbb859040ed64e93817d1d878d0c6f861763283261ba1a6aa5d8d4af6aec6` |
| Archive size | 320,024,071 bytes |
| Terms snapshot SHA-256 | `79bec96fe07431e1c40efcdf9f9753da24338a3cb97d7d22ac29dc830e3e2437` |
| Terms snapshot | `terms/unsplash-dataset-terms.md` outside Git |
| Source originals | 80 |
| Transformation descendants | 720 |
| Benchmark records | 800 |
| Original media plus descendants | 706,840,926 bytes |

## Manifest hashes

| Manifest | SHA-256 |
|---|---|
| `benchmark-v0/unsplash-camera/manifest.jsonl` | `49433abe86b6702eeacab6f2bfa3406dbbe1a4b6e1d508818666c46c4f547cdf` |
| `benchmark-v0/unsplash-camera/transformed-manifest.jsonl` | `aeb03fc24b976e7ca67d0634eaa5f48690237bc2ed69bed953b365b7b0914c10` |
| `benchmark-v0/benchmark-v0.json` | `2ea0e693fffe963ff2187360ac58cd16d9818eecac242791010a278224d98009` |
| `feature-store-v1/index.jsonl` | `18aa56cdea25340864204b2609cf28b602700b558da5094de1011f974ebc5a95` |

The benchmark manifest was schema-validated and contains 80 source families,
800 records, one `EVALUATION_ONLY` partition, and no user content. The target
320-source composition was not padded with unclear or restricted material.

Large media and feature bundles remain outside ordinary Git history. The
ledger, code, rights decisions, and hashes are the repository evidence.
