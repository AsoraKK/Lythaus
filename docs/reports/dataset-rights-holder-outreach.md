# Dataset rights-holder outreach dossier

**Status:** preparation only. Lythaus has not contacted any rights holder, made
an offer, accepted terms, or purchased a licence.

## Rights requested

For each target, the owner should seek a non-exclusive licence covering:

- internal commercial research and benchmarking;
- machine-learning training, fine-tuning, feature extraction, and knowledge
  distillation;
- image transformations, derivative training samples, and secure storage;
- model-weight creation and continued use of already-trained weights after
  termination where negotiable;
- commercial deployment of trained models and a future Lythaus authenticity API.

The agreement should also specify attribution, redistribution restrictions,
retention/deletion, security, publication, fees, renewal, territory, field of
use, takedown, privacy/consent, and whether derived weights may remain in
service after termination.

## Priority method

Score = forensic uniqueness + camera provenance + generator diversity +
hard-negative value + commercial relevance + replacement difficulty +
(5 - likely negotiation cost) + (5 - privacy/legal complexity). The maximum
score is 40.

| Priority | Dataset | Owner/team | Score | Why it matters | Contact route | Current gate |
|---|---|---|---:|---|---|---|
| HIGH | MIT-Adobe FiveK | MIT CSAIL / Adobe research collaboration | 31 | RAW-to-retouched pairs expose camera and editing changes | [MIT dataset page](https://data.csail.mit.edu/graphics/fivek/) and institutional research contacts | REQUIRES_PERMISSION |
| HIGH | HDR+ Burst Photography | Google Research / HDR+ maintainers | 30 | Computational photography, burst fusion, HDR and low-light pipeline evidence | [HDR+ project page](https://hdrplusdata.org/) and Google Research licensing route | REQUIRES_PERMISSION |
| HIGH | RAISE-1k | University of Trento / RAISE maintainers | 29 | High-resolution camera-native evidence with photo metadata | [RAISE download/contact page](https://loki.disi.unitn.it/RAISE/download.html) | REQUIRES_PERMISSION |
| MEDIUM | GPT-ImgEval | Repository authors and generator rights holders | 25 | Closed/current generator evaluation and edit subsets | [project repository](https://github.com/PicoTrex/GPT-ImgEval) issue or maintainer route | REQUIRES_PERMISSION |
| MEDIUM | FaceForensics++ | LMU Munich / dataset maintainers | 22 | Local manipulation and face-edit hard negatives | [official repository](https://github.com/ondyari/faceforensics) access route | REQUIRES_PERMISSION; biometric review |
| MEDIUM | Unsplash Dataset Lite clarification | Unsplash Dataset team | 21 | Commercial internal training language, but API/deployment and retention boundaries need clarity | [Dataset page](https://unsplash.com/data) and dataset terms contact | CONDITIONAL; evaluation-only in Lythaus |
| LOW | GenImage | GenImage authors | 17 | Broad generator coverage but rights lineage is unclear | [official repository](https://github.com/GenImage-Dataset/GenImage) | UNCLEAR |
| LOW | DiTFake | Dataset authors / hosting maintainer | 15 | Newer transformer-generator holdout | [dataset page](https://huggingface.co/datasets/Jouesmak/DiTFake) | UNCLEAR |

## Human-only boundary

The owner handles all relationship-building, negotiation, commercial terms,
fees, representations, signatures, and acceptance. Codex may update the
registry only after receiving written terms or a supplied licence packet.

Until then, restricted candidates remain evaluation/research references and
cannot enter commercial training or distillation.
