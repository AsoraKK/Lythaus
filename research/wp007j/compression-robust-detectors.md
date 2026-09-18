# Compression-robust synthetic detection

## Highest-value findings

1. CPTFormer is the most directly relevant current method because it treats phase spectrum as a compression-robust signal and combines phase guidance with a transformer and consistency objective. Its paper is authoritative for the reported regime; code, weights, and deployment rights were not located, so it is a research lead rather than an adoption candidate.
2. Degradation-Consistent Paired Training (DCPT) is the most plausible SAFE-B objective. It uses clean/degraded pairs, feature cosine consistency and symmetric-KL prediction consistency without adding inference parameters according to the paper abstract. It still requires actual JPEG encoder diversity and independent hard-negative confirmation.
3. JPEG-forensic CNN work shows why a quality label alone is insufficient: quality and block-grid alignment are part of the train/test distribution. A future training matrix must freeze tables and encoder, not only `quality=95`.
4. GlobalForge and related real-world benchmarks support global/degradation-aware evidence, but current code/rights/compute are not sufficiently verified for Lythaus.
5. CO-SPY is a useful architectural comparison because it separates semantic and artifact branches. Its MIT code licence does not clear its checkpoints, OpenCLIP foundation, VAE, or benchmark data for deployment.
6. Synthetic-laundering work supports the distinction between pristine positive evidence and degraded/partial evidence. Patch aggregation can be informative, but unusual human hard negatives remain a specific risk.

## Candidate comparison

| Candidate | JPEG rationale | Unseen-generator rationale | Current Lythaus action |
| --- | --- | --- | --- |
| Phase-only measurements / CPTFormer idea | phase may survive amplitude loss | unknown | prototype measurements, then bounded evaluation |
| DCPT objective | explicit clean/degraded consistency | depends on diverse training families | design SAFE-B training only |
| GlobalForge | global cues intended to survive propagation | broad degradation benchmark | audit later if code/rights resolve |
| CO-SPY semantic branch | semantic information may outlast local traces | distinct from SAFE local DWT path | later shadow comparison only |
| Synthetic laundering | patch-level degraded evidence | handles partial/hidden traces | research reference, not deployment dependency |
| Full diffusion inversion (DIRE/FakeInversion) | residual may be different from SAFE | strong conceptual unseen diffusion fit | not CPU-practical for current package |
| New CLIP/VLM detector | may retain semantic signal | likely correlated with RINE/UFD | do not add without unique-rescue evidence |

No source establishes that a method improves Lythaus's WP007I 4/800 hard-negative result. That must be measured independently.

## Recommendation

The best future JPEG experiment is `SAFE-A` frozen versus a separately trained `SAFE-B` with a frozen backbone or tiny head and an actual-encoder paired-consistency objective. Include a deterministic phase/DCT measurement stream as a separate evidence family. Do not overwrite SAFE-A and do not use the future result to reinterpret WP007H/WP007I.
