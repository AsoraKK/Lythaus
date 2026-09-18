# WP007J-R1 core-paper extraction

This document separates published claims, Lythaus measurements, and engineering inference. A field marked `NOT REPORTED BY AUTHORS` means the inspected primary source did not provide that fact in the source section used for this extraction; it is not an invitation to infer it from a neighboring benchmark.

## SAFE

**Primary source:** [arXiv:2408.06741](https://arxiv.org/abs/2408.06741) by Ouxiang Li, Jiayin Cai, Yanbin Hao, Xiaolong Jiang, Yao Hu, and Fuli Feng; KDD 2025. The paper proposes crop-based preprocessing instead of downsampling, ColorJitter/RandomRotation, and patch random masking. It reports an open-world benchmark spanning 26 generative models and headline gains of 4.5 percentage points in accuracy and 2.9 points in average precision.

**Lythaus reproduction:** the exact SAFE-A checkpoint and preprocessing were run on 1,080 approved representation-probe records and 2,140 actual JPEG descendants. The R1 hook extracted the 512-dimensional flattened average-pool vector immediately before `fc1` and reproduced the official logit path with maximum absolute logit delta `0.0`. This is a reproduction of the artifact used by Lythaus, not a claim that the KDD benchmark was recreated.

**Lythaus inference:** SAFE-A is a valuable positive specialist on validated input regimes, but the R1 missed-domain embedding analysis placed both Seedream-4 and Imagen-4 near the real-control centroid. That fails the predeclared SAFE-B head gate.

**Rights/compute:** the audited code repository is Apache-2.0; checkpoint-specific and foundation/dependency deployment rights remain separate and deployment-review-required. The approved local CPU environment ran SAFE-A without training.

## CPTFormer

**Primary source:** [CVPR 2026 paper](https://openaccess.thecvf.com/content/CVPR2026/html/Li_Detecting_Compressed_AI-Generated_Images_via_Phase_Spectrum_Robustness_CVPR_2026_paper.html) by Kai Li, Wenqi Ren, Wei Wang, and Xiaochun Cao. The method is a CLIP-ViT-based phase-spectrum transformer with PHCI, MDMA, and difficulty-aware consistency. The extracted primary-source result reports quality-agnostic mean accuracy of 76.3% for GANs and 63.5% for diffusion models, and quality-aware mean accuracy of 77.4% and 65.9% respectively. The paper reports resize-to-256, crop-to-224 inference and a 20-epoch AdamW schedule at learning rate `2e-5`, batch 32.

**Not transferred:** a complete quality-factor table, parameter count, hardware, stable official code/checkpoint and deployment licence were not located in this audit. R1 did not reproduce CPTFormer. R1 instead ran Lythaus-owned phase/FFT/DCT descriptors against actual encoded descendants. CPTFormer is therefore a future candidate, not an adopted detector.

## DCPT

**Primary source:** [arXiv:2604.10102](https://arxiv.org/abs/2604.10102) by Zongyou Yang, Yinghan Hou, and Xiaokun Yang. DCPT freezes a DINOv2 ViT-B/14 representation and trains a 768→256→2 head with feature cosine consistency and symmetric-KL prediction consistency between clean/degraded views. Training uses 51,517 COCO real and 51,518 self-conditioned SD2.1 fake images. Synthbuster evaluation covers nine generators and tests JPEG QF 30/50/70, blur sigma 1/2/3, and resize 0.5/0.25.

**Reported numbers:** identical-baseline clean accuracy `86.2%`, DCPT clean `85.3%`; degraded average `64.0%` versus `73.1%` (`+9.1` points); JPEG gains are reported as `+15.7` points at Q70 and `+17.2` at Q30. The extracted ablation reports feature-only JPEG average `70.7`, prediction-only `72.9`, both `71.1`; adding a 1.4M-parameter frequency branch lowered JPEG average to `57.6`. Training used one RTX4090D 24GB.

**Lythaus implication:** this is a credible future SAFE-B training objective, but it does not remove the need for real encoders, hard negatives, family-held-out generators, and a clean-specificity control. It was not trained in R1.

## Mandelli JPEG forensic training

**Primary source:** [IEEE WIFS 2020 paper](https://nicobonne.github.io/assets/papers/wifs_2020.pdf) by Sara Mandelli, Nicolò Bonettini, Paolo Bestagini, and Stefano Tubaro. The work studies CNN multimedia forensics under JPEG compression and grid misalignment. Its important transferable result is methodological: compression and JPEG-grid effects must be represented during training or forensic traces can fail to generalize. Exact architecture, counts, complete QF table, and numeric headline deltas are `NOT REPORTED BY AUTHORS` in this R1 extraction.

**Lythaus implication:** this principle is directly consistent with R1's real-codec result. It does not establish a SAFE threshold or prove that phase/DCT features are synthetic evidence.

## GlobalForge

**Primary source:** [arXiv:2607.14684](https://arxiv.org/abs/2607.14684) by Manni Cui, Ruiqi Liu, Dianyuan Zou, Ziheng Qin, Jingrui Xu, ZiAn Wang, Jianglan Wei, Han Zhou, Yu Liu, Yan Wang, and Shu Wu. GlobalForge uses a Local Information Bottleneck, Global Structure Reasoning and degradation-contrastive structural learning. The paper describes RealDeg-Bench with seven degradation operations, compound degradation and eight in-the-wild groups, and reports a `+5.89` point average balanced-accuracy improvement over prior state of the art.

**Lythaus implication:** the global/local distinction is relevant because the SAFE-missed families moved toward the real embedding cluster. However, balanced accuracy is not an FPR-controlled forensic operating point; implementation, checkpoint rights, exact per-generator tables and stable code were not verified. No reproduction was run.

## CO-SPY

**Primary source:** [CVPR 2025 paper](https://openaccess.thecvf.com/content/CVPR2025/papers/Cheng_CO-SPY_Combining_Semantic_and_Pixel_Features_to_Detect_Synthetic_Images_CVPR_2025_paper.pdf) and [official repository](https://github.com/Megum1/Co-Spy) by Siyuan Cheng, Lingjuan Lyu, Zhenting Wang, Xiangyu Zhang, and Vikash Sehwag. CO-SPY combines an enhanced OpenCLIP semantic branch, a VAE-reconstruction-residual artifact branch and an adaptive regulator. Co-SPY-Bench contains five real datasets and 22 generative models, with 50,000 in-the-wild synthetic images; the abstract reports approximately 11–34% average accuracy improvement under identical training.

**Lythaus implication:** the semantic/artifact separation is a useful future hypothesis, but full fusion is outside R1. The artifact branch may share SAFE's post-processing fragility, while the semantic branch needs explicit hard-negative and unseen-generator testing. The repository code is MIT according to the audit; OpenCLIP, VAE, checkpoint and data rights remain separate.

## Fake or JPEG?

**Primary source:** [arXiv:2403.17608](https://arxiv.org/abs/2403.17608) by Patrick Grommelt, Louis Weiss, Franz-Josef Pfreundt, and Janis Keuper; [project page](https://www.unbiased-genimage.org/). The work demonstrates that JPEG and image-size distributions can become dataset shortcuts. It reports more than 11 points of cross-generator performance improvement after removing identified biases and warns that QF95 re-encoding can already reduce recall.

**Lythaus reproduction:** R1 froze source membership before encoding, captured actual DQT/SOF facts, used Pillow/libjpeg and Sharp/libvips, and retained negative movement rather than deleting false positives. In the bounded primary Pillow Q95 slice SAFE-A detected `0/40` synthetic descendants and produced `8/60` negative false positives. This is not a reproduction of the paper's benchmark; it is a Lythaus control implementing its warning.

## Synthetic Laundering

**Primary source:** [arXiv:2407.10736](https://arxiv.org/abs/2407.10736) by Sara Mandelli, Paolo Bestagini, and Stefano Tubaro; [official repository](https://github.com/polimi-ispl/synthetic-image-detection). The paper separates pristine, laundered and fully synthetic states and explains that laundering can hide synthetic traces and mask camera-model artifacts.

**Lythaus implication:** post-processing should be treated as a forensic regime and camera-acquisition evidence must remain independent of synthetic-content evidence. The paper is not a Seedream/Imagen or Lythaus JPEG-matrix reproduction; exact architecture, counts, QF matrix, runtime and rights were not extracted as numeric Lythaus evidence.

## RRDataset

**Primary source:** [ICCV 2025 paper](https://openaccess.thecvf.com/content/ICCV2025/papers/Li_Bridging_the_Gap_Between_Ideal_and_Real-world_Evaluation_Benchmarking_AI-Generated_ICCV_2025_paper.pdf) and [Zenodo record](https://zenodo.org/records/14963880) by Chunxiao Li, Xiaoxiao Wang, Meiling Li, Boming Miao, Peng Sun, Yunjian Zhang, Xiangyang Ji, and Yao Zhu. RRDataset contains 10,000 real and 10,000 AI images, tests seven scenarios, seven social platforms named in the paper plus Tinder, 2–6 transmissions, four re-digitization methods, 17 detectors and 10 VLMs, with 192 human participants.

**Lythaus implication:** it supports future propagation/re-digitization testing, not a one-number JPEG quality threshold. R1 did not materialize this benchmark, and FLUX.2 remained sealed.

## B-Free

**Primary source:** [CVPR 2025 paper](https://openaccess.thecvf.com/content/CVPR2025/papers/Guillaro_A_Bias-Free_Training_Paradigm_for_More_General_AI-generated_Image_Detection_CVPR_2025_paper.pdf) by Fabrizio Guillaro, Giada Zingarini, Ben Usman, Avneesh Sud, Davide Cozzolino, and Luisa Verdoliva. B-Free uses self-conditioned SD2.1 inpainting to construct semantically aligned real/fake pairs and content augmentation, evaluating across 27 generators including FLUX and SD3.5.

**Lythaus implication:** content matching is an important control against shortcut learning. The paper does not, from the extracted fields, provide the Lythaus-required hard-negative FPR, real-encoder JPEG matrix or deployment-cleared checkpoint. No reproduction was run.

## Diff-JPEG

**Primary source:** [WACV 2024 paper](https://openaccess.thecvf.com/content/WACV2024/html/Reich_Differentiable_JPEG_The_Devil_Is_in_the_Details_WACV_2024_paper.html) and [official repository](https://github.com/necla-ml/Diff-JPEG) by Christoph Reich, Biplob Debnath, Deep Patel, and Srimat Chakradhar. The implementation differentiates through image, quality, quantization tables and color conversion. The paper reports average PSNR improvement of 3.47 dB versus recent best and 9.51 dB under strong compression in its codec task; it is not an AI-detector benchmark. The repository was audited as BSD-3-Clause.

**Lythaus implication:** Diff-JPEG is suitable as a future training augmentation component only after forward-fidelity checks against real encoders. It cannot restore discarded forensic information and was not used to claim R1 robustness.

## PatchCraft

**Primary source:** [arXiv:2311.12397](https://arxiv.org/abs/2311.12397) by Nan Zhong, Yiran Xu, Sheng Li, Zhenxing Qian, and Xinpeng Zhang. PatchCraft uses Smash&Reconstruction to remove global semantic information and analyzes texture-rich/texture-poor inter-pixel correlation. The benchmark contains 17 prevalent generative models and reports substantial gains over baselines, without a QF/encoder matrix in the inspected abstract.

**Lythaus implication:** texture-patch evidence is a candidate for future unseen-generator rescue, but it may be locally fragile under JPEG and no rights/weights/runtime qualification was completed in R1.

## Cross-paper result

Published work supports three non-equivalent directions: codec/data-bias controls, complementary global/semantic/phase cues, and paired clean/degraded training. R1 provides the missing Lythaus contact evidence: SAFE-A's frozen representation puts Seedream-4 and Imagen-4 near real controls; actual JPEG descendants collapse SAFE-A even when nominal quality is high; DCT/FFT scalars remain partially stable and discriminative but are not yet a validated rescue specialist. The next experiment should therefore be a narrow, Lythaus-owned compression/eligibility qualification with SAFE-A permanently frozen—not another unconstrained ensemble.
