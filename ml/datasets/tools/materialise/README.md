# Dataset materialiser

This is a reproducible, provenance-first tool for Lythaus-owned research
materialisation. It is not a user-upload processor and must only operate on a
task-scoped external cache.

The tool is evaluation-only: it refuses training, distillation, normal Lythaus
user content, repository output paths, unresolved source rights, and missing
evaluation or modification permission. `CONDITIONAL` or `UNKNOWN` source
rights need a recorded human approval with explicit scopes; `DENY` and
`DO_NOT_TRAIN` never become an implied permission. Dataset binaries and
generated descendants stay outside Git; manifests, terms references, hashes,
and registry decisions are the reviewable artefacts.

Set an external, task-scoped cache before running a materialisation command:

```powershell
$env:LYTHAUS_AUTHENTICITY_CACHE = 'D:\lythaus-authenticity-cache'
```

Approval records are external JSON files and include an immutable approval ID,
approver, timestamp, `decision: "APPROVED"`, and the required scopes. The
Unsplash acquisition path requires `SOURCE_RIGHTS`, `EVALUATION`,
`MODIFICATION`, and `ACQUISITION`.

Install the local-only image backend before materializing encoded descendants:

```powershell
npm install --ignore-scripts=false
```

The current smoke-test commands do not require image downloads:

```powershell
node ml/datasets/tools/materialise/materialise.mjs --help
node ml/datasets/tools/materialise/materialise.mjs validate <provenance.json>
node ml/datasets/tools/materialise/materialise.mjs transform-plan <external-manifest.jsonl> <external-output.json>
```
