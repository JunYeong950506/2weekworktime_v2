$ErrorActionPreference = "Stop"

$WorkerDir = $PSScriptRoot
$RootDir = Split-Path -Parent $WorkerDir
$Python = Join-Path $WorkerDir ".venv\Scripts\python.exe"
$WorkerDebugDir = Join-Path $WorkerDir "debug"
$LogFile = Join-Path $WorkerDebugDir "worker.log"
$RootDebugDir = Join-Path $RootDir "debug"
$KoreaTimeZone = [TimeZoneInfo]::FindSystemTimeZoneById("Korea Standard Time")

if (-not (Test-Path -LiteralPath $Python)) {
  throw "Worker Python executable not found: $Python"
}

function Get-KoreaNow {
  return [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $KoreaTimeZone)
}

function Test-CaptureWindow([DateTime]$Now) {
  $isWeekday = $Now.DayOfWeek -ne [DayOfWeek]::Saturday -and $Now.DayOfWeek -ne [DayOfWeek]::Sunday
  return $isWeekday -and $Now.TimeOfDay -ge [TimeSpan]::FromHours(6) -and $Now.TimeOfDay -lt [TimeSpan]::FromHours(17)
}

function Get-NextCaptureStart([DateTime]$Now) {
  $nextStart = $Now.Date.AddHours(6)
  if ($Now -ge $nextStart) {
    $nextStart = $nextStart.AddDays(1)
  }

  while ($nextStart.DayOfWeek -eq [DayOfWeek]::Saturday -or $nextStart.DayOfWeek -eq [DayOfWeek]::Sunday) {
    $nextStart = $nextStart.AddDays(1)
  }

  return $nextStart
}

function Clear-DirectoryContents([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  Get-ChildItem -LiteralPath $Path -Force | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
}

function Clear-DebugArtifacts {
  Clear-DirectoryContents $RootDebugDir
  Clear-DirectoryContents $WorkerDebugDir
}

while ($true) {
  $now = Get-KoreaNow
  if (-not (Test-CaptureWindow $now)) {
    Clear-DebugArtifacts
    $nextStart = Get-NextCaptureStart $now
    $sleepSeconds = [Math]::Max(1, [Math]::Ceiling(($nextStart - $now).TotalSeconds))
    Start-Sleep -Seconds $sleepSeconds
    continue
  }

  New-Item -ItemType Directory -Path $WorkerDebugDir -Force | Out-Null
  Push-Location $RootDir
  try {
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      & $Python -m cafe_ocr_worker.main *>> $LogFile
      $exitCode = $LASTEXITCODE
    }
    finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
  }
  finally {
    Pop-Location
  }

  if (-not (Test-CaptureWindow (Get-KoreaNow))) {
    Clear-DebugArtifacts
    continue
  }

  if ($exitCode -ne 0) {
    Start-Sleep -Seconds 30
  }
  else {
    Start-Sleep -Seconds 5
  }
}
