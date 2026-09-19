# WP007N primary-paper audit

Audit date: 2026-09-19. Scope: paper evidence for Lythaus; **NO_LYTHAUS_OUTCOMES**. No detector was trained, loaded, or evaluated for this audit.

## Evidence contract and sources

- `AUTHOR_REPORTED`: a configuration, measurement, or claim present in the pinned paper. This label does not mean independently reproduced.
- `DERIVED_FROM_AUTHOR_REPORTED`: explicitly shown arithmetic using the paper's published, rounded numbers; neither a separately reported measurement nor a Lythaus result.
- `AUDIT_FINDING`: a reporting gap, inconsistency, or limitation of what these two sources establish.
- `LYTHAUS_ADAPTATION_NOT_EXECUTED`: an implementation or protocol choice that would need to be recorded separately before execution. No such choice is silently substituted for an absent paper field.
- `NOT_REPORTED`: the requested exact field is absent from the reviewed version. It does not assert that the authors' code, other papers, or another version lack that information. A plotted result without exact numerical labels is identified as such; this audit does not digitize plots.

Only the following primary papers and their arXiv version records were consulted as research sources. Page references below are **one-based PDF pages**, including appendices, not HTML line numbers.

| ID | Pinned primary source | Version evidence and extent |
| --- | --- | --- |
| R | He, Chen, Ho, *RIGID: A Training-Free and Model-Agnostic Framework for Robust AI-Generated Image Detection*. [PDF v1](https://arxiv.org/pdf/2405.20112v1); [HTML v1](https://arxiv.org/html/2405.20112v1) | [arXiv record v1](https://arxiv.org/abs/2405.20112v1): 30 May 2024, 14:49:54 UTC; 16 PDF pages; appendices A-G included. Record lists 6,166 KB. |
| S | Zhou et al., *Simplicity Prevails: The Emergence of Generalizable AIGI Detection in Visual Foundation Models*. [PDF v2](https://arxiv.org/pdf/2602.01738v2); [HTML v2](https://arxiv.org/html/2602.01738v2) | [arXiv record v2](https://arxiv.org/abs/2602.01738v2): 15 April 2026, 07:37:32 UTC; latest listed version at inspection; 9 PDF pages ending in references. Record lists 656 KB. v1 was not read. |

`AUDIT_FINDING`: S's arXiv abstract contains stronger causal wording than its v2 PDF abstract. Experimental interpretation below follows the pinned PDF, especially its explicit causal caveat in section 4, p. 6, and conclusion, pp. 8-9. An arXiv date or the PDF's conference-template text is not independent evidence of acceptance or peer review. [S v2, p. 1](https://arxiv.org/pdf/2602.01738v2#page=1), [p. 6](https://arxiv.org/pdf/2602.01738v2#page=6).

The official loader, implementation, checkpoint, and model-license audit belongs to the main agent and is outside this sidecar. Linked third-party references inside the papers were not followed. No dataset media, model checkpoints, or local paper downloads were created. HTTP HEAD on the two pinned PDF URLs returned Content-Length 6,210,026 bytes (R) and 1,097,672 bytes (S), both below 10 MB; the arXiv submission sizes above are not substituted for PDF sizes. Repository instructions were read. Other agents' files are outside this edit.

## R: exact method and configuration

All populated configuration values in this section are `AUTHOR_REPORTED`; absent fields are `AUDIT_FINDING`.

| Field | Paper evidence / exact absence | Citation |
| --- | --- | --- |
| Backbone | DINOv2 ViT-Large, patch size 14. | [R v1, p. 13, appendix A](https://arxiv.org/pdf/2405.20112v1#page=13) |
| Backbone updates | None; existing architecture and weights retained. | [R v1, p. 4, section 3.1](https://arxiv.org/pdf/2405.20112v1#page=4) |
| Representation | Feature embedding of original image and independently computed embedding of its perturbed counterpart; pairwise cosine similarity. | [R v1, p. 4, equation 1](https://arxiv.org/pdf/2405.20112v1#page=4) |
| Exact output tensor / layer | `NOT_REPORTED`. | [R v1, p. 4, section 3.1](https://arxiv.org/pdf/2405.20112v1#page=4), [p. 13, appendix A](https://arxiv.org/pdf/2405.20112v1#page=13) |
| CLS versus patch averaging; register-token treatment; concatenation | `NOT_REPORTED` for each. The paper's reference to global features is not a pooling specification. | Same sections. |
| Embedding dimension; pre-/post-projection choice; layer normalization | `NOT_REPORTED` for each. | Same sections. |
| Input resolution; resize dimensions; crop policy; interpolation; antialiasing | `NOT_REPORTED` for each. Patch size 14 does not determine input resolution. | Same sections. |
| Decode/color policy; EXIF orientation; alpha handling | `NOT_REPORTED` for each. | Same sections. |
| Pixel range; channel normalization mean/std; noise insertion relative to normalization | `NOT_REPORTED` for each. In particular, 0.05 is not explicitly assigned to a [0,1], [0,255], or standardized tensor range. | Same sections. |
| Noise family and magnitude | Standard normal noise delta ~ N(0,I); perturbation x + lambda*delta; default lambda = 0.05. | [R v1, p. 4, equation 1](https://arxiv.org/pdf/2405.20112v1#page=4), [p. 13, appendix A](https://arxiv.org/pdf/2405.20112v1#page=13) |
| Clipping / quantization after perturbation; channel broadcasting; RNG implementation / seed | `NOT_REPORTED` for each. | Same sections. |
| Noise repetitions / aggregation | Equation 1 defines a comparison for a sampled delta. Exact implemented draws per image, seed reuse, and any finite-sample averaging: `NOT_REPORTED`. Equation 2's expectation is theoretical, not an experimental Monte Carlo count. | [R v1, pp. 4-5, equations 1-2](https://arxiv.org/pdf/2405.20112v1#page=4) |
| Decision rule | AI-generated indicator = 1 when cosine(f(x), f(x + lambda*delta)) <= epsilon; lower similarity is the generated direction. Equality is included in the equation. | [R v1, p. 4, equation 1](https://arxiv.org/pdf/2405.20112v1#page=4) |
| Classifier training / training split | No fitted classifier or detector-training dataset; threshold uses genuine images. Backbone pretraining is a separate exposure question. | [R v1, p. 4, section 3.1](https://arxiv.org/pdf/2405.20112v1#page=4) |
| Threshold selection principle | Select epsilon to correctly classify most real images; 95% is an example. Generated images are not needed for this selection. | Same section. |
| Numerical epsilon; calibration dataset/count; quantile estimator; calibration/test disjointness | `NOT_REPORTED` for each. The example 95% is not a published epsilon or a demonstrated held-out operating point. | Same section; [R v1, p. 5, evaluation metrics](https://arxiv.org/pdf/2405.20112v1#page=5). |
| Hardware | NVIDIA GeForce RTX 3090, 24 GB memory (paper notation: 24G). | [R v1, p. 13, appendix A](https://arxiv.org/pdf/2405.20112v1#page=13) |
| Inference batch size; dtype; runtime; peak measured memory; repeat count; uncertainty intervals | `NOT_REPORTED` for each. Hardware capacity is not measured memory consumption. | Same appendix and [R v1, p. 6, tables 1-2](https://arxiv.org/pdf/2405.20112v1#page=6). |

`AUDIT_FINDING`: numerical reproducibility depends on resolving the input scale, noise placement, embedding selection, and threshold calibration. Neither using CLS tokens nor converting lambda to a particular pixel scale can be called a paper-exact reproduction from R alone.

### R datasets, split evidence, and primary numerical results

`AUTHOR_REPORTED`: detector evaluation uses generated ImageNet and LSUN-Bedroom collections, plus four GenImage platforms. Section 4.1 and appendix C describe 100,000 generated images per generator/dataset and equal class representation (100 images per ImageNet class). Appendix C.1 separately specifies 50,000-image public sets for ADM, ADMG, and BigGAN. Appendix C.2 says three 50,000-image sets but lists four models: ADM, DDPM, iDDPM, and StyleGAN. GigaGAN's 100,000 images were privately provided by its authors. [R v1, p. 5, section 4.1](https://arxiv.org/pdf/2405.20112v1#page=5), [p. 13, appendix C](https://arxiv.org/pdf/2405.20112v1#page=13).

`AUDIT_FINDING`: the paper does not reconcile those cardinalities. Exact evaluated subset counts, genuine-image counts, genuine source splits, sample IDs, train/validation/test manifests, calibration membership, and duplicate/overlap checks are each `NOT_REPORTED`. Do not silently turn the general 100,000 statement into a verified per-row test denominator.

The following are `AUTHOR_REPORTED` RIGID results, in percent. FID is the reported **generator-quality** statistic, not a detector metric or genuine-error rate. [R v1, p. 6, tables 1-2](https://arxiv.org/pdf/2405.20112v1#page=6); FIDs: [p. 13, C.1-C.2](https://arxiv.org/pdf/2405.20112v1#page=13), [p. 14, C.2 continuation](https://arxiv.org/pdf/2405.20112v1#page=14).

| Evaluation collection | Generator | AUC % | AP % | FID |
| --- | --- | ---: | ---: | ---: |
| ImageNet | ADM | 87.75 | 86.06 | 11.84 |
| ImageNet | ADMG | 83.50 | 81.46 | 5.58 |
| ImageNet | LDM | 81.50 | 80.23 | 4.29 |
| ImageNet | DiT / DiT-XL-2 | 72.07 | 69.55 | 2.80 |
| ImageNet | BigGAN | 93.86 | 93.57 | 7.94 |
| ImageNet | GigaGAN | 89.29 | 87.92 | 4.16 |
| ImageNet | StyleGAN-XL | 85.94 | 84.75 | 2.91 |
| ImageNet | RQ-Transformer | 93.39 | 93.11 | 9.71 |
| ImageNet | MaskGIT | 92.65 | 91.91 | 5.63 |
| ImageNet | Published average | 86.67 | 85.40 | Not applicable |
| LSUN-Bedroom | ADM | 74.04 | 72.92 | 2.20 |
| LSUN-Bedroom | DDPM | 89.30 | 89.76 | 5.18 |
| LSUN-Bedroom | iDDPM | 85.61 | 86.07 | 4.54 |
| LSUN-Bedroom | Diffusion Projected GAN | 93.86 | 94.49 | 1.79 |
| LSUN-Bedroom | Projected GAN | 94.41 | 94.81 | 2.23 |
| LSUN-Bedroom | StyleGAN | 84.12 | 81.53 | 2.65 |
| LSUN-Bedroom | Unleashing Transformer | 92.49 | 92.63 | 3.58 |
| LSUN-Bedroom | Published average | 87.69 | 87.47 | Not applicable |

`AUTHOR_REPORTED` comparator context: AEROBLADE averages are 59.32/59.33 AUC/AP on ImageNet and 59.46/58.98 on LSUN-Bedroom. Wang averages are 67.60/68.43 and 85.81/85.88. RIGID is not best on every generator: AEROBLADE has 72.98/73.65 on ImageNet DiT; Wang has 98.47/98.34 on LSUN StyleGAN. [R v1, p. 6, tables 1-2](https://arxiv.org/pdf/2405.20112v1#page=6).

`DERIVED_FROM_AUTHOR_REPORTED`: the RIGID-minus-AEROBLADE AP differences are 26.07 and 28.49 **percentage points**, respectively. They are not relative percentage improvements and do not measure false positives.

| Additional evaluation | Exact evidence and reporting limit |
| --- | --- |
| GenImage platforms | Wukong, SD 1.4, SD 1.5, Midjourney; AP shown in figure 2. Exact platform AP numbers: `NOT_REPORTED` as numerical labels/table entries. Section 4.2.2 describes approximately 10% higher average performance than AEROBLADE, without resolving relative percent versus percentage points. [R v1, pp. 6-7, figure 2](https://arxiv.org/pdf/2405.20112v1#page=7). |
| GenImage prompt construction | ImageNet class names inserted into the template "photo of class"; Chinese translation used for Wukong. Exact generation settings and evaluation counts: `NOT_REPORTED`. [R v1, p. 14, C.3](https://arxiv.org/pdf/2405.20112v1#page=14). |
| Cross-domain evaluation | ImageNet genuine versus LSUN-Bedroom generated, and the reverse. Figure 3 shows AP distributions; exact underlying series/medians: `NOT_REPORTED` numerically. This is an evaluation-domain swap, not training of RIGID. [R v1, p. 7, section 4.2.3 / figure 3](https://arxiv.org/pdf/2405.20112v1#page=7). |
| Format-bias control | Appendix D describes converting genuine and generated images to JPEG for the DIRE baseline. JPEG quality/subsampling: `NOT_REPORTED`. Scope must not be silently extended to every RIGID test. [R v1, p. 15, appendix D](https://arxiv.org/pdf/2405.20112v1#page=15). |

### R genuine errors, perturbations, and limits

`AUDIT_FINDING`: measured genuine FPR, genuine error counts, specificity at a published epsilon, TPR at fixed FPR, and confidence intervals are each `NOT_REPORTED`. AUC/AP cannot supply them. `DERIVED_FROM_AUTHOR_REPORTED`: the illustrative 95% genuine acceptance target has an arithmetic complement of 5%; that is a **target complement**, not an observed error rate. [R v1, p. 4, threshold paragraph](https://arxiv.org/pdf/2405.20112v1#page=4), [p. 5, metrics](https://arxiv.org/pdf/2405.20112v1#page=5).

| Transform / ablation | AUTHOR_REPORTED settings | Exact absent fields / limitation |
| --- | --- | --- |
| Detection probe | Gaussian noise, lambda 0.05. | Tensor units, clipping, seed and placement: `NOT_REPORTED`. This is part of the detector, distinct from input corruption. |
| Corrupted-input Gaussian noise | Lambda = 0.05, 0.10, 0.15, 0.20, 0.25. | Units, clipping, seed, and exact per-point AP: `NOT_REPORTED` numerically. |
| JPEG corruption | Quality = 90, 80, 70, 60, 50. | Codec/library, subsampling, transform ordering and exact per-point AP: `NOT_REPORTED`. |
| Gaussian blur | Sigma = 1, 2, 3, 4, 5. | Kernel size, border handling, library and exact per-point AP: `NOT_REPORTED`. |
| Corruption test generators | ADM, LDM, BigGAN, StyleGAN; metric AP. | Per-class genuine error under each corruption: `NOT_REPORTED`. |
| Detector-noise intensity sweep | Figure 5 displays lambda through 0.5. Text states approximately 50% AP at lambda 0; describes AP >=80% for a moderate range stated as 0 to 0.17. | Exact sampled lambda sequence and AP series: `NOT_REPORTED` numerically. The inclusion of zero conflicts with the same paragraph's chance-level zero-noise statement. |
| Alternative probe distributions | Laplace, Gamma, Chi-square, Gaussian; intensity fixed at 0.05. | Distribution shape/scale/centering parameters beyond that intensity: `NOT_REPORTED`. |
| Backbone ablation | ResNet50, CLIP, SAM, DINOv2 in figure 7. | Exact numerical per-backbone AP series, variant sizes except main DINOv2, and harmonized input/pooling rules: `NOT_REPORTED`. |

Sources for the transform table: [R v1, p. 7, section 4.3](https://arxiv.org/pdf/2405.20112v1#page=7), [p. 8, figures 4-5 / section 4.4](https://arxiv.org/pdf/2405.20112v1#page=8), [p. 9, figure 7](https://arxiv.org/pdf/2405.20112v1#page=9), [p. 16, appendices F-G / table 3](https://arxiv.org/pdf/2405.20112v1#page=16).

`AUTHOR_REPORTED` noise-family AP averages: Laplace 84.55%, Gamma 85.28%, Chi-square 84.88%, Gaussian 85.40%. On the harder DiT column these are 67.91%, 71.82%, 68.09%, and 69.55%, respectively. This is not proof of invariance to arbitrary perturbation implementations. [R v1, p. 16, table 3](https://arxiv.org/pdf/2405.20112v1#page=16).

`AUTHOR_REPORTED` limits: reliance on pretrained representations can inherit their biases; high-quality generated images, including DiT-XL2, remain difficult. [R v1, p. 9, section 5](https://arxiv.org/pdf/2405.20112v1#page=9). `AUDIT_FINDING`: the inspected results supply no operational genuine-error bound, no quantified local-edit detector, no recapture/transmission acceptance test, and no Lythaus evaluation.

### R pretraining exposure

`AUTHOR_REPORTED`: section 3.1 describes DINOv2 as self-supervised and trained without generated images. The paper does not provide a pretraining membership audit. Exact corpus name/size, collection dates/cutoff, synthetic-content fraction, duplicate overlap with its detector evaluation sets, and per-generator exposure are each `NOT_REPORTED`. The statement is an author characterization, not independently established absence of synthetic contamination. [R v1, p. 4, generation-independence paragraph](https://arxiv.org/pdf/2405.20112v1#page=4), [p. 13, appendix A](https://arxiv.org/pdf/2405.20112v1#page=13).

## S: exact method, representation, and training

All populated configuration values in this section are `AUTHOR_REPORTED`; absent fields are `AUDIT_FINDING`. Primary source: [S v2, p. 3, section 3.1](https://arxiv.org/pdf/2602.01738v2#page=3), [p. 4, implementation continuation](https://arxiv.org/pdf/2602.01738v2#page=4).

| Field | Paper evidence / exact absence |
| --- | --- |
| Detector | Frozen vision backbone plus a trained linear layer on pooled output features. This is supervised linear probing, not a training-free detector. |
| Reported baseline families | MetaCLIP, MetaCLIP2, SigLIP, SigLIP2, PE-CLIP, DINOv2, DINOv3. Original CLIP additionally appears in the semantic probe. |
| PE architecture / input | ViT-L/14; 336px native resolution. |
| Main MetaCLIP2 architecture / resolution | `NOT_REPORTED` for both exact values in the inspected v2. |
| Main DINOv3 architecture / resolution | `NOT_REPORTED` for an unambiguous main-results specification. Section 4.2 explicitly uses ViT-7B for the web-versus-satellite counterfactual; it does not explicitly map every main-results row to that exact variant. [S v2, p. 6, section 4.2](https://arxiv.org/pdf/2602.01738v2#page=6). |
| Main SigLIP2 architecture / resolution; legacy variant specifications | `NOT_REPORTED` for exact values. |
| Referred architecture appendix | Sections 2 and 3.1 refer to an appendix. No appendix occurs in the inspected nine-page v2 PDF or its HTML; the document ends with references. [S v2, pp. 2-3](https://arxiv.org/pdf/2602.01738v2#page=2), [p. 9](https://arxiv.org/pdf/2602.01738v2#page=9). |
| Feature location | Pooled output features; exact layer, output key, projection stage, intermediate-feature selection, embedding width: `NOT_REPORTED` for each. |
| Pooling | Global pooling discussed in section 5.3. Exact CLS / patch-mean / attention-pooling operator and register-token treatment: `NOT_REPORTED` for each. [S v2, p. 8, section 5.3](https://arxiv.org/pdf/2602.01738v2#page=8). |
| Input geometry | Resize then center crop to each model's native resolution. Resize short-side/long-side rule, intermediate dimensions, interpolation, antialiasing: `NOT_REPORTED` for each. |
| Input numerics | Pixel scaling/range, normalization mean/std, dtype, RGB conversion, orientation handling, alpha handling: `NOT_REPORTED` for each. |
| Augmentation | No additional data augmentation in the reported baseline training. |
| Detector training data | GenImage SD v1.4 training subset only. Exact genuine/fake counts, genuine-source allocation, class balancing/sampling, subset hashes and sample IDs: `NOT_REPORTED` for each. |
| Train/test boundary | SD v1.4 for training; remaining GenImage generator subsets for cross-generator evaluation. Table 1 also reports SD v1.4 itself, so the published eight-column average is not an unseen-generator-only average. |
| Validation / selection | Validation split/count, validation objective, early stopping, selected epoch, checkpoint selection rule: `NOT_REPORTED` for each. |
| Optimizer | AdamW; learning rate 0.001; batch size 128; 2 epochs. |
| Additional optimization details | Weight decay, betas, epsilon, learning-rate schedule, warmup, loss function, loss reduction, class weights, head initialization, seeds and repeat count: `NOT_REPORTED` for each. No BCE, softmax or logistic-regression solver is inferred. |
| Classifier head details | Linear layer. Bias, output width, activation/probability mapping, label encoding: `NOT_REPORTED` for each. |
| Decision rule / threshold | Numerical threshold, score direction, tie behavior, calibration method, calibration dataset/count and held-out genuine-FPR target: `NOT_REPORTED` for each. In particular, 0.5 is not established by this paper. |
| Compute | Training hardware, measured runtime, inference latency, peak memory and batch size: `NOT_REPORTED` for each. |
| Uncertainty | Error counts, confidence intervals, run-to-run variation and statistical significance tests: `NOT_REPORTED` for each. |
| Comparator training exception | DDA uses its authors' pretrained weights and specialized VAE-data alignment. Section 3.1 says other methods train on GenImage SD v1.4; table 1's blanket all-detectors caption does not erase this exception. |

`AUDIT_FINDING`: a frozen backbone still has a learned detection head and a pretraining history. A change to a smaller DINOv3, different pooling, input resolution, logistic solver, calibration target, or training dataset would be `LYTHAUS_ADAPTATION_NOT_EXECUTED` until separately specified and tested; the tables below do not validate it.

### S evaluation datasets and split boundaries

| Evaluation | AUTHOR_REPORTED content / protocol | Exact absent fields |
| --- | --- | --- |
| GenImage | Eight columns: ADM, BigGAN, Midjourney, VQDM, GLIDE, SD-v1.4, SD-v1.5, Wukong. Average of real/fake class accuracies. | Evaluated per-class counts, split manifests, genuine source identities, duplicate controls: `NOT_REPORTED`. |
| In-the-wild | Chameleon, WildRF, SocialRF, CommunityAI; real and fake accuracy separately plus averages. | Exact real/fake counts, dataset version identifiers and sample manifests: `NOT_REPORTED`. |
| AIGIHolmes | FLUX, Infinity, Janus, Janus-Pro-1B, Janus-Pro-7B, LlamaGen, PixArt-XL, SD3.5-L, Show-o, VAR. Real/fake class-averaged accuracy. | Per-class counts, collection cutoffs, real-class accuracy by generator, manifests: `NOT_REPORTED`. |
| AIGI-Now | Nine generator groups: FLUX-dev, FLUX-kera, FLUX-kontext, FLUX-pro, gpt4o, jimeng, keling, minimax, Nano; each has pix/sem conditions. pix aligns formats; sem uses strong degradations to reduce low-level traces. | Exact pix encoding settings, sem transform sequence/parameters, per-class counts and real-class rates: `NOT_REPORTED`. Names preserve table 4, including FLUX-kera. |
| Semantic probe | Midjourney-CC: 3,000 images from r/midjourney, late 2025; used with in-the-wild datasets for text/image comparisons, not baseline linear-head training. | Exact date window, IDs, full text-pool inventory, aggregation and leakage-audit method: `NOT_REPORTED`. |
| RRDataset | Original digital images; Redigital screen/print recapture; Transfer via social apps. Separate real and AI class accuracy. | Exact subsets/counts, displays/printers/cameras, app/codec settings and transmission steps: `NOT_REPORTED`. |
| DDA-COCO / BR-Gen | Reconstructed real images via VAEs / diffusion local editing, respectively. | Exact split/counts, local-mask fraction, untouched-real comparison rates and full transform settings: `NOT_REPORTED`. |

Sources: [S v2, pp. 3-4, sections 3.1-3.4 / tables 1-2](https://arxiv.org/pdf/2602.01738v2#page=3), [p. 5, tables 3-4](https://arxiv.org/pdf/2602.01738v2#page=5), [p. 6, section 4.1](https://arxiv.org/pdf/2602.01738v2#page=6), [pp. 7-8, sections 5.2-5.3 / tables 7-8](https://arxiv.org/pdf/2602.01738v2#page=7).

### S reported baseline results

Numbers in this subsection are `AUTHOR_REPORTED`, on the paper's 0-1 accuracy scale, unless explicitly marked derived. Published averages are retained even where arithmetic or prose differs. These are not AUC/AP and cannot be compared directly with R's ranking metrics.

| Frozen-feature linear baseline | GenImage average, table 1 | In-the-wild average, table 2 | AIGIHolmes average, table 3 | AIGI-Now average, table 4 |
| --- | ---: | ---: | ---: | ---: |
| MetaCLIP | 0.766 | 0.654 | 0.896 | 0.892 |
| MetaCLIP2 | 0.892 | 0.842 | 0.942 | 0.907 |
| SigLIP | 0.851 | 0.610 | 0.889 | 0.852 |
| SigLIP2 | 0.945 | 0.822 | 0.973 | 0.843 |
| PE-CLIP | 0.938 | 0.899 | 0.978 | 0.891 |
| DINOv2 | 0.852 | 0.636 | `NOT_REPORTED` | `NOT_REPORTED` |
| DINOv3 | 0.964 | 0.940 | 0.972 | 0.864 |

Sources: [S v2, p. 3, table 1](https://arxiv.org/pdf/2602.01738v2#page=3), [p. 4, table 2](https://arxiv.org/pdf/2602.01738v2#page=4), [p. 5, tables 3-4](https://arxiv.org/pdf/2602.01738v2#page=5). DINOv2 is absent from tables 3-4; absence is not zero performance.

Per-generator details for the four modern backbones, transposed from [S v2, p. 3, table 1](https://arxiv.org/pdf/2602.01738v2#page=3):

| GenImage generator | MetaCLIP2 | SigLIP2 | PE-CLIP | DINOv3 |
| --- | ---: | ---: | ---: | ---: |
| ADM | 0.690 | 0.870 | 0.712 | 0.849 |
| BigGAN | 0.816 | 0.924 | 0.963 | 0.991 |
| Midjourney | 0.959 | 0.879 | 0.901 | 0.934 |
| VQDM | 0.819 | 0.954 | 0.959 | 0.992 |
| GLIDE | 0.887 | 0.951 | 0.972 | 0.963 |
| SD-v1.4 | 0.993 | 0.995 | 0.999 | 0.998 |
| SD-v1.5 | 0.991 | 0.995 | 0.999 | 0.996 |
| Wukong | 0.980 | 0.994 | 0.999 | 0.994 |

Per-generator AIGIHolmes details, transposed from [S v2, p. 5, table 3](https://arxiv.org/pdf/2602.01738v2#page=5):

| AIGIHolmes generator | MetaCLIP2 | SigLIP2 | PE-CLIP | DINOv3 |
| --- | ---: | ---: | ---: | ---: |
| FLUX | 0.987 | 0.957 | 0.968 | 0.933 |
| Infinity | 0.990 | 0.994 | 0.999 | 0.998 |
| Janus | 0.839 | 0.990 | 0.945 | 0.996 |
| Janus-Pro-1B | 0.959 | 0.993 | 0.995 | 0.995 |
| Janus-Pro-7B | 0.928 | 0.989 | 0.996 | 0.986 |
| LlamaGen | 0.989 | 0.991 | 1.000 | 0.999 |
| PixArt-XL | 0.986 | 0.994 | 1.000 | 0.999 |
| SD3.5-L | 0.956 | 0.914 | 0.943 | 0.891 |
| Show-o | 0.985 | 0.992 | 0.999 | 0.997 |
| VAR | 0.802 | 0.913 | 0.935 | 0.922 |

AIGI-Now values are **pix / sem class-averaged accuracy**, not genuine/fake accuracy pairs. Transposed from [S v2, p. 5, table 4](https://arxiv.org/pdf/2602.01738v2#page=5):

| AIGI-Now generator | MetaCLIP2 | SigLIP2 | PE-CLIP | DINOv3 |
| --- | --- | --- | --- | --- |
| FLUX-dev | 0.979 / 0.941 | 0.947 / 0.882 | 0.977 / 0.959 | 0.944 / 0.962 |
| FLUX-kera | 0.963 / 0.896 | 0.883 / 0.697 | 0.918 / 0.762 | 0.846 / 0.811 |
| FLUX-kontext | 0.799 / 0.811 | 0.776 / 0.678 | 0.830 / 0.774 | 0.730 / 0.756 |
| FLUX-pro | 0.976 / 0.892 | 0.888 / 0.885 | 0.873 / 0.943 | 0.813 / 0.948 |
| gpt4o | 0.943 / 0.888 | 0.936 / 0.790 | 0.863 / 0.924 | 0.898 / 0.960 |
| jimeng | 0.965 / 0.825 | 0.831 / 0.845 | 0.915 / 0.921 | 0.824 / 0.940 |
| keling | 0.970 / 0.902 | 0.941 / 0.867 | 0.939 / 0.916 | 0.884 / 0.913 |
| minimax | 0.942 / 0.850 | 0.850 / 0.688 | 0.865 / 0.748 | 0.727 / 0.784 |
| Nano | 0.965 / 0.819 | 0.895 / 0.882 | 0.971 / 0.936 | 0.898 / 0.922 |

Comparator context, `AUTHOR_REPORTED`: OMAT's GenImage average is 0.946; DDA's in-the-wild average is 0.850; DDA/AIDE AIGIHolmes averages are 0.963/0.970; DDA's AIGI-Now average is 0.695. A strong modern-backbone average does not mean every modern backbone wins every dataset. Sources: the same four tables.

### S numerical genuine errors

The paper reports **real-class accuracy**, interpreted here as the fraction of genuine samples classified correctly. For binary genuine/generated decisions, `DERIVED_FROM_AUTHOR_REPORTED` genuine error / FPR = 100 * (1 - real accuracy), in percent. The complement is computed from rounded published inputs. Thresholds, raw error counts, denominators, confidence bounds and a low-FPR operating curve are `NOT_REPORTED`; no more precise population error estimate is justified.

First, the underlying `AUTHOR_REPORTED` **real / fake accuracy** pairs for all frozen-feature baselines, from [S v2, p. 4, table 2](https://arxiv.org/pdf/2602.01738v2#page=4):

| Linear baseline | Chameleon | WildRF | SocialRF | CommunityAI |
| --- | --- | --- | --- | --- |
| MetaCLIP | 0.373 / 0.914 | 0.461 / 0.923 | 0.409 / 0.866 | 0.353 / 0.933 |
| MetaCLIP2 | 0.948 / 0.913 | 0.478 / 0.979 | 0.659 / 0.940 | 0.926 / 0.954 |
| SigLIP | 0.480 / 0.732 | 0.383 / 0.897 | 0.549 / 0.613 | 0.370 / 0.857 |
| SigLIP2 | 0.884 / 0.833 | 0.597 / 0.984 | 0.744 / 0.866 | 0.826 / 0.905 |
| PE-CLIP | 0.970 / 0.948 | 0.679 / 0.994 | 0.751 / 0.970 | 0.966 / 0.975 |
| DINOv2 | 0.628 / 0.580 | 0.643 / 0.772 | 0.603 / 0.695 | 0.606 / 0.562 |
| DINOv3 | 0.933 / 0.895 | 0.948 / 0.975 | 0.937 / 0.948 | 0.949 / 0.946 |

Then the explicitly **derived genuine errors**, in percent, from those real-class columns:

| Linear baseline | Chameleon FPR % | WildRF FPR % | SocialRF FPR % | CommunityAI FPR % |
| --- | ---: | ---: | ---: | ---: |
| MetaCLIP | 62.7 | 53.9 | 59.1 | 64.7 |
| MetaCLIP2 | 5.2 | 52.2 | 34.1 | 7.4 |
| SigLIP | 52.0 | 61.7 | 45.1 | 63.0 |
| SigLIP2 | 11.6 | 40.3 | 25.6 | 17.4 |
| PE-CLIP | 3.0 | 32.1 | 24.9 | 3.4 |
| DINOv2 | 37.2 | 35.7 | 39.7 | 39.4 |
| DINOv3 | 6.7 | 5.2 | 6.3 | 5.1 |

`AUDIT_FINDING`: DINOv3's published 0.940 overall accuracy therefore does not establish a sub-1% genuine FPR. MetaCLIP2's strong fake accuracy on WildRF coexists with a derived 52.2% genuine error. These are paper-dataset observations at unspecified thresholds, not Lythaus outcomes. Source and derivation: table 2 above.

### S transforms, adverse conditions, and limitations

| Test | AUTHOR_REPORTED configuration | Exact reporting gap |
| --- | --- | --- |
| Common JPEG perturbation | Quality set written as {95, ..., 65}; GenImage and Chameleon; figure 2 plots accuracy. | Intermediate values/step are not enumerated in the text; codec, subsampling, ordering and exact numerical trajectories: `NOT_REPORTED`. |
| Common Gaussian blur | Sigma set written as {0.5, ..., 2.0}; same two benchmarks. | Intermediate values/step, kernel size, border policy and exact numerical trajectories: `NOT_REPORTED` in text/table. |
| PE blur example | Section 5.1 reports 77.8% accuracy at sigma 2.0. | The sentence does not explicitly identify which of the two dataset panels supplies that number; retain that ambiguity. Per-class genuine error at that point: `NOT_REPORTED`. |
| Recapture / transfer | RRDataset original, Redigital, Transfer; table 7 separates real/AI accuracy. | Physical capture parameters and app transmission settings: `NOT_REPORTED`. |
| Reconstruction | DDA-COCO columns SDXL, SD2, SD3.5L. | Exact VAE revisions, stochastic encode/decode settings, untouched-real control accuracy: `NOT_REPORTED`. |
| Local editing | BR-Gen columns Brush, Power, SDXL. | Exact model revisions, masks, edit area, prompts, transform pipeline and untouched-real accuracy: `NOT_REPORTED`. |
| Video claim | Section 5.1 mentions VidProM and GenVideo using frame aggregation. | Numerical results, frame selection/count, aggregation operator, split protocol and thresholds: `NOT_REPORTED` in this v2. No video-performance conclusion is supported by an inspectable result table here. |

Source: [S v2, p. 7, sections 5.1-5.3 / figure 2 / table 7](https://arxiv.org/pdf/2602.01738v2#page=7), [p. 8, table 8](https://arxiv.org/pdf/2602.01738v2#page=8). No graph digitization was used to invent exact transform results.

RRDataset `AUTHOR_REPORTED` **real / AI accuracy** pairs, from [S v2, p. 7, table 7](https://arxiv.org/pdf/2602.01738v2#page=7):

| Linear baseline | Original | Redigital | Transfer |
| --- | --- | --- | --- |
| SigLIP2 | 0.8714 / 0.931 | 0.885 / 0.559 | 0.490 / 0.704 |
| MetaCLIP2 | 0.784 / 0.939 | 0.791 / 0.719 | 0.930 / 0.713 |
| PE-CLIP | 0.925 / 0.949 | 0.913 / 0.548 | 0.989 / 0.685 |
| DINOv3 | 0.951 / 0.930 | 0.964 / 0.647 | 0.980 / 0.712 |

RRDataset `DERIVED_FROM_AUTHOR_REPORTED` genuine errors, 100 * (1 - real accuracy):

| Linear baseline | Original FPR % | Redigital FPR % | Transfer FPR % |
| --- | ---: | ---: | ---: |
| SigLIP2 | 12.86 | 11.5 | 51.0 |
| MetaCLIP2 | 21.6 | 20.9 | 7.0 |
| PE-CLIP | 7.5 | 8.7 | 1.1 |
| DINOv3 | 4.9 | 3.6 | 2.0 |

`DERIVED_FROM_AUTHOR_REPORTED`: DINOv3's recaptured AI miss rate is 100 * (1 - 0.647) = 35.3%; its transmitted AI miss rate is 28.8%. These are **fake misses**, not genuine errors. An improved genuine acceptance rate under degradation does not imply improved detection of generated images. Source: table 7 above.

Reconstruction/editing `AUTHOR_REPORTED` detection accuracies, from [S v2, p. 8, table 8](https://arxiv.org/pdf/2602.01738v2#page=8):

| Detector | Reconstructed: SDXL | SD2 | SD3.5L | Edited: Brush | Power | SDXL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| SigLIP2-Linear | 0.071 | 0.079 | 0.017 | 0.597 | 0.623 | 0.476 |
| MetaCLIP2-Linear | 0.057 | 0.074 | 0.037 | 0.544 | 0.575 | 0.500 |
| PE-CLIP-Linear | 0.066 | 0.170 | 0.024 | 0.564 | 0.581 | 0.528 |
| DINOv3-Linear | 0.030 | 0.079 | 0.004 | 0.592 | 0.613 | 0.450 |
| DDA comparator | 0.949 | 0.997 | 0.682 | 0.648 | 0.589 | 0.465 |
| Effort comparator | 0.511 | 0.549 | 0.682 | 0.801 | 0.793 | 0.767 |

`AUDIT_FINDING`: table 8 concerns reconstructed/edited targets, including images originating from real photographs. These columns must not be reclassified as ordinary untouched-genuine FPRs or directly substituted for balanced real/fake accuracy. Separate genuine controls and denominators are `NOT_REPORTED` here. `AUTHOR_REPORTED` interpretation: section 5.3 attributes local-edit weakness to pooled global features being dominated by unedited regions; the causal pooling explanation is an interpretation, not a controlled pooling ablation. [S v2, p. 8, section 5.3](https://arxiv.org/pdf/2602.01738v2#page=8).

### S reported adaptation experiments, not implementation authorization

`AUTHOR_REPORTED`: the paper tests specialized architectures with changed backbones and LoRA ranks 4/8 on GenImage SD v1.4. These are author experiments, distinct from any proposed Lythaus adaptation. Exact LoRA target modules, scaling alpha, dropout, optimizer settings specific to those runs, and full architecture-replacement protocol are each `NOT_REPORTED`. [S v2, p. 8, sections 5.4-5.5](https://arxiv.org/pdf/2602.01738v2#page=8).

Selected table 9 measurements (GenImage / Chameleon / AIGIHolmes):

| Author configuration | Accuracy triplet |
| --- | --- |
| AIDE original | 0.768 / 0.574 / 0.970 |
| AIDE + PE | 0.883 / 0.914 / 0.947 |
| DDA original | 0.890 / 0.824 / 0.963 |
| DDA + DINOv3 | 0.572 / 0.751 / 0.713 |
| PE frozen linear | 0.938 / 0.959 / 0.978 |
| DINOv3 frozen linear | 0.964 / 0.914 / 0.972 |

All table 10 modern-backbone LoRA comparisons (same dataset order):

| Backbone | Frozen linear | LoRA rank 4 | LoRA rank 8 |
| --- | --- | --- | --- |
| MetaCLIP2 | 0.892 / 0.930 / 0.942 | 0.734 / 0.817 / 0.823 | 0.780 / 0.880 / 0.896 |
| PE | 0.938 / 0.959 / 0.978 | 0.810 / 0.719 / 0.879 | 0.761 / 0.635 / 0.891 |
| DINOv3 | 0.964 / 0.914 / 0.972 | 0.954 / 0.803 / 0.977 | 0.928 / 0.718 / 0.945 |

Source: [S v2, p. 8, tables 9-10](https://arxiv.org/pdf/2602.01738v2#page=8). `AUDIT_FINDING`: all listed LoRA settings degrade Chameleon accuracy, but DINOv3 rank 4 improves the displayed AIGIHolmes number from 0.972 to 0.977. The paper does not establish that every adaptation harms every dataset, nor that these differences are statistically significant.

### S pretraining exposure: claims, evidence, and missing membership proof

| Evidence | AUTHOR_REPORTED observation | AUDIT_FINDING / exact absence |
| --- | --- | --- |
| Web-content prevalence | Figure 1 tracks Common Crawl indexed URLs for Civitai/Liblib across 2022-2025; text describes growth from 2023. | Indexed URL growth is not a checkpoint's training manifest. Actual image counts ingested by each encoder, ingestion dates, deduplication and synthetic fraction: `NOT_REPORTED`. [S v2, pp. 1-2, figure 1](https://arxiv.org/pdf/2602.01738v2#page=1). |
| VLM semantic hypothesis | Generated images co-occurring with source/forgery captions may acquire semantic alignment with those concepts. | Exact encoder-training membership and causal isolation: `NOT_REPORTED`. Section 4 explicitly acknowledges indirect analyses rather than definitive causal proof. [S v2, p. 6, sections 4-4.1](https://arxiv.org/pdf/2602.01738v2#page=6). |
| SigLIP2 | Section 4.1 attributes its semantic-probe behavior to WebLI curated in 2022. | Exact corpus subset/size/cutoff for the tested checkpoint and overlap audit: `NOT_REPORTED`. This is not a reason to invent a numerical synthetic-content percentage. Same section. |
| MetaCLIP2 / PE | Described as trained on recent web data and associating generated images with forgery/source concepts. | Exact corpus names, counts, date cutoffs, generator membership and provenance exclusions: `NOT_REPORTED` in this v2. Same section and [p. 3, absent appendix reference](https://arxiv.org/pdf/2602.01738v2#page=3). |
| DINOv3 counterfactual | Identical ViT-7B architecture; Web = LVD-1689M, described as 1.6 billion internet images; Sat = Sat-493M, 493 million satellite images. The authors characterize Web as containing generated content and Sat as devoid of it. | Actual synthetic counts, image-level membership/overlap and matched training conditions beyond architecture/data source: `NOT_REPORTED`. Different domains and corpus sizes prevent treating this as an isolated synthetic-exposure intervention. [S v2, p. 6, section 4.2](https://arxiv.org/pdf/2602.01738v2#page=6). |
| Recent-generator evaluation | AIGIHolmes/AIGI-Now presented as unseen-generation tests; section 3.4 describes closed-source APIs as unseen during VFM pretraining. | Per-checkpoint cutoff and verified absence of the evaluated generator outputs: `NOT_REPORTED`. The paper's assertion is not a membership certificate. [S v2, pp. 4-5, section 3.4](https://arxiv.org/pdf/2602.01738v2#page=4). |
| Midjourney-CC | 3,000 late-2025 Reddit images, introduced as a leakage control. | A late collection date alone does not establish that reposted content was absent from pretraining. Image creation dates and duplicate/membership checks: `NOT_REPORTED`. [S v2, p. 6, section 4.1](https://arxiv.org/pdf/2602.01738v2#page=6). |

Exact `AUTHOR_REPORTED` semantic-probe **top-1 label / similarity** entries, selected from [S v2, p. 6, table 5](https://arxiv.org/pdf/2602.01738v2#page=6). These are paper-labeled similarity scores, not detector accuracy, genuine FPR, or calibrated probabilities.

| Model | Chameleon | SocialRF | CommunityAI | Midjourney-CC |
| --- | --- | --- | --- | --- |
| MetaCLIP (2023.9.28 label) | AI generated / 0.678 | AI generated / 0.902 | AI generated / 0.726 | midjourney_images / 0.604 |
| MetaCLIP2 (2025.7.29 label) | AI generated / 0.828 | AI generated / 0.924 | AI generated / 0.858 | midjourney_images / 0.621 |
| PE (2025.4.17 label) | AI generated / 0.861 | AI generated / 0.943 | AI generated / 0.878 | midjourney_images / 0.722 |
| SigLIP2 (2025.2.21 label) | genuine / 0.385 | portrait / 0.202 | urban / 0.209 | urban / 0.212 |

`AUDIT_FINDING`: table 5's dates are model labels, not reported pretraining cutoffs. MetaCLIP's 2023 row already retrieves generated/source concepts, so an absolute older-versus-modern semantic boundary would overstate the table. A full text pool, score aggregation recipe and mapping from this semantic probe to the trained binary head are `NOT_REPORTED`.

Exact `AUTHOR_REPORTED` counterfactual measurements, [S v2, p. 7, table 6](https://arxiv.org/pdf/2602.01738v2#page=7):

| DINOv3 pretraining variant | GenImage average | Chameleon real | Chameleon fake | Chameleon average |
| --- | ---: | ---: | ---: | ---: |
| Web | 0.965 | 0.933 | 0.895 | 0.914 |
| Satellite | 0.706 | 0.948 | 0.121 | 0.535 |

`DERIVED_FROM_AUTHOR_REPORTED`: Chameleon genuine errors are 6.7% for Web and 5.2% for Satellite; generated-image misses are 10.5% and 87.9%. The satellite model's lower genuine-error complement does not rescue its failed generated-image recognition. `AUDIT_FINDING`: this evidence supports the authors' exposure hypothesis but does not prove a fully controlled causal effect; the paper itself qualifies that conclusion in section 4 and the conclusion. [S v2, p. 6](https://arxiv.org/pdf/2602.01738v2#page=6), [pp. 8-9](https://arxiv.org/pdf/2602.01738v2#page=8).

## Reporting inconsistencies and unresolved blockers

| ID | AUDIT_FINDING | Consequence / disposition |
| --- | --- | --- |
| R-COUNT | General 100,000-image description versus explicit 50,000-image sources; LSUN text says three sets while listing four generators. [R v1, p. 13, appendix C](https://arxiv.org/pdf/2405.20112v1#page=13). | Exact evaluated denominators and split membership remain `NOT_REPORTED`; do not guess a reconciliation. |
| R-NOISE | Section 4.4 simultaneously describes approximately 50% AP at zero noise and >=80% over a range written as 0-0.17. [R v1, p. 8](https://arxiv.org/pdf/2405.20112v1#page=8). | Preserve the wording conflict; do not report zero-noise robustness. |
| R-REPRO | Pooling/output, input scaling, noise placement/clipping, repeated draws, numeric threshold and calibration split are unspecified. [R v1, pp. 4-5](https://arxiv.org/pdf/2405.20112v1#page=4), [p. 13](https://arxiv.org/pdf/2405.20112v1#page=13). | Blocks a claim of complete paper-only reproduction or validated genuine-error control. Main-agent implementation findings must remain separately sourced. |
| S-APPENDIX | Referred architecture/pretraining appendix is absent. [S v2, pp. 2-3](https://arxiv.org/pdf/2602.01738v2#page=2), [p. 9 end](https://arxiv.org/pdf/2602.01738v2#page=9). | Main-result backbone mapping, native inputs, pooling and many training/calibration fields remain `NOT_REPORTED`. A DINOv3-L replacement is an adaptation, not explicitly the reported 7B counterfactual. |
| S-ROUNDING | GenImage DINOv3 is 0.964 in tables 1, 9, 10; 0.965 in table 6 and 96.5% in section 3.2. [S v2, pp. 3-4](https://arxiv.org/pdf/2602.01738v2#page=3), [p. 7](https://arxiv.org/pdf/2602.01738v2#page=7), [p. 8](https://arxiv.org/pdf/2602.01738v2#page=8). | Keep the value tied to its specific table; no silently normalized canonical precision. |
| S-CLASS-AVERAGES | Table 2 DINOv2 Chameleon displays real/fake 0.628/0.580 but average 0.608; their arithmetic mean is 0.604. WildRF displays 0.643/0.772 and average 0.705; arithmetic mean is 0.7075. [S v2, p. 4, table 2](https://arxiv.org/pdf/2602.01738v2#page=4). | These gaps exceed simple rounding of the displayed inputs. Preserve the printed cells; calculate genuine errors only from the stated real columns. Raw values needed for reconciliation are `NOT_REPORTED`. |
| S-COMPARATORS | DDA is an explicit pretrained-weights exception to a broad shared-training description. [S v2, p. 3, section 3.1 / table 1](https://arxiv.org/pdf/2602.01738v2#page=3). | Do not describe all comparator training exposure as identical. |
| S-CAUSAL | Strong causal language in some subsections coexists with explicit indirect-evidence caveats; web/satellite changes both domain and sample scale. [S v2, pp. 6-7](https://arxiv.org/pdf/2602.01738v2#page=6). | Exposure mechanism remains an author-supported interpretation, not verified membership or a controlled pretraining proof. |
| S-OPERATING-POINT | Threshold, calibration data, genuine denominators and intervals are absent; real-class errors vary substantially by dataset and transform. [S v2, p. 4, table 2](https://arxiv.org/pdf/2602.01738v2#page=4), [p. 7, table 7](https://arxiv.org/pdf/2602.01738v2#page=7). | No low-FPR deployment guarantee, universal threshold, or transfer of these errors to Lythaus. |
| CROSS-PAPER | R uses threshold-free AUC/AP reporting; S primarily uses class accuracy at unspecified thresholds on different datasets and protocols. | A direct numerical winner, score fusion rule, shared calibrated threshold, and WP007N business outcome are not established by these papers. |

## Main-agent handoff

The sidecar's paper-reading and reporting work is complete. The blockers above concern **exact reproduction and outcome claims**, not permission to finish this document. Any implementation evidence that resolves paper-absent fields must be labeled as such; it must not retroactively change `NOT_REPORTED` into `AUTHOR_REPORTED` paper evidence.

For any later WP007N execution, keep separate records for the selected backbone/output/input contract, RIGID's noise and calibration contract, the linear head's complete training/split/threshold contract, and genuine-error evidence under transforms. Those are `LYTHAUS_ADAPTATION_NOT_EXECUTED` where they differ from or extend the papers. This sidecar supplies no selected operational threshold, trained artifact, evaluation result, or Lythaus acceptance claim.

Exact file edited by this sidecar: `research/wp007n/primary-paper-audit.md` in the isolated WP007N worktree. No other file edits, media/checkpoint acquisition, model-license audit, training, commit, or publication are part of this work.
