# WP004B Judge Structured Output Hardening

## Phase E

Phase E adds a software-only, packet-aware JSON Schema hardening layer for
the existing `JudgeRecommendation` contract. It does not change the Judge
prompt, Evidence Packet v1, epistemic policy, provider adapter, or canonical
parser, and it performs no provider inference.

## Contract boundary

The defense-in-depth order is:

```text
GPT-OSS
  -> provider JSON Schema constraint
  -> provider-envelope normalization
  -> canonical Judge parser
  -> packet evidence-reference validation
  -> WP004B epistemic evaluator
```

The schema is a generation constraint, not an epistemic evaluator or policy
engine. `assertJudgeRecommendation` remains authoritative after provider
normalization.

The provider-facing schema identity is
`lythaus-judge-json-schema-v1`. The canonical recommendation schema remains
`"1"`; these versions are intentionally separate.

## Request modes

`buildJudgeRequest(packet)` continues to emit:

```json
{ "response_format": { "type": "json_object" } }
```

The explicit research-only option
`buildJudgeRequest(packet, { "structuredOutputMode": "JSON_SCHEMA" })`
emits the Cloudflare Workers AI shape:

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": { "...packet-aware schema...": "..." }
  }
}
```

The default remains `JSON_OBJECT`. The model, prompt v3, messages,
temperature, max-token allowance, endpoint, and Chat Completions adapter are
unchanged.

## Packet-aware constraints

- All eleven canonical top-level properties are required.
- Top-level and nested output objects use `additionalProperties: false`.
- Hypotheses, uncertainty, additional tests, Observer categories, and
  escalation reasons derive from existing canonical constants.
- Evidence-reference IDs derive from the packet reference universe and are
  sorted deterministically. The separate Safety context ID is explicitly
  excluded.
- `missingEvidence.observationId` derives only from packet observations and
  observation history. If none exist, that property is not allowed.
- Empty evidence-reference universes use `maxItems: 0`, not an empty enum.
- Alternative, evidence-reference, missing-evidence, additional-test, and
  string bounds mirror or tighten the existing parser bounds.
- Target regions require normalized coordinates in `[0, 1]`, positive width
  and height, and an optional bounded label. The parser still enforces
  `x + width <= 1` and `y + height <= 1` because JSON Schema does not encode
  those cross-field inequalities here.

Dynamic semantic relationships remain parser-side: observation/category and
reason/category compatibility, recheck requirements, exact region geometry,
evidence-reference behavior, forbidden fields, and epistemic directionality.

## Deliberate asymmetries

The provider schema is intentionally stricter than the compatibility parser:

- unknown harmless properties are rejected by the provider schema;
- overlong arrays are rejected instead of being sliced;
- overlong strings are rejected instead of being truncated;
- the provider constraint uses packet-known IDs while the parser remains the
  final reference validator.

This is hardening, not a replacement for canonical validation.

## Audit correction

Phase D confirmed that the authoritative evaluator passed B1 while the
supplementary rationale heuristic falsely labeled disciplined EF2/EF4
language as a violation. Phase E scopes rationale classification to relevant
sentence/segment context, preventing cross-sentence `support` matches from
turning explicit negation such as “unvalidated ... do not provide directional
evidence” into a violation. B1 remains a negative regression fixture and the
calibrated B3 EF5 rationale remains `DISCIPLINED`.

The structured epistemic evaluator remains authoritative; the rationale
audit is supplementary and is not allowed to override it.

## Prompt documentation note

Prompt v3 currently says “the twelve fields” while the actual canonical
recommendation and this schema contain eleven top-level fields. This is
recorded as `PROMPT_FIELD_COUNT_TEXT_MISMATCH` and is intentionally not
changed in Phase E so a future live comparison isolates `json_object` versus
`json_schema`.

## Validation status

Phase E validates schema construction locally with Ajv fixtures and parser
compatibility tests. Cloudflare support for this exact GPT-OSS `/ai/run`
JSON Schema path is not claimed until a separately authorized live test.
