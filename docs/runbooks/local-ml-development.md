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

## WP003 research policy

WP002 permits short, attended CPU workloads for deterministic preprocessing,
the transformation laboratory, benchmark metric calculations, classical ML,
small neural networks, frozen embeddings, and student-fusion experiments over
approved precomputed teacher outputs. It does not permit gpt-oss training,
full SAFE training, major ViT/VLM training, large video-model training, or
unbounded dataset processing.

Teacher outputs must carry a model manifest ID, model version, artifact hash,
licence classification, dataset manifest hash, and transformation provenance.
No proprietary moderation output or ordinary Lythaus upload may become a
commercial-model training target unless its terms explicitly allow that use.

## Controlled LHM proof

The 2026-08-09 non-elevated LibreHardwareMonitor proof identified the Ryzen
7 7730U host but did not expose a trustworthy CPU-package sensor. The only
candidate `Tctl/Tdie` reading was `0 C` and was rejected as implausible. The
proof result is `UNAVAILABLE`; unattended training remains prohibited.

The owner may separately run the bounded elevated proof using the official LHM
release and review the generated JSON. Codex must not bypass UAC, install a
driver, or silently install privileged monitoring software. A valid result
must identify a CPU/package or Tctl/Tdie sensor, show dynamic values under
load, include timestamps, and reject stale or duplicate thermal-zone readings.
Until those conditions are met, `UNAVAILABLE`, `STALE`, or `IMPLAUSIBLE` all
fail closed.

The temporary proof directory is `%TEMP%\\lythaus-lhm-proof-20260809`. Preserve
it until the owner has captured the diagnostic evidence; do not commit its
binaries or logs to the repository.

## Human-executed elevated proof

The owner may open **PowerShell as Administrator** and run the following
command against the already supplied official LHM library. This command does
not bypass UAC, install a service, or change execution policy:

```powershell
$proofRoot = Join-Path $env:TEMP 'lythaus-lhm-proof-20260809'
$repositoryRoot = '<path-to-cloned-Lythaus-repository>'
$library = Join-Path $proofRoot 'LibreHardwareMonitorLib.dll'
$output = Join-Path $proofRoot 'telemetry-proof.json'
Set-Location $repositoryRoot
& .\ml\local\eco_train\lhm-telemetry-proof.ps1 `
  -LibraryPath $library `
  -SampleMilliseconds 5000 `
  -OutputPath $output
```

Return the JSON file for review. `VALID` requires exactly one plausible
`CPU Package` temperature sensor for the Ryzen 7 7730U with a dynamic,
timestamped reading. `UNAVAILABLE`, `STALE`, or `IMPLAUSIBLE` keeps unattended
training disabled. Do not copy the LHM binaries into Git.

## Host probe snapshot

On 2026-08-09, the host exposed `\\_TZ.THRM` through
`Win32_PerfFormattedData_Counters_ThermalZoneInformation`; this is a generic
thermal-zone value and is rejected. The `MSAcpi_ThermalZoneTemperature` query
returned `Access denied`. No verified CPU-package source was available, so
the unattended-training state remains prohibited.
