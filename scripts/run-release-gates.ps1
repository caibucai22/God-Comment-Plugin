Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$originalLocation = Get-Location
$transcriptStarted = $false

try {
    $projectRoot = Split-Path -Parent $PSScriptRoot
    Set-Location -LiteralPath $projectRoot

    $logDirectory = Join-Path -Path $projectRoot -ChildPath '.superpowers\logs'
    if (-not (Test-Path -LiteralPath $logDirectory -PathType Container)) {
        New-Item -ItemType Directory -Path $logDirectory | Out-Null
    }

    $logFileName = 'release-gates_执行命令说明_{0}_{1}.log' -f (Get-Date -Format 'yyyyMMdd_HHmmss_fff'), [guid]::NewGuid().ToString('N')
    $transcriptPath = Join-Path -Path $logDirectory -ChildPath $logFileName
    Start-Transcript -LiteralPath $transcriptPath -NoClobber | Out-Null
    $transcriptStarted = $true

    . (Join-Path -Path $projectRoot -ChildPath 'scripts\windows-node-env.ps1')
    Initialize-WindowsNodeEnvironment

    $nodeCommand = Get-Command -Name 'node.exe' -CommandType Application -ErrorAction Stop
    $nodeExecutable = $nodeCommand.Path
    if ([string]::IsNullOrWhiteSpace($nodeExecutable)) {
        throw 'Resolved node.exe does not provide an executable path.'
    }

    & $nodeExecutable (Join-Path -Path $projectRoot -ChildPath 'node_modules\vitest\vitest.mjs') --run
    if ($LASTEXITCODE -ne 0) {
        throw "Vitest release gate failed with exit code $LASTEXITCODE."
    }

    & $nodeExecutable (Join-Path -Path $projectRoot -ChildPath 'node_modules\typescript\bin\tsc') --noEmit
    if ($LASTEXITCODE -ne 0) {
        throw "TypeScript release gate failed with exit code $LASTEXITCODE."
    }

    & $nodeExecutable (Join-Path -Path $projectRoot -ChildPath 'node_modules\vite\bin\vite.js') build
    if ($LASTEXITCODE -ne 0) {
        throw "Vite build release gate failed with exit code $LASTEXITCODE."
    }

    & $nodeExecutable (Join-Path -Path $projectRoot -ChildPath 'node_modules\@playwright\test\cli.js') test
    if ($LASTEXITCODE -ne 0) {
        throw "Playwright release gate failed with exit code $LASTEXITCODE."
    }

    & git diff --check master...HEAD
    if ($LASTEXITCODE -ne 0) {
        throw "Git diff release gate failed with exit code $LASTEXITCODE."
    }

    Write-Host "Release gates passed. Transcript: $transcriptPath"
}
finally {
    if ($transcriptStarted) {
        Stop-Transcript | Out-Null
    }

    Set-Location -LiteralPath $originalLocation
}
