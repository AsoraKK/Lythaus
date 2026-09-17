# WP007H input-regime applicability

The applicability model is an evidence-quality qualifier, not an authenticity classifier. It never turns compression, missing metadata, resampling, or screenshots into synthetic evidence.

The frozen implementation records measurable format, dimension, metadata, resampling, recompression, and screenshot indicators. `createSafeEvidence` keeps the SAFE raw score immutable, records the applicability reasons, and maps missing/error/low-applicability states to inconclusive evidence where required.

Observed limitation: the current generic profile correctly withdraws authority for heavy recompression and screenshot-like states, but its predeclared `MODERATE` label for JPEG95/JPEG85 was too permissive for the measured collapse. That limitation is preserved rather than repaired post hoc. Until a new validation package freezes a JPEG-specific rule, SAFE high-authority use should be scoped to original/high-quality inputs and only the transformation regimes empirically shown to retain signal.

Relevant contract tests prove:

- invalid, unavailable, and timed-out SAFE results fail closed;
- SAFE raw scores are immutable after compilation;
- low applicability cannot increase synthetic confidence;
- missing EXIF/metadata is not authenticity evidence;
- EF2, Safety, Moondream, Judge, and supporter scores cannot enter the SAFE specialist record.
