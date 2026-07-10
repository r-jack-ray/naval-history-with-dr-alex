[CmdletBinding()]
param(
  [switch]$SkipRepoCheck,
  [switch]$RetainCallerLease,
  [int]$BacklogLimit = 25,
  [string]$LockToken,
  [ValidateRange(0, 300)]
  [int]$LockWaitSeconds = 30,
  [ValidateRange(1, 720)]
  [int]$LockStaleAfterMinutes = 90
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

function Invoke-Node {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  & node @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "node $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

$projectRoot = Resolve-Path "$PSScriptRoot\..\.."
$lockTool = Join-Path $projectRoot ".codex\hooks\site-content-pipeline-lock.mjs"
$previousLockToken = $env:CONTENT_PIPELINE_LOCK_TOKEN
$activeLockToken = $LockToken
$callerProvidedLock = -not [string]::IsNullOrWhiteSpace($activeLockToken)
$releaseLock = $callerProvidedLock

Push-Location $projectRoot
try {
  if ([string]::IsNullOrWhiteSpace($activeLockToken)) {
    $lockOutput = & node $lockTool "acquire" "--owner" "validate-content-pipeline:$PID" "--purpose" "content-validation" "--wait-ms" "$($LockWaitSeconds * 1000)" "--stale-after-ms" "$($LockStaleAfterMinutes * 60000)" "--recover-stale"
    if ($LASTEXITCODE -ne 0) {
      throw "Unable to acquire the content-pipeline writer lease."
    }
    $activeLockToken = (($lockOutput | Out-String) | ConvertFrom-Json).lease.token
    $releaseLock = $true
  }
  else {
    Invoke-Node -Arguments @($lockTool, "renew", "--token", $activeLockToken, "--stale-after-ms", "$($LockStaleAfterMinutes * 60000)")
  }

  $env:CONTENT_PIPELINE_LOCK_TOKEN = $activeLockToken

  Invoke-Npm -Arguments @("run", "build")
  Invoke-Node -Arguments @("dist/scripts/audit-site-content.js", "--limit", "$BacklogLimit")
  Invoke-Node -Arguments @("dist/scripts/generate-site-data.js")
  Invoke-Npm -Arguments @("run", "site:check:generated")

  if (-not $SkipRepoCheck) {
    Invoke-Npm -Arguments @("run", "check")
  }
}
finally {
  $retainActiveLock = $RetainCallerLease -and $callerProvidedLock
  if ($releaseLock -and -not $retainActiveLock -and -not [string]::IsNullOrWhiteSpace($activeLockToken)) {
    & node $lockTool "release" "--token" $activeLockToken | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Unable to release content-pipeline writer lease $activeLockToken. Inspect it with node .codex/hooks/site-content-pipeline-lock.mjs status."
    }
  }

  if ($null -eq $previousLockToken) {
    Remove-Item Env:CONTENT_PIPELINE_LOCK_TOKEN -ErrorAction SilentlyContinue
  }
  else {
    $env:CONTENT_PIPELINE_LOCK_TOKEN = $previousLockToken
  }
  Pop-Location
}
