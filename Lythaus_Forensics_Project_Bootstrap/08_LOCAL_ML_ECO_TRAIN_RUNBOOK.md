# Local ML / ECO-TRAIN Runbook

**Host:** HP Laptop 15-fc0xxx  
**CPU:** AMD Ryzen 7 7730U, 8 cores / 16 threads  
**RAM:** 16 GB DDR4-3200  
**GPU:** integrated AMD Radeon; treat as CPU-only for this programme  
**Storage snapshot:** ~228 GB free at original qualification planning  
**CPU TjMax reference:** 95°C

## 1. Approved workloads

Suitable now, attended:

- dataset manifest/provenance work;
- deterministic transforms;
- image metadata/file parsing;
- spectral/camera feature extraction;
- benchmark metric calculations;
- calibration;
- classical ML;
- small shallow neural/fusion experiments;
- frozen/precomputed embeddings;
- Student v0 work over approved precomputed teacher outputs.

Not approved locally:

- gpt-oss training/fine-tuning;
- full SAFE training;
- major ViT/VLM training;
- large video models;
- multi-large-teacher simultaneous inference/training;
- unbounded overnight processing;
- any unattended training while telemetry remains invalid.

## 2. ECO-TRAIN resource policy

- AC power required; battery training prohibited.
- CPU target utilisation: 40%.
- Absolute software ceiling: 50%.
- Initial workers: 4.
- Maximum after qualification: 6.
- Process priority: below normal/low.
- Process memory ceiling: 6 GB.
- Minimum free system memory: 4 GB.
- Minimum free disk: 80 GB.
- Frequent checkpoints and resumable jobs required.
- Pause between epochs/batches where appropriate.
- Excessive swap -> pause.

## 3. Thermal policy

Lythaus engineering limits:

- pause at 75°C;
- emergency stop at 85°C;
- resume only below 65°C;
- require 120 seconds stable below resume threshold.

These are conservative Lythaus limits and do not redefine the AMD 95°C TjMax.

## 4. Telemetry fail-closed rule

Reliable CPU-package telemetry is mandatory for unattended work.

Allowed sensor state: `VALID` only.

Failure states:

- `UNAVAILABLE`
- `STALE`
- `IMPLAUSIBLE`

Generic Windows ACPI thermal-zone values are not accepted as Ryzen CPU-package temperature.

## 5. Current telemetry state

On 9 August 2026:

- LibreHardwareMonitor non-elevated proof recognised the Ryzen host;
- no trustworthy `CPU Package` sensor was exposed;
- candidate `Tctl/Tdie` = 0°C was rejected;
- generic `\\_TZ.THRM` was rejected as a substitute;
- unattended training remained prohibited.

This is the correct safe failure mode.

## 6. Optional human-executed elevated LHM proof

Codex/automation must not bypass UAC. The owner may open **PowerShell as Administrator** and run:

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

A valid result must identify exactly one plausible Ryzen CPU Package/Tctl/Tdie package sensor and demonstrate dynamic timestamped values under load. Do not commit LHM binaries/logs to Git.

If elevated proof remains unavailable/implausible, stop pursuing unattended laptop training unless the owner explicitly reopens the decision.

## 7. Thermal qualification sequence if telemetry becomes VALID

Stage A: ~25% CPU for 5 minutes.  
Stage B: ~35% CPU for 10 minutes.  
Stage C: ~40% CPU for 15 minutes.

Record:

- timestamp;
- CPU utilisation;
- verified package temperature;
- process/system memory;
- clocks if available;
- throttling indicators if available;
- responsiveness/errors.

Abort/pause under the thermal policy. The first qualification is attended and does not automatically enable unattended jobs.

## 8. Physical safety

- hard, flat, ventilated surface;
- vents clear;
- AC connected;
- normal cooling/fan behaviour;
- first long jobs attended;
- stop on abnormal fan noise, smell, shutdown, instability, persistent heavy throttling or excessive swap.

## 9. Data safety

- large media external to Git;
- hash/manifests in repo, binaries outside;
- no user-content training;
- no PII in routine feature logs;
- GPS/owner/serial metadata restricted where forensically needed and removed from ordinary derived training representation;
- checkpoints written frequently and atomically where practical.

## 10. Current recommended laptop role

Treat the machine as a **CPU forensic laboratory and compact-model development node**, not a failed GPU workstation. It is appropriate for deterministic feature engineering, corpus preparation, reproducible transforms, benchmarks, calibration and small fusion models. Serious teacher/model training can be deferred until its value is demonstrated and approved compute is justified.
