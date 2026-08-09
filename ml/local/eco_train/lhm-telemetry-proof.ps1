[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
  [string]$LibraryPath,

  [ValidateRange(100, 10000)]
  [int]$SampleMilliseconds = 1000,

  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$config = [ordered]@{
  schemaVersion = 'lythaus-lhm-telemetry-proof-v1'
  provider = 'LibreHardwareMonitor'
  requiredSensorName = 'CPU Package'
  requiredSensorType = 'Temperature'
  requiredHardwareType = 'Cpu'
  requiredHardwareNamePattern = 'AMD Ryzen 7 7730U'
}
$computer = $null

function Get-HardwareNode([object]$Node) {
  $Node
  foreach ($child in @($Node.SubHardware)) {
    Get-HardwareNode $child
  }
}

try {
  $resolvedLibraryPath = (Resolve-Path -LiteralPath $LibraryPath).Path
  [void][Reflection.Assembly]::LoadFrom($resolvedLibraryPath)

  $computer = [LibreHardwareMonitor.Hardware.Computer]::new()
  $computer.IsCpuEnabled = $true
  $computer.Open()
  Start-Sleep -Milliseconds $SampleMilliseconds

  $sampledAt = [DateTime]::UtcNow
  $sensors = @()
  foreach ($hardware in @($computer.Hardware)) {
    foreach ($node in @(Get-HardwareNode $hardware)) {
      $node.Update()
      foreach ($sensor in @($node.Sensors)) {
        if ([string]$sensor.SensorType -ne $config.requiredSensorType) {
          continue
        }
        $sensors += [ordered]@{
          hardwareName = [string]$node.Name
          hardwareType = [string]$node.HardwareType
          hardwareIdentifier = [string]$node.Identifier
          sensorName = [string]$sensor.Name
          sensorType = [string]$sensor.SensorType
          valueCelsius = if ($null -eq $sensor.Value) { $null } else { [double]$sensor.Value }
          sensorIdentifier = [string]$sensor.Identifier
        }
      }
    }
  }

  $approved = @($sensors | Where-Object {
    $_.hardwareType -eq $config.requiredHardwareType -and
    $_.hardwareName -match $config.requiredHardwareNamePattern -and
    $_.sensorName -eq $config.requiredSensorName -and
    $_.sensorType -eq $config.requiredSensorType -and
    $_.valueCelsius -is [double] -and
    [double]::IsFinite([double]$_.valueCelsius) -and
    $_.valueCelsius -ge 0 -and
    $_.valueCelsius -le 105
  })

  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  $report = [ordered]@{
    schemaVersion = $config.schemaVersion
    generatedAt = $sampledAt.ToString('o')
    provider = $config.provider
    libraryPath = $resolvedLibraryPath
    libraryVersion = ([Reflection.Assembly]::LoadFrom($resolvedLibraryPath).GetName().Version.ToString())
    elevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    hostPolicy = [ordered]@{
      cpuModel = 'AMD Ryzen 7 7730U'
      cpuThreads = 16
    }
    sensors = $sensors
    status = if ($approved.Count -eq 1) { 'VALID' } elseif ($approved.Count -eq 0) { 'UNAVAILABLE' } else { 'IMPLAUSIBLE' }
    reason = if ($approved.Count -eq 1) { 'verified_cpu_package_temperature' } elseif ($approved.Count -eq 0) { 'exact_cpu_package_sensor_not_available' } else { 'multiple_cpu_package_sensors_found' }
    selectedReading = if ($approved.Count -eq 1) {
      [ordered]@{
        state = 'VALID'
        sensorKind = 'cpu_package'
        sourceVerified = $true
        source = 'LibreHardwareMonitor'
        observedAt = $sampledAt.ToString('o')
        celsius = [double]$approved[0].valueCelsius
        hardwareName = $approved[0].hardwareName
        sensorIdentifier = $approved[0].sensorIdentifier
      }
    } else { $null }
  }

  $json = $report | ConvertTo-Json -Depth 8
  if ($OutputPath) {
    $parent = Split-Path -Parent $OutputPath
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    Set-Content -LiteralPath $OutputPath -Value $json -Encoding UTF8
  }
  Write-Output $json
} catch {
  $failure = [ordered]@{
    schemaVersion = $config.schemaVersion
    status = 'UNAVAILABLE'
    reason = 'lhm_probe_failed'
    errorType = $_.Exception.GetType().FullName
    errorMessage = $_.Exception.Message
  }
  $json = $failure | ConvertTo-Json -Depth 5
  if ($OutputPath) {
    $parent = Split-Path -Parent $OutputPath
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    Set-Content -LiteralPath $OutputPath -Value $json -Encoding UTF8
  }
  Write-Output $json
  exit 1
} finally {
  if ($computer) {
    try { $computer.Close() } catch {}
  }
}
