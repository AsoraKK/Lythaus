# Canonical SDK category verification

This candidate replaces candidate-controlled SDK evidence with a fixed recipe,
fresh isolated execution, and category-aware dependency accounting. Its base is
reviewed PR #970, `8d480b1af59d7da0b7184d5b9ee9be4525f90e45`.
The exact candidate revision is recorded in the draft PR and workflow run.
Main remains `1853ed33fe5aa0b159597b914a5e77c84a69d193` at validation.

The canonical SDK remains an expected component. Its native indexing is
`NOT_CLAIMED`; a successful source check cannot relabel GitHub's raw native
coverage. Every other expected Pub, npm, linked npm, and Python component retains
its existing native coverage obligation. SDK source or OpenAPI changes also
create an obligation when `lythaus_api_client` remains version `1.0.0`.

## Trust boundary

Protected main supplies the bootstrap and approval record. That record must pin
a different, independently reviewed verifier commit, its complete Git tree, and
the dependency-review workflow blob. The bootstrap checks public read-only GitHub
run, workflow, and attempt-specific job responses against the repository,
workflow path, exact workflow revision, run ID, attempt, and actual job ID.
Names alone do not establish authority. Eligible runs require manual dispatch
of this workflow from protected main. Candidate workflow runs and PR test merges
cannot establish that authority.

The host materializes the verifier's recipe, imports, preparation scripts,
fixtures, setup code, npm lock and workspace/file-package manifests from the
pinned Git objects. `npm ci --ignore-scripts` installs that reviewed closure;
candidate package scripts, TypeScript wire generators, and candidate checkout
helpers are never host verdict inputs. The candidate contributes exact Git
objects for the application manifests/lock, Flutter version, OpenAPI sources and
bundle, and canonical SDK. Checkout edits do not change these objects.

The host verifies complete hosted archive hashes from both locks and rejects
unsafe archive members. It launches a disposable non-root Docker container with
no network, a read-only root, dropped capabilities, no new privileges, isolated
processes, and bounded CPU/memory/PIDs. Candidate code sees fixed preparation
scripts and read-only fixtures, tool/package mounts, and a private writable
work directory. It cannot see the host verdict modules, source repository Git
directory, Docker socket, credentials, or GitHub commandfiles. Pub's writable
cache metadata is disposable; hosted package contents and integrity files remain
read-only. Candidate stdout is captured as bounded data and never forwarded to
the workflow command channel.

First, the trusted recipe rebundles OpenAPI and regenerates the SDK using pinned
Redocly/npm and OpenAPI Generator 7.7.0. The host compares the bundle and all
994 tracked generated files, excluding only the existing generated `FILES`
inventory exception. Preparation starts only after those comparisons match.
Frozen generator and application locks prepare serializers and the real
`build/api_client` path. Complete dependency graph nodes, versions, sources and
edges must agree with the locks. The SDK's 24-package application runtime closure
is recorded separately from the generator's 67 hosted packages (68 graph nodes).

Seven fixed synthetic suites run against the prepared SDK with the frozen
application graph and a fixed 57-case catalogue. Both deliberate
SDK mutants must produce named assertion failures; compilation/process failures
do not count. The host checks source preservation after each execution and
rejects symlinks, hardlinks, special files and oversized outputs. It aggregates
the fresh in-memory source result with native severity/coverage and the existing
archive-license policy. The CLI accepts no transported receipt as proof.

## Serialized bootstrap and owner gates

This PR deliberately leaves `canonical-sdk-trust.json` in
`pending-independent-review`. Its author cannot select their own trusted SHA.

1. Independently review and publish the verifier foundation as commit A through
   the coordinator's normal serialized process. This task does not merge it.
2. In a separate reviewed change B on protected main, pin A, its Git tree and
   unchanged workflow blob, with the independent review reference. A does not
   embed its own future SHA. B supplies the anchor without changing A's recipe.
3. Resolve SDK ownership/license evidence in protected-main
   `infrastructure/canonical-dart-package-approval.json`. The record must bind
   package/version, the exact library tree and manifest blob, ownership,
   explicit license expression, evidence path/blob and owner approval reference.
4. Supply reviewed exact archive/license hashes and expressions for every SDK
   runtime package in protected-main
   `infrastructure/canonical-dart-runtime-licenses.json`. Missing evidence,
   including the previously unresolved `one_of` and `one_of_serializer`, remains
   `HOSTED_RUNTIME_LICENSE_EVIDENCE_REQUIRED`; archive presence alone is not a
   license approval. The existing denied-license policy still applies.
5. Dispatch dependency review from protected main with distinct exact base/head
   inputs. The fresh host verifier must succeed alongside the native action and
   the existing archive-license resolver before aggregate eligibility succeeds.

No owner/classification/license approval record is created here. Existing root,
OpenAPI and generated metadata are preserved. The root license's vendor history
and OpenAPI's MIT metadata do not automatically assign the generated SDK's
license. No signing infrastructure, dependency submission, public attestation,
new credentials, additional token permission, provider/DDL/release mutation, or
merge is part of this change.

## Requirements to code to tests

| Requirement | Code | Evidence |
| --- | --- | --- |
| Independent pin; no self-approval | `canonical-sdk-bootstrap.mjs`, pending `canonical-sdk-trust.json` | Synthetic repository/workflow/job/revision attacks; real Git bootstrap projection test |
| Exact candidate data; same-version obligation | `canonical-sdk-contract.mjs`, `dependency-review-native.mjs` | Dirty checkout ignored; source-only SDK commit remains expected; nonregular Git input rejected |
| Fixed complete recipe and tool closure | `sdk-verifier/`, `setup-canonical-sdk-tools.mjs` | Frozen lock/hash checks; complete app and generator graph tests; matched full regeneration |
| Candidate execution isolated | `canonical-sdk-isolation.mjs` | Real container denies fixture/input writes, credentials, host processes, Docker socket and gate files |
| Complete hosted integrity and safe extraction | `sdk-verifier/cache-hosted-packages.py` | 207 real locked archives verified; six synthetic archive tests reject tamper, traversal, links and duplicate files |
| Trusted behavior and assertion mutants | Fixed Dart fixtures, `behavior-cases.json`, fixed monthly JSON | 57 successful cases/seven suites; bearer omission and own-route mutants produce genuine named assertion failures |
| SDK remains accounted; other native policy preserved | Native probe, receipt aggregator, license resolver | Missing hosted/linked components, warnings, severity/license failure and stale/ineligible source result all block |
| License/classification remains an owner gate | Protected-main approval reader, `approvedLicenseClassification` | Unapproved/stale source, missing archive/license hashes and denied expressions block; no production approval supplied |

## Validation and provenance

Focused validation covers 32 Node tests, one real Docker boundary test, six
existing Dart archive-license tests, and six new archive extraction tests. The
isolated development runner passes all 57 Dart behavior cases and both assertion
mutants. It reports `coverageEligible: false`,
`TRUSTED_VERIFIER_BOOTSTRAP_REQUIRED`, and `nativeIndexing: NOT_CLAIMED`.
Focused Node coverage is reported separately from isolated execution; unapproved
production activation and external setup are not represented as executed gates.

The useful preparation evidence from PR #969 is reused with provenance from
`f78891e03be905cb83860ffc1b8d075fb546094a`: its added canonical behavior fixture,
temporary toolchain manifest/lock, and captured synthetic monthly wire vectors.
The previous candidate wire generator is not executed by this verifier. The
other six suites and the frozen admission guard come from reviewed #970.
This does not copy #969's unrelated browser changes or undo #970's type guards.
The latest 13,500 monthly threshold and all disabled-feature distinctions remain.

The captured monthly vector SHA-256 is
`6ff648555286eafcb4498a45630a373b1a2f1031832b87b3fb54fac5349bec22`.
The fixed file adds a terminal newline and has SHA-256
`bf9a02797e9343e7c462c02041f62707567e364152fcb363421c6daacb0a1564`;
the frozen generator lock SHA-256 is
`f0b06e8d6004fce4e9f25d8fe3b5f3175a5277ab4a3939918d7289a95ba6e3a3`.
The compared SDK library tree is
`361ab63c3aa1bc9d2940e87d5ce213953a580a52`. The prepared package has 641
regular files. All fixtures are synthetic and contain no production data.

Local reproduction, using the installed reviewed toolset:

```sh
node --test scripts/tests/canonical-sdk-verification.test.mjs scripts/tests/dependency-review-policy.test.mjs
LYTHAUS_RUN_ISOLATION_TEST=1 node --test scripts/tests/canonical-sdk-isolation.test.mjs
python3 scripts/ci/test_dart_license_review.py
python3 scripts/ci/test_sdk_archive_cache.py
node scripts/ci/canonical-sdk-verifier.mjs --development-only --candidate <exact-commit>
```

The development command cannot activate eligibility. Its local evidence is
unsigned diagnostic data. A candidate-ref CI cycle can demonstrate bootstrap
failure but cannot substitute for the later protected-main production run.
Screenshots are unnecessary because this patch changes no rendered UI.
