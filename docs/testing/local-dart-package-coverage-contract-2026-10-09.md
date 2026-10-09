# Canonical Dart package verification and coverage proposal

The SDK is source generated inside this repository, not an artifact downloaded from pub.dev. Flutter consumes `build/api_client`, prepared from `lib/generated/api_client` by the existing Dart validator. All five runtime dependencies of that package are hosted and locked in the root `pubspec.lock`.

The authorized native comparisons from #965 `822d799029c22e91d249a50826441ae82e218ed1` to #967 `60fac322201427748079da3f1d03dac133a43218` and parser candidate `b2584899b808a9fec48c969ec53e1efebc6c0247` list the two new hosted packages, `one_of` and `one_of_serializer`, but omit `lythaus_api_client`. The parser repair retains the SDK in the expected list; cumulative native coverage therefore stays incomplete. This document does not claim a native entry for the SDK.

[Dart documents path packages as local filesystem dependencies](https://dart.dev/tools/pub/dependencies#path-packages). [GitHub documents static manifest analysis and a separate dependency-submission API](https://docs.github.com/en/enterprise-cloud@latest/code-security/concepts/supply-chain-security/dependency-graph-data), but the checked public documentation does not establish the precise path-package behavior of the private indexer. The first-party path source and observed API omission explain the category mismatch; attributing it to a particular internal parser implementation would be an inference. No settings, snapshots, credentials or entitlements were changed to investigate it.

## Current implementation boundary

This is a separate tests/scripts proposal on parser-repair base `6b49f20339c31a0689b97462f02eac6451467ae2`. The only active parser change strengthens the canonical exception: each stable Dart runtime dependency constraint must admit the actual locked version. `dio: ^900.0.0` with locked `5.2.0` is rejected. Supported forms are stable exact versions, caret versions, and intersections of stable comparison bounds; unsupported expressions fail closed. No root package configuration changes.

The SDK remains in `expectedChanges` and `missingCoverage`; native API, severity, license-resolution and final receipt gates are unchanged. The new source verifier is not wired to grant cumulative dependency coverage. A source evidence receipt explicitly uses `nativeIndexing: NOT_CLAIMED`. Nothing here makes a failing cumulative native review pass.

## Actual evidence chain

| Stage | Invoked implementation | What it establishes |
| --- | --- | --- |
| Generated source freshness | Existing CI OpenAPI job: bundle, regenerate with pinned generator, `openapi:check:dart` | Tracked generated SDK matches the canonical OpenAPI output at the checked revision |
| Source identity | `localDartIdentity` reads exact Git objects | Head SHA, all canonical library blob IDs and tree ID, root manifest/lock, SDK manifest, preparation script, runtime dependencies, SDK fixtures, policy guard and fixture generator are bound |
| Preparation | Existing validator compiles in a disposable package and copies source plus built serializers into `build/api_client` | Every tracked SDK source file and original manifest must match the prepared package; the prepared library including generated parts has a separate SHA-256 digest; symlinks and substitutions are rejected |
| Locked runtime | Source-evidence mode prepares the SDK, resolves the app with `flutter pub get --enforce-lockfile`, and traverses only the five direct runtime roots in the real `dart pub deps --json` graph | Every runtime package version and artifact hash must match the root lock, including transitive packages; the separate generator development/toolchain lock is recorded |
| Real package behavior | `--source-evidence` runs seven explicitly named fixture suites with the real Dart runner | Monthly/calendar serialization, own-member paths and bearer auth, real admin admission guard, privacy/preferences, support/activity models, HTTP 401/403 rejection, malformed authority, cancellation and exact CSV bytes |
| Assertion sensitivity | Temporary-copy mutations remove bearer auth or change the monthly owner route | Each must produce a named assertion failure in the real monthly HTTP fixture. Compiler/process failures and zero/placeholder-only reports are insufficient |
| Receipt validation | `verifyLocalDartReceipt` | Missing/stale head, altered source at the same version, mismatched preparation, absent behavior/mutation proof, unapproved classification and denied/mismatched license evidence fail |
| Consumer integration | Existing Flutter test/coverage/build and dedicated monthly/browser checks | App integration uses the prepared package. Client-only tests do not prove server ownership or authorization; native route/database tests establish those boundaries separately |

The generated `lib/generated/api_client/test` files mostly contain empty TODO callbacks. Their large pass count is a compile/smoke result, not behavioral coverage. The source-evidence mode counts only the explicit fixture suites, records their named outcomes, and requires actual mutation assertion failures. Node tests using synthetic reports or a fake Dart process validate the receipt/command protocol only; they do not count as SDK behavior, native indexing, or license approval. No whole-package line-coverage percentage is claimed.

```sh
node --test scripts/tests/dependency-review-policy.test.mjs scripts/tests/openapi-dart-nested-builder-assignment.test.mjs
node scripts/validate-openapi-dart-client.mjs
node scripts/validate-openapi-dart-client.mjs --source-evidence
```

Source-evidence mode requires a clean tracked checkout and removes any old receipt before running. It writes `.artifacts/security-run-evidence/local-dart-package.json` only after real behavior and mutation checks pass. The exact committed head, source/recipe blobs, resolved temporary toolchain lock hash and prepared package digest are recorded. Temporary mutations are restored and the temporary validation package is removed.

The generator's temporary dev graph can use newer libraries than the app lock (observed `meta 1.19.0` versus app `1.17.0`). Generator analysis remains separate from behavior proof. The named behavior fixtures and mutations execute against the prepared package through the app's enforced package configuration. Copies live only under ignored `.artifacts`; the temporary monthly wire path is changed to point at its synthetic fixture. Root package files and tracked SDK sources are unchanged.

## Ownership/license gate

There is no canonical SDK approval record in this candidate. `LICENSE.txt` names `rhysd`; the API specification declares MIT; the SDK manifest contains no license declaration. Those facts do not authorize treating the generated SDK as an approved MIT component. The real receipt remains `classification.state: unapproved`, and source verification cannot complete the coverage contract.

The proposed owner-maintained record is `infrastructure/canonical-dart-package-approval.json`. It is not created here. A reviewed record would bind package name/version, source tree, canonical manifest blob, Lythaus ownership, an explicit license decision and its decision reference, plus the existing canonical API license evidence blob. Its Git blob is bound in the source receipt. A different license/evidence contract requires owner review; this implementation does not guess one. GPL-3.0/AGPL-3.0 variants cannot be approved through this local verifier.

Tests create a clearly labeled synthetic approval record inside disposable fixture repositories solely to verify rejection/identity semantics. That fixture is not a real ownership or license decision.

## Smallest accurate future gate update

After independent review and a real owner classification decision, keep every SDK entry in the expected component list. For the exact canonical SDK identity only, require the source-bound receipt and approved classification. Keep hosted direct/transitive additions under the existing native graph, vulnerability severity and artifact/license checks. Distinguish `nativeCoverage` for hosted packages from `firstPartySourceVerification`; report aggregate completeness only when both are complete. Never label local source verification as native indexing and never accept arbitrary path/git packages.

The shared dispatcher is not changed here. Parent serialization is needed for `.github/workflows/dependency-review.yml` to invoke real Dart verification using the existing pinned Flutter/Dart setup before its license/final gate, and for `dependency-review-native.mjs` / `dependency-review-receipt.mjs` to consume the reviewed source contract with explicit per-source status. Any change to the license-stage completeness precondition must preserve complete hosted-native coverage and approved local evidence. No additional token permission, security setting or dependency submission is proposed.

Until those decisions and serialized wiring exist, the cumulative SDK coverage gate stays closed. Coordinate with the UI writer before integrating either candidate. No merge, deploy, provider change, activation, DDL or production data operation occurs in this task.

## Hosted and artifact limits

Parser repair #968 is at `6b49f203`. Exact-head CI `37947731134` passes native, OpenAPI, Web frontends, hygiene, workflow lint and disabled activity integration; Flutter fails at the inherited `Verify rendered Flutter authentication journey` step, and the aggregate dependency-audit summary fails. Dependency review `37947736903` passes for the parser-only frozen comparison, while CodeQL `37947742959` and secret scan `37947748743` pass. These do not establish cumulative SDK coverage or full CI success.

The normal artifact download from historical parser run `37945065291` returned HTTP 403 from signed storage. Its receipt contents were not inspected; no alternate route or further signed artifact download was used. The earlier denied UI job-log target also remains unused. Hosted conclusions are taken from structured run/job/step metadata, with cumulative missing coverage separately calculated from the authorized native dependency-graph API and exact Git revisions.
