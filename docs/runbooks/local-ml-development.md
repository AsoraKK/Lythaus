# Local ML development controls

The official local node is the Windows HP Laptop 15-fc0xxx:

- AMD Ryzen 7 7730U, 8 cores / 16 threads;
- 16 GB DDR4-3200 RAM;
- integrated Radeon graphics;
- approximately 228 GB free SSD at the time of the approved brief.

Treat it as CPU-only. Do not build around ROCm/GPU acceleration and do not
run gpt-oss training, full SAFE training, major ViT/VLM training, or large
video-model training on this machine.

Suitable workloads are deterministic preprocessing, image transformations,
feature extraction, benchmark/calibration runs, classical ML, small neural
networks, frozen embeddings, and student fusion from approved precomputed
teacher outputs.

The `ml/local/eco_train/` controller enforces 40% target CPU, 50% ceiling,
four initial workers, six qualified maximum workers, below-normal priority,
6 GB process memory, 4 GB free system memory, and 80 GB free disk. It requires
AC power, checkpoints, resumability, and an epoch pause.

## Thermal telemetry

Reliable CPU-package telemetry is a prerequisite for unattended work. The
controller accepts only a recent, verified `cpu_package` reading. Generic
Windows ACPI thermal-zone values such as
`MSAcpi_ThermalZoneTemperature` are rejected as substitutes. The states are
`VALID`, `UNAVAILABLE`, `STALE`, and `IMPLAUSIBLE`.

Any state other than `VALID` prohibits unattended training. At 75 C the job
pauses; at 85 C it stops; it may resume only below 65 C after 120 stable
seconds. These are Lythaus safety thresholds and do not redefine the CPU's
95 C TjMax.

No privileged monitoring software is installed automatically. If a reliable
AMD package sensor requires HWiNFO, Libre Hardware Monitor, a vendor utility,
or elevated permissions, the owner must approve and install it separately,
then provide a reviewed adapter that identifies the package sensor.

## Host probe snapshot

On 2026-08-09, the host exposed `\\_TZ.THRM` through
`Win32_PerfFormattedData_Counters_ThermalZoneInformation`; this is a generic
thermal-zone value and is rejected. The `MSAcpi_ThermalZoneTemperature` query
returned `Access denied`. No verified CPU-package source was available, so
the unattended-training state remains prohibited.
