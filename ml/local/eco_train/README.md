# ECO-TRAIN local controller

This is a CPU-only development guard for the approved HP Laptop 15-fc0xxx
(Ryzen 7 7730U, 16 threads, 16 GB RAM). It is not a trainer and it does not
start unattended work.

The controller fails closed unless it receives a recent, verified
`cpu_package` temperature reading. Windows ACPI thermal-zone readings,
including `MSAcpi_ThermalZoneTemperature`, are rejected because they do not
prove CPU-package temperature for this AMD host. No privileged monitoring tool
is installed by these scripts.

Use `run-eco-train.ps1` for an admission check and
`thermal-qualify.ps1` for a plan-only qualification report. A separately
approved telemetry provider must supply JSON through
`LYTHAUS_CPU_PACKAGE_TEMPERATURE_JSON`; it must set `sourceVerified: true` and
`sensorKind: "cpu_package"`.

The policy limits are deliberately stricter than the hardware TjMax:

- target CPU utilisation: 40%; absolute ceiling: 50%;
- initial workers: 4; post-qualification maximum: 6;
- process memory: 6 GB; free system memory: 4 GB;
- free disk: 80 GB;
- pause at 75 C; emergency stop at 85 C; resume below 65 C after 120 seconds;
- unattended training disabled by default.
