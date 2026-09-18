# Unseen-generator generalization

## Why current transfer fails

UniversalFakeDetect identifies a common failure mode: a detector trained on a narrow fake domain can make the real class a sink for anything unlike its training generator. SAFE's WP007I Seedream-4 and Imagen-4 misses are a current Lythaus example of the same general risk, even though SAFE is strong on other modern families. Public FLUX.1 and consumed Cloudflare FLUX.1 also show that generator/runtime or postprocessing domain can dominate a raw score.

The literature offers several responses:

- fixed foundation representations (UniversalFakeDetect/CLIP);
- inversion or reconstruction differences (DIRE, FakeInversion);
- spectral or gradient representations (SPAI, LGrad, any-resolution spectral work);
- broad generator diversity (Community Forensics);
- content-aligned or bias-free training (B-Free and related work);
- source-asymmetry and real-distribution modeling;
- semantic/global branches (CO-SPY, VLM methods, GlobalForge).

None of these papers is a license to assume transfer to Seedream-4, Imagen-4, or Cloudflare FLUX.1. Their generator tables, negative composition, JPEG pipeline, and threshold procedures must be compared before reproduction.

## SAFE representation probe

The official SAFE implementation exposes a concrete future probe point: the 512-dimensional vector immediately before `fc1`, after the DWT path, `layer1`, `layer2`, and global average pooling. This can be extracted without changing SAFE-A weights. A descriptive probe should compare real controls, SAFE-easy generators, Seedream-4, Imagen-4, public FLUX.1, and consumed Cloudflare FLUX.1 under family-disjoint roles.

If missed generators cluster separately from real controls, a small frozen-backbone head is plausible. If they collapse into the real manifold, a new specialist or deterministic family is more defensible. Either result is useful; no head should be trained in reconnaissance.

## Future SAFE-B requirements

SAFE-B must preserve SAFE-A as an immutable reference, use only rights-cleared training data, include actual JPEG encoders and table diversity, hold out generator families, and be evaluated against the WP007I 800-negative control. It must improve degraded and missed-generator recall without materially worsening clean and hard-negative FPR. A higher compressed recall alone is not qualification.
