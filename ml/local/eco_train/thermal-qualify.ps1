[CmdletBinding()]
param(
  [switch]$Run
)

if (-not $Run) {
  node ml/local/eco_train/thermal-qualify.mjs --plan
  Write-Host 'Plan only. Use -Run only after a human has confirmed an approved CPU-package telemetry provider.'
  exit 0
}

Write-Host 'Thermal qualification execution is intentionally not automated in Foundation 001.'
Write-Host 'Provide a human-reviewed telemetry sampler before implementing the 5/10/15 minute run.'
exit 2
