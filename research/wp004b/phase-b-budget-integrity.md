# WP004B Phase B Budget-Integrity Gate

This note records the software-only gate required before a fresh live Judge calibration.

## Prior run

Workflow run `34692233144` is `INVALID_FOR_SCIENTIFIC_SCORING` because `PROVIDER_USAGE_UNRECOVERABLE` prevented recovery of its exact GPT-OSS usage. The possible usage range is `1-3` calls; the run is excluded from Phase B statistics.

## Accounting contract

The Phase B runner reserves a call record immediately before invoking GPT-OSS. The reservation is never rolled back. The record is updated only with sanitized transport and normalization metadata, and is atomically journaled after reservation, transport completion, and case completion.

The journal records the ordered case mapping, provider/model, attempted-call state, transport completion, canonical success, failure stage, execution time, HTTP status, envelope class, controlled normalization code, retry count, and ambiguous-send state. It never records provider content, reasoning, tool arguments, request bodies, image data, or credentials.

The workflow finalizer runs with `if: always()`, reads only the journal, emits a sanitized cap/accounting summary, and fails closed when the journal is missing, malformed, over budget, or internally inconsistent.

The budget is three GPT-OSS attempts, three total provider attempts, and zero retries. Each case may reserve at most one call. An exception after a request is considered sent is counted conservatively and marked ambiguous.

## Scientific marker

`VALID_FOR_SCIENTIFIC_SCORING` requires exact ordered accounting, a respected cap, known zero retries, no ambiguous send, and a sanitized result for every executed case. Otherwise the run is `INVALID_FOR_SCIENTIFIC_SCORING`. This marker is separate from workflow success and from epistemic validity.

## Phase B authorization status

This phase adds no provider calls and does not authorize a fresh live run. A separately authorized fresh three-call baseline remains required after this gate passes.
