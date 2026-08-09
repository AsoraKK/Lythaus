# Dataset materialiser

This is a reproducible, provenance-first tool for Lythaus-owned research
materialisation. It is not a user-upload processor and must only operate on a
task-scoped external cache.

The tool refuses to authorize training or distillation from unclear, evaluation-
only, or unverified rights. Dataset binaries and generated descendants stay
outside Git; manifests, terms references, hashes, and registry decisions are
the reviewable artefacts.

The intended cache for WP003 is:

`C:\Users\kylee\Projects\Lythaus-data\authenticity-wp003`

Install the local-only image backend before materializing encoded descendants:

```powershell
npm install --ignore-scripts=false
```

The current smoke-test commands do not require image downloads:

```powershell
node ml/datasets/tools/materialise/materialise.mjs --help
node ml/datasets/tools/materialise/materialise.mjs validate <provenance.json>
```
