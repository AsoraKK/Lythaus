# JPEG inspector feasibility

## Prototype decision

The bounded prototype is a pure Node module with no new dependencies. It parses JPEG markers and PNG headers, preserves exact quantization tables, identifies sampling and progressive state, detects marker-level metadata, computes a standard-table-equivalent quality estimate, and emits a conservative history state.

It intentionally does not emit:

- an AI/synthetic score;
- a double-JPEG verdict;
- a claim that a PNG was never JPEG-compressed;
- a claim that metadata absence implies anything about authorship.

## Deterministic versus probabilistic fields

| Field | Status from final bytes |
| --- | --- |
| current JPEG/PNG container | reliably measurable when valid |
| dimensions | reliably measurable from valid header |
| exact current DQT tables | reliably measurable for JPEG |
| current sampling factors | reliably measurable for JPEG SOF components |
| standard-table-equivalent quality | estimable only when table match is close |
| current metadata presence | measurable, but absence is weak evidence |
| double JPEG | probabilistic and method-dependent |
| grid alignment/resampling | probabilistic forensic inference |
| exact previous JPEG chain | fundamentally unknowable in general |
| PNG previous-JPEG history | not provable from container alone |

## Existing-code caution

`packages/authenticity/src/forensics.ts` already exposes quantization and metadata fields. Its `doubleCompressionIndicator` is a heuristic based on table count, which is not a validated double-JPEG detector and should not be used as a product claim. The new prototype keeps that distinction explicit.

## Next implementation if justified

Add a separately versioned JPEG evidence family only after comparing the inspector against libjpeg-turbo/Pillow/OpenCV on a frozen matrix. Any double-JPEG or resampling classifier must be evaluated with aligned/non-aligned, same/mixed quantization, encoder diversity, and source-family-disjoint controls. Until then, the inspector is eligibility context, not synthetic evidence.
