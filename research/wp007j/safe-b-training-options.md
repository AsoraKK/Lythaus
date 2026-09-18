# SAFE-B training options

## Immutable reference

SAFE-A remains the exact WP007H/WP007I checkpoint and threshold. It must never be overwritten, re-exported with altered preprocessing, or silently replaced. Every future result must report SAFE-A clean and degraded references side by side with SAFE-B.

## Ordered options

1. **Frozen SAFE backbone plus linear head.** Lowest parameter and inference risk. First test only if the 512-dimensional probe separates missed families from real controls.
2. **Frozen backbone plus small adapter.** More expressive but higher leakage/overfit risk. Require family-held-out and hard-negative tests.
3. **Upper-layer selective fine-tune.** Only after the first two fail and only with approved CPU/GPU plan; not suitable for this reconnaissance.
4. **Full fine-tune.** Last resort and outside the current hardware/budget boundary.

## Suggested objective

Use real codec pairs: original/degraded, multiple encoders, exact quantization tables, chroma subsampling, resize order, compound JPEG, screenshot-like resampling, and double-compression regimes. Combine classification with feature cosine consistency and symmetric-KL prediction consistency only after confirming the simulator matches actual encoders.

## Qualification gates

SAFE-B must be compared to SAFE-A on clean positives, clean camera negatives, hard digital negatives, all quality/table regimes, and unseen generator families. The candidate must improve the specific JPEG and Seedream/Imagen failure modes without exceeding the predeclared false-positive budget. A model that merely raises scores on JPEG is rejected.

## Feasibility

The SAFE source is a ResNet-50 with a small 5.84 MB checkpoint, but the available clean environment has no Torch, Pillow, or NumPy. A CPU feature-probe runtime could be installed later under a separate bounded protocol. Training is not authorized here. A future linear-head fit may be laptop-feasible; full augmentation training should be estimated before execution and stopped if thermal/RAM constraints are unsafe.
