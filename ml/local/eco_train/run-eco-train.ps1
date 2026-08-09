[CmdletBinding()]
param(
  [switch]$Unattended
)

$arguments = @('ml/local/eco_train/controller.mjs')
if ($Unattended) { $arguments += '--unattended' }
node @arguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Admission check completed. No training process is started by Foundation 001.'
