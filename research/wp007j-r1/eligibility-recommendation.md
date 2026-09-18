# Evidence-grade input proposal

## Result

The R1 laboratory does not support a rule such as `JPEG95 accepted` or `all JPEG rejected`. The frozen SAFE-A threshold collapsed on the tested Pillow/libjpeg descendants from the first nominal quality point, including Q100 4:2:0 and Q95 4:4:4. That result is an encoder/table/lineage observation, not a universal quality-factor law.

The defensible first research boundary is therefore:

- preserve and hash the original uploaded bytes before application resizing or recompression;
- inspect current format, dimensions, DQT, SOF sampling and markers;
- use provenance or acquisition lineage when available;
- admit a JPEG as evidence-grade only when its current measurable profile belongs to a separately validated original/native profile;
- treat known recompression, screenshots, severe resampling and unknown internet history as limited or unsupported for certification;
- never infer a clean history from a PNG container;
- never map a low SAFE score to human authorship.

## Measured basis

The primary lab contained 40 synthetic, 40 native-camera JPEG and 20 digital PNG parents. The original parents produced 38/40 SAFE-A synthetic passes and 0/60 negative passes. After actual encoding, the 4:2:0 Pillow/libjpeg descendants produced 0/40 synthetic passes at Q100 and at every tested point from Q97 through Q50; Q99 and Q98 each produced 1/40. At Q95, 4:4:4, 4:2:2 and 4:2:0 all produced 0/40 synthetic passes, while negative FPR was respectively 0/20, 1/20 and 6/20. Sharp/libvips reproduced zero synthetic Q95 detections in both tested subsampling paths and produced 6/20 false positives in the 4:2:0 path.

The JPEG inspector reliably parsed current bytes in this generated matrix. A Pillow/libjpeg cross-check produced zero disagreements across 2,140 rows. A Sharp/libvips metadata disagreement remained for 60 Pillow 4:2:2 observations, showing why encoder/tool identity must be retained in the evidence packet.

JPEG-to-PNG descendants retained the SAFE collapse and produced negative movement. PNG is a container fact, not proof of prior history.

## Authority semantics

For evidence-grade inputs, SAFE-A positive evidence can remain high-authority at its frozen threshold. A low score is only absence of positive SAFE evidence. For limited/unsupported inputs, a low score becomes `INCONCLUSIVE_DUE_TO_INPUT_REGIME`, never `HUMAN_AUTHORED`.

The proposed boundary is a research contract, not a production upload rule. WP007J-R1 changes no routes, labels, enforcement, Safety policy, Judge authority or database schema.

## Remaining unknowns

The current bytes cannot generally prove the complete prior edit chain, prove that a JPEG is the camera's first encode, or prove that a PNG was never JPEG-compressed. A future qualification package should validate native-camera profiles across more devices and add independent double-JPEG/resampling tests before any public certification language is considered.
