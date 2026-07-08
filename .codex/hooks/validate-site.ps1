[CmdletBinding()]
param(
  [switch]$SkipRepoCheck
)

$ErrorActionPreference = "Stop"

function Invoke-Npm {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  & npm.cmd @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "npm.cmd $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

Push-Location (Resolve-Path "$PSScriptRoot\..\..")
try {
  Invoke-Npm -Arguments @("run", "site:check")
  Invoke-Npm -Arguments @("run", "site:build")

  if (-not $SkipRepoCheck) {
    Invoke-Npm -Arguments @("run", "check")
  }
}
finally {
  Pop-Location
}
