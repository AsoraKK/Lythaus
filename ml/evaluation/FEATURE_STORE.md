# Forensic feature store v1

The feature store is an external, regenerable sidecar. It is not a database
migration, an R2 binding, or a replacement for the authoritative case evidence
contracts.

Each record is keyed by the image SHA-256 and records:

- dataset/sample/source-family identity;
- transformation and parent lineage;
- forensic schema version;
- spectral, camera, compression, and flattened feature vectors;
- a reserved field for future teacher scores.

Write a bundle with:

```powershell
node ml/evaluation/feature-store.mjs write <bundle.json> <external-store-root> <provenance.json>
```

The store must be regenerated from the dataset manifest and extractor version.
It must not contain raw image bytes, PII, public confidence values, or model
outputs that were not separately rights-cleared. Both the bundle and
provenance file must be external to the repository; the provenance record must
explicitly state `containsUserContent=false` and pass the shared source-rights,
evaluation, and modification authorization gate.
