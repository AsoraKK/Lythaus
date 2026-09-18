# First-product eligibility options

## Proposed internal tiers

### Tier A — evidence-grade

Original bytes are retained, decode is valid, dimensions and encoding are supported, provenance or acquisition context is available where claimed, and no measured degradation signal places the applicable specialist outside its validated regime. This can include some camera-native JPEGs; JPEG is not automatically rejected.

### Tier B — limited evidence

The file is analyzable but shows mild or uncertain recompression, resampling, screenshot, or history ambiguity. Positive SAFE evidence may still be reported when high; low SAFE evidence is explicitly limited or inconclusive. This tier should not silently support a human-authorship claim.

### Tier C — unsupported for certification

The file has destructive or unresolved propagation evidence, severe resampling, unsupported codec behavior, failed decode, or an input history that makes the applied specialist unvalidated. The correct result is insufficient/inconclusive evidence, not AI and not human.

PNG is not automatically Tier A. JPEG is not automatically Tier C. Eligibility is based on measurable input facts, provenance, and the validated detector regime.

## Initial acceptance proposal for a future package

- Preserve and analyze original uploaded bytes before application resizing, thumbnailing, transcoding, or recompression.
- Accept valid PNG/lossless files as preferred only when history is not contradicted by provenance or forensic evidence.
- Accept camera-native JPEG under a tested acquisition route and record exact tables/sampling.
- Allow positive specialist evidence on degraded media only when the positive signal remains high; never interpret a low signal as human.
- Mark unknown-history social downloads, screenshots, severe JPEG chains, and unsupported codecs as limited or unsupported for certification.

## Product friction

The boundary improves claim specificity, lowers false certainty, and makes support/debugging tractable. It also excludes legitimate images whose originals are unavailable. The first release should therefore avoid irreversible rejection: show an evidence limitation or request an original, while keeping Safety policy separate. This is a research recommendation only; WP007J changes no production route or label.
