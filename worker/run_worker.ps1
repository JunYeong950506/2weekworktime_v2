$ErrorActionPreference = "Stop"

$WorkerDir = $PSScriptRoot
$RootDir = Split-Path -Parent $WorkerDir
$Python = Join-Path $WorkerDir ".venv\Scripts\python.exe"
$LogDir = Join-Path $WorkerDir "debug"
$LogFile = Join-Path $LogDir "worker.log"

if (-not (Test-Path -LiteralPath $Python)) {
  throw "Worker Python venv not found: $Python"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location -LiteralPath $RootDir

& $Python -m cafe_ocr_worker.main *>> $LogFile
