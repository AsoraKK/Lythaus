The image uses Ouxiang-Li/SAFE source at commit
`4e998724651b227def64f5be0cd60c0aa1552c35`. Its unmodified model source and
Apache-2.0 license are verified and installed at build time under `/opt/safe`.
Source: https://github.com/Ouxiang-Li/SAFE/tree/4e998724651b227def64f5be0cd60c0aa1552c35

The code license is not a checkpoint deployment grant. Building an image that
contains the checkpoint requires the separate, evidenced restricted-beta
hosting decision described in the model card. No checkpoint is committed here.

Dependency versions and wheel hashes are in `container/requirements.lock`.
Torch and torchvision use the CPU-only upstream wheel index. Their upstream
license files and those of NumPy, Pillow, PyWavelets, pytorch-wavelets and Kornia
remain in the installed distributions. The build uses Debian-based Python and
Node images pinned by digest; retain their notices and the build SBOM with each
release. Ancillary dependencies are frozen for this integration runtime, which
still requires real-image parity against the historical scoring runtime.
