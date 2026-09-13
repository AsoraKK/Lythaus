param(
  [Parameter(Mandatory = $true)]
  [string]$SeedRoot,
  [string]$OutputPath,
  [string]$ResearchDate = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$resolvedRoot = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $SeedRoot).Path)
$rootPrefix = $resolvedRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$allowedExtensions = @('.jpg', '.jpeg', '.png', '.webp', '.avif')

Add-Type -AssemblyName PresentationCore, WindowsBase, System.Drawing -ErrorAction Stop

function Test-AsciiPattern([byte[]]$Bytes, [string]$Pattern) {
  $text = [System.Text.Encoding]::Latin1.GetString($Bytes)
  return $text.IndexOf($Pattern, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Get-SafeMetadata([byte[]]$Bytes) {
  $keys = [System.Collections.Generic.List[string]]::new()
  $exif = (Test-AsciiPattern $Bytes "Exif`0`0") -or (Test-AsciiPattern $Bytes 'eXIf')
  $xmp = (Test-AsciiPattern $Bytes 'http://ns.adobe.com/xap/1.0/') -or (Test-AsciiPattern $Bytes 'XMP')
  $c2pa = Test-AsciiPattern $Bytes 'c2pa'
  $encoder = (Test-AsciiPattern $Bytes 'JFIF') -or (Test-AsciiPattern $Bytes 'Adobe') -or (Test-AsciiPattern $Bytes 'Software')
  if ($exif) { $keys.Add('EXIF') }
  if ($xmp) { $keys.Add('XMP') }
  if ($c2pa) { $keys.Add('C2PA_INTERFACE') }
  if ($encoder) { $keys.Add('ENCODER_MARKER') }
  $privacyFlags = [System.Collections.Generic.List[string]]::new()
  if ((Test-AsciiPattern $Bytes 'gps') -or (Test-AsciiPattern $Bytes 'latitude') -or (Test-AsciiPattern $Bytes 'longitude')) { $privacyFlags.Add('LOCATION') }
  if ((Test-AsciiPattern $Bytes 'serialnumber') -or (Test-AsciiPattern $Bytes 'bodyserialnumber')) { $privacyFlags.Add('DEVICE_SERIAL') }
  if ((Test-AsciiPattern $Bytes 'ownername') -or (Test-AsciiPattern $Bytes 'cameraownername')) { $privacyFlags.Add('OWNER_NAME') }
  if ((Test-AsciiPattern $Bytes 'artist') -or (Test-AsciiPattern $Bytes 'creator')) { $privacyFlags.Add('AUTHOR') }
  [pscustomobject]@{
    exifPresent = $exif
    xmpPresent = $xmp
    c2paPresent = $c2pa
    encoderPresent = $encoder
    metadataAbsent = $keys.Count -eq 0
    safeKeys = [object[]]@($keys | Select-Object -Unique)
    privacySensitiveMetadataFlags = [object[]]@($privacyFlags | Select-Object -Unique)
  }
}

function Get-OrientationTag([string]$Path) {
  $image = $null
  try {
    $image = [System.Drawing.Image]::FromFile($Path)
    $item = $image.GetPropertyItem(274)
    if ($item.Value.Length -ge 2) {
      $value = [int][System.BitConverter]::ToUInt16($item.Value, 0)
      if ($value -gt 0) { return $value }
      return $null
    }
  } catch {
    return $null
  } finally {
    if ($null -ne $image) { $image.Dispose() }
  }
  return $null
}

function Get-WicFrame([string]$Path) {
  $decoder = [System.Windows.Media.Imaging.BitmapDecoder]::Create(
    [Uri]::new($Path),
    [System.Windows.Media.Imaging.BitmapCreateOptions]::PreservePixelFormat,
    [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
  )
  return $decoder.Frames[0]
}

function Get-PHash([string]$Path) {
  $image = New-Object System.Windows.Media.Imaging.BitmapImage
  [void]$image.BeginInit()
  $image.CacheOption = [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
  $image.DecodePixelWidth = 32
  $image.UriSource = [Uri]::new($Path)
  [void]$image.EndInit()

  $gray = New-Object System.Windows.Media.Imaging.FormatConvertedBitmap
  [void]$gray.BeginInit()
  $gray.Source = $image
  $gray.DestinationFormat = [System.Windows.Media.PixelFormats]::Gray8
  [void]$gray.EndInit()
  $width = [int]$gray.PixelWidth
  $height = [int]$gray.PixelHeight
  $pixels = New-Object byte[] ($width * $height)
  [void]$gray.CopyPixels($pixels, $width, 0)

  $grid = New-Object double[] (32 * 32)
  for ($y = 0; $y -lt 32; $y += 1) {
    $sourceY = [Math]::Min($height - 1, [Math]::Floor($y * $height / 32))
    for ($x = 0; $x -lt 32; $x += 1) {
      $sourceX = [Math]::Min($width - 1, [Math]::Floor($x * $width / 32))
      $grid[$y * 32 + $x] = $pixels[$sourceY * $width + $sourceX]
    }
  }

  $coefficients = New-Object double[] 64
  for ($v = 0; $v -lt 8; $v += 1) {
    for ($u = 0; $u -lt 8; $u += 1) {
      $sum = 0.0
      for ($y = 0; $y -lt 32; $y += 1) {
        for ($x = 0; $x -lt 32; $x += 1) {
          $sum += $grid[$y * 32 + $x] * [Math]::Cos((2 * $x + 1) * $u * [Math]::PI / 64) * [Math]::Cos((2 * $y + 1) * $v * [Math]::PI / 64)
        }
      }
      $coefficients[$v * 8 + $u] = $sum
    }
  }

  $sorted = @($coefficients[1..63] | Sort-Object)
  $median = ($sorted[31] + $sorted[32]) / 2
  $bits = [System.Text.StringBuilder]::new()
  foreach ($coefficient in $coefficients) {
    [void]$bits.Append($(if ($coefficient -gt $median) { '1' } else { '0' }))
  }
  [pscustomobject]@{ hash = $bits.ToString(); scaledWidth = $width; scaledHeight = $height }
}

function Get-SignatureMime([byte[]]$Bytes) {
  if ($Bytes.Length -ge 3 -and $Bytes[0] -eq 0xff -and $Bytes[1] -eq 0xd8 -and $Bytes[2] -eq 0xff) { return 'image/jpeg' }
  $pngSignature = [byte[]](137, 80, 78, 71, 13, 10, 26, 10)
  if ($Bytes.Length -ge $pngSignature.Length) {
    $pngMatches = $true
    for ($index = 0; $index -lt $pngSignature.Length; $index += 1) {
      if ($Bytes[$index] -ne $pngSignature[$index]) { $pngMatches = $false; break }
    }
    if ($pngMatches) { return 'image/png' }
  }
  if ($Bytes.Length -ge 12 -and [System.Text.Encoding]::ASCII.GetString($Bytes[0..3]) -eq 'RIFF' -and [System.Text.Encoding]::ASCII.GetString($Bytes[8..11]) -eq 'WEBP') { return 'image/webp' }
  if ($Bytes.Length -ge 12 -and [System.Text.Encoding]::ASCII.GetString($Bytes[4..7]) -eq 'ftyp' -and @('avif', 'avis') -contains [System.Text.Encoding]::ASCII.GetString($Bytes[8..11])) { return 'image/avif' }
  return $null
}

function Get-SafeMimeFromExtension([string]$Extension) {
  switch ($Extension.ToLowerInvariant()) {
    '.jpg' { return 'image/jpeg' }
    '.jpeg' { return 'image/jpeg' }
    '.png' { return 'image/png' }
    '.webp' { return 'image/webp' }
    '.avif' { return 'image/avif' }
    default { return 'application/octet-stream' }
  }
}

$files = @(Get-ChildItem -LiteralPath $resolvedRoot -File -Recurse | Where-Object { $allowedExtensions -contains $_.Extension.ToLowerInvariant() } | Sort-Object FullName)
$entries = [System.Collections.Generic.List[object]]::new()
foreach ($file in $files) {
  $fullPath = [System.IO.Path]::GetFullPath($file.FullName)
  if (-not $fullPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'wp006b_inventory_path_escape' }
  $bytes = [System.IO.File]::ReadAllBytes($fullPath)
  $relative = $fullPath.Substring($resolvedRoot.Length).TrimStart([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar).Replace('\', '/')
  $frame = Get-WicFrame $fullPath
  $phash = Get-PHash $fullPath
  $candidateFolder = ($relative -split '/')[0]
  $signatureMime = Get-SignatureMime $bytes
  $safe = Get-SafeMetadata $bytes
  $entries.Add([pscustomobject]@{
    ownerProvidedName = $file.BaseName
    relativePath = $relative
    candidateFolderCategory = $candidateFolder
    contentSha256 = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash.ToLowerInvariant()
    byteSize = [int64]$file.Length
    extensionMime = Get-SafeMimeFromExtension $file.Extension
    signatureMime = $signatureMime
    mimeSignatureStatus = if ($signatureMime -eq (Get-SafeMimeFromExtension $file.Extension)) { 'MATCH' } else { 'MISMATCH_OR_UNKNOWN' }
    width = [int]$frame.PixelWidth
    height = [int]$frame.PixelHeight
    perceptualHash = $phash.hash
    perceptualHashAlgorithm = 'WIC_32PX_GRAYSCALE_DCT_64BIT_MEDIAN_V1'
    decoderScaledWidth = $phash.scaledWidth
    decoderScaledHeight = $phash.scaledHeight
    safeMetadata = $safe
    orientationTag = Get-OrientationTag $fullPath
  })
  $entry = $entries[$entries.Count - 1]
  $entry.safeMetadata = [pscustomobject]@{
    exifPresent = $safe.exifPresent
    xmpPresent = $safe.xmpPresent
    c2paPresent = $safe.c2paPresent
    encoderPresent = $safe.encoderPresent
    metadataAbsent = $safe.metadataAbsent
    safeKeys = [object[]]@($safe.safeKeys)
    orientationTag = $entry.orientationTag
    privacySensitiveMetadataFlags = [object[]]@($safe.privacySensitiveMetadataFlags)
  }
}

$hashGroups = @{}
foreach ($entry in $entries) {
  if (-not $hashGroups.ContainsKey($entry.contentSha256)) { $hashGroups[$entry.contentSha256] = [System.Collections.Generic.List[string]]::new() }
  $hashGroups[$entry.contentSha256].Add($entry.ownerProvidedName)
}

$nearest = @{}
$nearCandidates = [System.Collections.Generic.List[object]]::new()
for ($leftIndex = 0; $leftIndex -lt $entries.Count; $leftIndex += 1) {
  for ($rightIndex = $leftIndex + 1; $rightIndex -lt $entries.Count; $rightIndex += 1) {
    $leftHash = $entries[$leftIndex].perceptualHash
    $rightHash = $entries[$rightIndex].perceptualHash
    $distance = 0
    for ($bit = 0; $bit -lt [Math]::Min($leftHash.Length, $rightHash.Length); $bit += 1) {
      if ($leftHash[$bit] -ne $rightHash[$bit]) { $distance += 1 }
    }
    $distance += [Math]::Abs($leftHash.Length - $rightHash.Length)
    foreach ($name in @($entries[$leftIndex].ownerProvidedName, $entries[$rightIndex].ownerProvidedName)) {
      if (-not $nearest.ContainsKey($name) -or $distance -lt $nearest[$name]) { $nearest[$name] = $distance }
    }
    if ($distance -le 16) { $nearCandidates.Add([pscustomobject]@{ left = $entries[$leftIndex].ownerProvidedName; right = $entries[$rightIndex].ownerProvidedName; hammingDistance = $distance }) }
  }
}

foreach ($entry in $entries) {
  $matches = @($hashGroups[$entry.contentSha256])
  $entry | Add-Member -NotePropertyName exactDuplicateOf -NotePropertyValue $(if ($matches.Count -gt 1) { $matches | Where-Object { $_ -ne $entry.ownerProvidedName } | Select-Object -First 1 } else { $null })
  $entry | Add-Member -NotePropertyName exactDuplicateGroupSize -NotePropertyValue $matches.Count
  $entry | Add-Member -NotePropertyName nearestPerceptualDistance -NotePropertyValue $(if ($nearest.ContainsKey($entry.ownerProvidedName)) { [int]$nearest[$entry.ownerProvidedName] } else { $null })
}

$inventory = [pscustomobject]@{
  schemaVersion = 'lythaus-wp006b-owner-seed-inventory-v1'
  researchDate = $ResearchDate
  sourceRootLabel = 'external-owner-seed:wp004a-observer-v0/originals'
  originalFilesModified = $false
  rawMetadataPersisted = $false
  rawMediaPersisted = $false
  inventoryMethod = 'Windows WIC bounded decode plus SHA-256 and 64-bit grayscale DCT pHash; metadata values are not retained'
  perceptualHashThresholdBits = 16
  entries = @($entries)
  duplicateAnalysis = [pscustomobject]@{
    exactDuplicateFileCount = @($entries | Where-Object { $_.exactDuplicateGroupSize -gt 1 }).Count
    exactDuplicateGroups = @($hashGroups.GetEnumerator() | Where-Object { $_.Value.Count -gt 1 } | ForEach-Object { [pscustomobject]@{ contentSha256 = $_.Key; ownerProvidedNames = @($_.Value) } })
    nearDuplicateCandidates = @($nearCandidates)
    nearDuplicateCandidateCount = $nearCandidates.Count
    nearDuplicateDecision = if ($nearCandidates.Count -eq 0) { 'NONE_AT_THRESHOLD; NO_AUTOMATIC_FAMILY_MERGES' } else { 'MANUAL_REVIEW_REQUIRED' }
  }
}

$json = $inventory | ConvertTo-Json -Depth 20
if ($OutputPath) {
  $parent = Split-Path -Parent $OutputPath
  if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  Set-Content -LiteralPath $OutputPath -Value $json -Encoding utf8NoBOM
}
$json
