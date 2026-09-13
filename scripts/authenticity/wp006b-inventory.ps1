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
  $cameraMake = (Test-AsciiPattern $Bytes 'Make') -or (Test-AsciiPattern $Bytes 'camera make')
  $cameraModel = (Test-AsciiPattern $Bytes 'Model') -or (Test-AsciiPattern $Bytes 'camera model')
  $captureTimestamp = (Test-AsciiPattern $Bytes 'DateTimeOriginal') -or (Test-AsciiPattern $Bytes 'DateTimeDigitized')
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
     cameraMakePresent = $cameraMake
     cameraModelPresent = $cameraModel
     captureTimestampPresent = $captureTimestamp
   }
}

function Get-ExifAsciiProperty([string]$Path, [int]$PropertyId) {
  $image = $null
  try {
    $image = [System.Drawing.Image]::FromFile($Path)
    $item = $image.GetPropertyItem($PropertyId)
    if ($null -eq $item -or $item.Value.Length -eq 0) { return $null }
    $text = [System.Text.Encoding]::UTF8.GetString($item.Value).Trim([char]0, [char]9, [char]10, [char]13, [char]32)
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    return ($text -replace '[^\p{L}\p{N}._+() -]', '').Trim()
  } catch {
    return $null
  } finally {
    if ($null -ne $image) { $image.Dispose() }
  }
}

function Get-CameraDeviceFamily([string]$Path) {
  $make = Get-ExifAsciiProperty $Path 271
  $model = Get-ExifAsciiProperty $Path 272
  if ([string]::IsNullOrWhiteSpace($make) -and [string]::IsNullOrWhiteSpace($model)) { return $null }
  $parts = @($make, $model) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  $family = ($parts -join ' ').Trim()
  if ([string]::IsNullOrWhiteSpace($family)) { return $null }
  if ($family.Length -gt 96) { $family = $family.Substring(0, 96).Trim() }
  return $family
}

function Get-BoundedBytes([string]$Path, [int64]$MaxBytes = 1048576) {
  $stream = $null
  try {
    $stream = [System.IO.File]::OpenRead($Path)
    $length = [int][Math]::Min($MaxBytes, $stream.Length)
    $bytes = New-Object byte[] $length
    $offset = 0
    while ($offset -lt $length) {
      $read = $stream.Read($bytes, $offset, $length - $offset)
      if ($read -le 0) { break }
      $offset += $read
    }
    if ($offset -lt $length) {
      if ($offset -eq 0) { return [byte[]]@() }
      return $bytes[0..($offset - 1)]
    }
    return $bytes
  } finally {
    if ($null -ne $stream) { $stream.Dispose() }
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
  if ($Bytes.Length -ge 12 -and [System.Text.Encoding]::ASCII.GetString($Bytes[4..7]) -eq 'ftyp' -and @('isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'MSNV') -contains [System.Text.Encoding]::ASCII.GetString($Bytes[8..11])) { return 'video/mp4' }
  if ($Bytes.Length -ge 4 -and $Bytes[0] -eq 0x1a -and $Bytes[1] -eq 0x45 -and $Bytes[2] -eq 0xdf -and $Bytes[3] -eq 0xa3) { return 'video/webm' }
  return $null
}

function Get-SafeMimeFromExtension([string]$Extension) {
  switch ($Extension.ToLowerInvariant()) {
    '.jpg' { return 'image/jpeg' }
    '.jpeg' { return 'image/jpeg' }
    '.png' { return 'image/png' }
    '.webp' { return 'image/webp' }
    '.avif' { return 'image/avif' }
    '.mp4' { return 'video/mp4' }
    '.mov' { return 'video/quicktime' }
    '.m4v' { return 'video/x-m4v' }
    '.avi' { return 'video/x-msvideo' }
    '.webm' { return 'video/webm' }
    '.mkv' { return 'video/x-matroska' }
    '.3gp' { return 'video/3gpp' }
    default { return 'application/octet-stream' }
  }
}

$allowedVideoExtensions = @('.mp4', '.mov', '.m4v', '.avi', '.webm', '.mkv', '.3gp')
$files = @(Get-ChildItem -LiteralPath $resolvedRoot -File -Recurse | Where-Object { ($allowedExtensions -contains $_.Extension.ToLowerInvariant()) -or ($allowedVideoExtensions -contains $_.Extension.ToLowerInvariant()) } | Sort-Object FullName)
$entries = [System.Collections.Generic.List[object]]::new()
foreach ($file in $files) {
  $fullPath = [System.IO.Path]::GetFullPath($file.FullName)
  if (-not $fullPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'wp006b_inventory_path_escape' }
  $relative = $fullPath.Substring($resolvedRoot.Length).TrimStart([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar).Replace('\', '/')
  $candidateFolder = ($relative -split '/')[0]
  $isImage = $allowedExtensions -contains $file.Extension.ToLowerInvariant()
  $bytes = if ($isImage) { [System.IO.File]::ReadAllBytes($fullPath) } else { Get-BoundedBytes $fullPath }
  $frame = $null
  $phash = $null
  $deviceFamily = $null
  if ($isImage) {
    $frame = Get-WicFrame $fullPath
    $phash = Get-PHash $fullPath
    $deviceFamily = if ($candidateFolder -eq 'camera') { Get-CameraDeviceFamily $fullPath } else { $null }
  }
  $signatureMime = Get-SignatureMime $bytes
  $safe = Get-SafeMetadata $bytes
  $entries.Add([pscustomobject]@{
    ownerProvidedName = $file.BaseName
    relativePath = $relative
    candidateFolderCategory = $candidateFolder
    mediaType = if ($isImage) { 'image' } else { 'video' }
    contentSha256 = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash.ToLowerInvariant()
    byteSize = [int64]$file.Length
    extensionMime = Get-SafeMimeFromExtension $file.Extension
    signatureMime = $signatureMime
    mimeSignatureStatus = if ($signatureMime -eq (Get-SafeMimeFromExtension $file.Extension)) { 'MATCH' } else { 'MISMATCH_OR_UNKNOWN' }
    width = if ($isImage) { [int]$frame.PixelWidth } else { $null }
    height = if ($isImage) { [int]$frame.PixelHeight } else { $null }
    perceptualHash = if ($isImage) { $phash.hash } else { $null }
    perceptualHashAlgorithm = if ($isImage) { 'WIC_32PX_GRAYSCALE_DCT_64BIT_MEDIAN_V1' } else { $null }
    decoderScaledWidth = if ($isImage) { $phash.scaledWidth } else { $null }
    decoderScaledHeight = if ($isImage) { $phash.scaledHeight } else { $null }
    cameraDeviceFamily = $deviceFamily
    safeMetadata = $safe
    orientationTag = if ($isImage) { Get-OrientationTag $fullPath } else { $null }
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
    cameraMakePresent = [bool]$safe.cameraMakePresent
    cameraModelPresent = [bool]$safe.cameraModelPresent
    captureTimestampPresent = [bool]$safe.captureTimestampPresent
  }
}

$nameGroups = @{}
foreach ($entry in $entries) {
  if (-not $nameGroups.ContainsKey($entry.ownerProvidedName)) { $nameGroups[$entry.ownerProvidedName] = [System.Collections.Generic.List[object]]::new() }
  $nameGroups[$entry.ownerProvidedName].Add($entry)
}
foreach ($group in $nameGroups.GetEnumerator()) {
  if ($group.Value.Count -le 1) { continue }
  foreach ($entry in $group.Value) {
    $entry.ownerProvidedName = "$($entry.ownerProvidedName)__$( $entry.contentSha256.Substring(0, 10) )"
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
    if ([string]::IsNullOrWhiteSpace($leftHash) -or [string]::IsNullOrWhiteSpace($rightHash)) { continue }
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
  schemaVersion = 'lythaus-wp006b-owner-pool-inventory-v2'
  researchDate = $ResearchDate
  sourceRootLabel = 'external-owner-seed:wp004a-observer-v0/originals'
  originalFilesModified = $false
  rawMetadataPersisted = $false
  rawMediaPersisted = $false
  inventoryMethod = 'Windows WIC bounded image decode plus SHA-256 and 64-bit grayscale DCT pHash; videos are hash-only and no frames are extracted; metadata values are not retained except a sanitized camera device family'
  perceptualHashThresholdBits = 16
  entries = @($entries)
  counts = [pscustomobject]@{
    files = $entries.Count
    images = @($entries | Where-Object { $_.mediaType -eq 'image' }).Count
    videos = @($entries | Where-Object { $_.mediaType -eq 'video' }).Count
    cameraImages = @($entries | Where-Object { $_.candidateFolderCategory -eq 'camera' -and $_.mediaType -eq 'image' }).Count
    syntheticImages = @($entries | Where-Object { $_.candidateFolderCategory -eq 'synthetic' -and $_.mediaType -eq 'image' }).Count
    hardNegativeImages = @($entries | Where-Object { $_.candidateFolderCategory -eq 'hard-negative' -and $_.mediaType -eq 'image' }).Count
    mixedOriginImages = @($entries | Where-Object { $_.candidateFolderCategory -eq 'mixed-origin' -and $_.mediaType -eq 'image' }).Count
  }
  duplicateAnalysis = [pscustomobject]@{
    exactDuplicateFileCount = @($entries | Where-Object { $_.exactDuplicateGroupSize -gt 1 }).Count
    exactDuplicateGroups = @($hashGroups.GetEnumerator() | Where-Object { $_.Value.Count -gt 1 } | ForEach-Object { [pscustomobject]@{ contentSha256 = $_.Key; ownerProvidedNames = @($_.Value) } })
    nearDuplicateCandidates = @($nearCandidates)
    nearDuplicateCandidateCount = $nearCandidates.Count
    nearDuplicateDecision = if ($nearCandidates.Count -eq 0) { 'NONE_AT_THRESHOLD; NO_AUTOMATIC_FAMILY_MERGES' } else { 'CONSERVATIVE_SOURCE_FAMILY_GROUPING_REQUIRED_BEFORE_SPLIT' }
  }
}

$json = $inventory | ConvertTo-Json -Depth 20
if ($OutputPath) {
  $parent = Split-Path -Parent $OutputPath
  if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  Set-Content -LiteralPath $OutputPath -Value $json -Encoding utf8NoBOM
}
$json
