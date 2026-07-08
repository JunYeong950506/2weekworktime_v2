$ErrorActionPreference = "Stop"

$Cmd = Join-Path $PSScriptRoot "run_worker.cmd"
if (-not (Test-Path -LiteralPath $Cmd)) {
  throw "Worker command file not found: $Cmd"
}

& $Cmd
