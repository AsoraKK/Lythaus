# JPEG forensic landscape

## What JPEG changes

JPEG transforms pixels into 8x8 block DCT coefficients, quantizes those coefficients, and entropy-codes the result. Quantization is lossy and disproportionately removes or perturbs high-frequency amplitude information. Chroma subsampling and resampling change additional spatial evidence. The published phase-spectrum work reports that phase can retain more useful structure than magnitude under its tested compression regime, but that claim is not yet a Lythaus reproduction.

The practical implication for SAFE is narrow: a high SAFE score after JPEG remains positive evidence if the frozen preprocessing accepts the bytes; a low score after JPEG cannot be treated as evidence of a real image. WP007H directly measured this asymmetry.

## What is measurable from final bytes

The WP007J prototype can measure:

- current container and MIME-compatible format;
- dimensions and pixel count when the header is valid;
- JPEG progressive state;
- exact DQT tables as stored, including precision and table identifiers;
- component sampling factors and a conservative 4:4:4 / 4:2:2 / 4:2:0 label;
- marker-level metadata presence and a SHA-256 of the input bytes;
- an estimated standard-table-equivalent quality only when the observed tables closely match a standard IJG-style family.

These are facts about the current file. They do not establish authorship.

## What is inferable only under assumptions

Double-JPEG detection, grid alignment, resampling, and probable previous-JPEG history are statistical forensic hypotheses. They require validated methods, source-family controls, and assumptions about the encoder/table family. The presence of two DQT tables is normal for a colour JPEG and is not double compression. The existing Lythaus `doubleCompressionIndicator` is therefore not an acceptable double-JPEG verdict; the prototype deliberately reports history as unknown.

## What is not recoverable from final bytes alone

The final bytes cannot reliably prove that an image was never compressed, reconstruct the exact full edit history, or prove that a PNG was never previously a JPEG. A PNG may be a lossless container holding pixels that were already altered before PNG encoding. A restoration model would create plausible pixels, not recover discarded coefficients with forensic authority.

## Tool implications

`libjpeg-turbo`, ImageMagick and ExifTool are useful for controlled measurement, but quality numbers are encoder/table mappings rather than universal physical quantities. A future benchmark must freeze exact quantization tables, sampling, encoder family and operation order. Diff-JPEG and Kornia are useful training simulators, not substitutes for validation with actual encoders.

## Eligibility consequence

The defensible first boundary is evidence-grade versus degraded/unknown input, not JPEG versus PNG. A current JPEG with known acquisition and acceptable table/history evidence may be eligible. A PNG with unknown history is not automatically evidence-grade. If the final bytes show destructive or unresolved propagation, SAFE low evidence must become inconclusive rather than human-origin evidence.
