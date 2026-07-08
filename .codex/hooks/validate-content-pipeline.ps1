[CmdletBinding()]
param(
  [switch]$SkipRepoCheck,
  [int]$BacklogLimit = 25
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
  Invoke-Npm -Arguments @("run", "audit:site-content", "--", "--limit", "$BacklogLimit")
  Invoke-Npm -Arguments @("run", "generate:site-data")
  Invoke-Npm -Arguments @("run", "site:check")

  if (-not $SkipRepoCheck) {
    Invoke-Npm -Arguments @("run", "check")
  }
}
finally {
  Pop-Location
}
