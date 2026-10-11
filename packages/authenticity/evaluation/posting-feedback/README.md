# Offline posting feedback evaluation

This is evaluation tooling, with no runtime import, CI mutation, provider resource,
credential lookup, database write or enforcement switch. Public posting remains
withheld. The default transport returns scripted responses without calling
ambient `fetch`; the Workerd tests intercept all outbound requests with an internal
fixture binding. There is no live collection mode.

From the repository root, using the existing root lockfile and Node 22 or later:

```sh
npm ci --ignore-scripts --no-audit
./node_modules/.bin/tsc -p packages/authenticity/evaluation/posting-feedback/tsconfig.json --noEmit
node --experimental-strip-types --test packages/authenticity/evaluation/posting-feedback/harness.test.mjs packages/authenticity/evaluation/posting-feedback/workerd.test.mjs
node --experimental-strip-types packages/authenticity/evaluation/posting-feedback/run.mjs --output .artifacts/posting-feedback/synthetic-report.json
```

The local report contains the corpus hash, per-file tooling hashes, checkout SHA
and dirty state, source-family/revision/content bindings, provider schema, model
alias, category flags/scores/input modalities, scripted timing, sanitized failures,
missing evidence, separate disclosure results, and confusion matrices by split and
supported scenario slice. Raw content, arbitrary provider messages, model rationale
and credentials are excluded. Reports use mode 0600 and an atomic rename; interrupted
collection produces no completed report. Concurrent output writes each commit a
whole report; the last completed rename wins, with no claim of call deduplication.

The 32 agent-written scenarios are artificial. A `human` scenario is not a
verified human-written sample. A response marked `ALLOW_EVIDENCE` means only that
the scripted provider did not flag it. Authors, safety policy, declarations and
publishing authority remain separate. SAFE cases use invented protocol records,
not decoded images or loaded checkpoints. Image/frame Workerd tests exercise the
safety transport and preserve unsupported category modalities; they do not test
video temporal safety, audio, image classification accuracy or public media.

Matrices retain safe/violation/unknown truth and allow/review/block/abstain outcomes.
False rejection is blocked safe samples divided by all labelled safe samples;
false acceptance is allowed violations divided by all labelled violations.
Review is not counted as rejection; abstention is not counted as a true negative.
Review burden, abstention and coverage are reported separately. Authorship matrix
labels mean the scripted scenario has AI involvement, including assistance;
they do not mean a safety violation or a violation of disclosure policy.
Wilson 95% intervals are descriptive checks of the formula, not population
estimates from these artificial samples. Related-family rows suppress the interval
until a cluster method is specified. Empty denominators remain null.

Source-family IDs prevent declared family leakage and NFC-normalized hashes reject
duplicate bodies. They cannot detect unrecorded relationships; a real evaluation
needs audited source, author, prompt, transformation and generator lineage before
freezing its splits. The report never tunes on holdout or supplies numeric posting
thresholds. Scores and model self-confidence are uncalibrated.

The internal observation validator rejects duplicate/replayed observations,
incomplete collection, stale revisions, content/fixture/label/split mismatches,
contradictory evidence, model identity changes and authority changes. This protects
the offline evaluation process; it is not a transactional production revision,
receipt, retry, queue or publication implementation. Do not feed arbitrary or live
receipts into its synthetic provenance envelope.

See [the owner report](../../../../docs/testing/moderation-authenticity-evaluation-2026-10-11.md)
and [the unexecuted live evaluation plan](evaluation-plan.json). Existing CI does
not discover these tests automatically. Allocating a CI command is separate shared
work for the parent; successful unrelated checks cannot replace this command.
