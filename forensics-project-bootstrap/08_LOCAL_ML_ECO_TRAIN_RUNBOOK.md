# Local ML / ECO-TRAIN Runbook

Host: HP Laptop 15-fc0xxx

Product SKU: 9J3C1EA#ACQ

CPU: AMD Ryzen 7 7730U, 8 cores / 16 threads, Zen 3, 15 W default TDP

AMD Tjmax: 95 C

RAM: 16 GB DDR4-3200

GPU: integrated Radeon; Lythaus treats this host as CPU-only for ML

SSD: ~477 GB usable; ~228 GB free at original qualification snapshot

OS context: Windows

Official AMD reference: https://www.amd.com/en/products/processors/laptop/ryzen/7000-series/amd-ryzen-7-7730u.html

## Mission

This laptop is a low-cost forensic research node, not a substitute GPU server.

Use for:
- manifests/hashing;
- transformations;
- deterministic feature extraction;
- benchmarks;
- calibration;
- small classical models;
- small attended neural experiments;
- frozen embeddings where resource-safe;
- Student v0 fusion after data/rights approval.

Do not use for:
- full SAFE training;
- GPT-OSS training;
- major ViT/VLM training;
- large video models;
- unbounded overnight processing.

## GPU rule

Do not architect around ROCm/iGPU acceleration on this machine. Any future accelerator path requires a separate, current compatibility decision.

## ECO-TRAIN policy

```yaml
power:
  require_ac: true
  allow_on_battery: false

cpu:
  target_utilisation_percent: 40
  absolute_ceiling_percent: 50
  initial_worker_threads: 4
  maximum_workers_after_qualification: 6
  process_priority: below_normal

memory:
  max_process_gb: 6
  minimum_free_system_gb: 4
  excessive_swap_action: pause

storage:
  minimum_free_disk_gb: 80
  large_datasets_outside_git: true
  bounded_cache: true

thermal:
  cpu_tjmax_c: 95
  pause_c: 75
  emergency_stop_c: 85
  resume_below_c: 65
  resume_stable_seconds: 120
  fail_closed_without_valid_cpu_package_sensor: true

training:
  checkpoint_frequently: true
  resumable: true
  pause_between_epochs: true

unattended:
  enabled_by_default: false
```

75/85 C are Lythaus conservative engineering thresholds, not AMD's Tjmax.

## Current thermal status

Non-elevated LibreHardwareMonitor proof:
- exact CPU Package sensor not obtained;
- candidate `Tctl/Tdie = 0 C`;
- rejected as implausible;
- telemetry state `UNAVAILABLE`.

Generic Windows thermal-zone values such as `\_TZ.THRM` are not accepted as CPU-package telemetry.

Therefore: **UNATTENDED TRAINING PROHIBITED**.

## Temperature-provider states

- `VALID`
- `UNAVAILABLE`
- `STALE`
- `IMPLAUSIBLE`

Only `VALID` can support later unattended qualification.

A valid reading must:
- identify the Ryzen CPU/package;
- come from a CPU temperature sensor, not generic ACPI/chassis zone;
- be plausible;
- update dynamically;
- carry timestamps;
- not be stale/duplicated.

## Human-executed elevated LHM proof

Codex must not bypass UAC.

Human procedure:
1. Confirm `%TEMP%\lythaus-lhm-proof-20260809` still contains the approved official LHM library.
2. Open PowerShell as Administrator.
3. Set repository path.
4. Run:

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

5. Review/return `telemetry-proof.json`.
6. Do not copy LHM binaries into Git.
7. Do not install a permanent service merely for ECO-TRAIN.

Decision:
- `VALID` -> attended thermal qualification.
- `UNAVAILABLE`/`STALE`/`IMPLAUSIBLE` -> keep unattended disabled; do not circumvent sensors without separate approval.

## Thermal qualification

Only after valid CPU-package telemetry.

Stage A:
- ~25% CPU;
- 5 minutes.

Stage B:
- ~35% CPU;
- 10 minutes.

Stage C:
- ~40% CPU;
- 15 minutes.

Record:
- timestamp;
- CPU utilisation;
- package temperature;
- RAM/free RAM;
- process memory;
- clock where available;
- throttling evidence;
- responsiveness;
- human physical/fan observations.

Stop/pause rules:
- 75 C -> pause;
- 85 C -> terminate;
- abnormal fan/smell/shutdown/instability -> human stop;
- excessive swap -> pause;
- material responsiveness degradation -> reduce load.

Thermal qualification never auto-enables unattended work. Human review is required.

## Physical precautions

For sustained work:
- mains power;
- hard flat ventilated surface;
- vents clear;
- no bed/blanket/soft surface;
- first longer runs attended;
- stop on abnormal hardware behaviour.

Do not pursue maximum CPU utilisation simply because the chip permits it.

## Safe workloads before qualification

Short attended:
- hashing;
- manifest generation;
- image transforms;
- deterministic features;
- small benchmark batches;
- metrics;
- small classical-model fits after data approval.

## Storage discipline

Maintain >=80 GB free disk during serious corpus work.

Never:
- place 100+ GB datasets in Git;
- rely on swap as model RAM;
- duplicate archives unnecessarily.

Preferred:
- external dataset/cache root;
- manifests/hashes in Git;
- regenerable feature stores outside Git;
- documented cleanup/retention.

For CSAFE-sized data:
- bounded batches;
- resumable manifests;
- skip unchanged hashes;
- check disk before each batch;
- atomic progress state.

## Teacher inference later

If SAFE/GRIP become approved:
1. profile one image;
2. profile a small batch;
3. measure RAM/latency;
4. never begin with a huge local batch;
5. persist teacher outputs with model/version/artifact hash;
6. do not recompute identical teacher outputs unless intentionally re-evaluating.

## Temporary LHM cleanup

Path: `%TEMP%\lythaus-lhm-proof-20260809`.

Retain until the elevated proof is completed or abandoned and diagnostic JSON is captured. Then remove temporary binaries/logs if no longer needed. `%TEMP%` is not a durable evidence archive.

## Reproducibility for local runs

Record:
- Git SHA;
- dataset manifest SHA;
- feature schema;
- model artifact SHA;
- runtime versions;
- CPU model;
- random seed;
- start/end;
- peak memory;
- result path;
- interruption/resume details.

## Current approval state

- short attended deterministic/preprocessing work: allowed;
- small classical Student-like experiment: only after rights-clean training data + human approval;
- Student v0 training: not yet generally approved;
- unattended/overnight: prohibited;
- large-model training: prohibited.
