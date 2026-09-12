Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-ReleaseGateStatus {
    param(
        [string]$LogPath,
        [string]$Message
    )

    Write-Host $Message
    Add-Content -LiteralPath $LogPath -Value $Message -ErrorAction Stop
}

function Invoke-ReleaseGateStep {
    param(
        [string]$Name,
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$LogPath
    )

    Write-ReleaseGateStatus -LogPath $LogPath -Message "START: $Name"
    & $FilePath @ArgumentList 2>&1 | Tee-Object -FilePath $LogPath -Append | ForEach-Object { Write-Host $_ }
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        Write-ReleaseGateStatus -LogPath $LogPath -Message "FAIL: $Name (exit code $exitCode)"
        throw "$Name release gate failed with exit code $exitCode."
    }

    Write-ReleaseGateStatus -LogPath $LogPath -Message "PASS: $Name"
}

function Invoke-ReleaseGates {
    param(
        [AllowNull()][hashtable[]]$Steps,
        [AllowNull()][string]$LogDirectory,
        [switch]$SkipGitDiffCheck,
        [scriptblock]$LogFinalizer = {
            param($LogPath)
            Add-Content -LiteralPath $LogPath -Value 'FINISH: release gates.' -ErrorAction Stop
        }
    )

    $originalLocation = Get-Location
    $gateFailure = $null
    $logPath = $null

    try {
        $projectRoot = Split-Path -Parent $PSScriptRoot
        Set-Location -LiteralPath $projectRoot

        if ([string]::IsNullOrWhiteSpace($LogDirectory)) {
            $LogDirectory = Join-Path -Path $projectRoot -ChildPath '.superpowers\logs'
        }
        if (-not (Test-Path -LiteralPath $LogDirectory -PathType Container)) {
            New-Item -ItemType Directory -Path $LogDirectory -ErrorAction Stop | Out-Null
        }

        $logFileName = 'release-gates_执行命令说明_{0}_{1}.log' -f (Get-Date -Format 'yyyyMMdd_HHmmss_fff'), [guid]::NewGuid().ToString('N')
        $logPath = Join-Path -Path $LogDirectory -ChildPath $logFileName
        New-Item -ItemType File -Path $logPath -ErrorAction Stop | Out-Null
        Write-ReleaseGateStatus -LogPath $logPath -Message 'START: release gates'

        . (Join-Path -Path $projectRoot -ChildPath 'scripts\windows-node-env.ps1')
        Initialize-WindowsNodeEnvironment

        $nodeCommand = Get-Command -Name 'node.exe' -CommandType Application -ErrorAction Stop
        $nodeExecutable = $nodeCommand.Path
        if ([string]::IsNullOrWhiteSpace($nodeExecutable)) {
            throw 'Resolved node.exe does not provide an executable path.'
        }

        if ($null -eq $Steps) {
            $Steps = @(
                @{ Name = 'Vitest'; FilePath = $nodeExecutable; ArgumentList = @((Join-Path -Path $projectRoot -ChildPath 'node_modules\vitest\vitest.mjs'), '--run') },
                @{ Name = 'TypeScript'; FilePath = $nodeExecutable; ArgumentList = @((Join-Path -Path $projectRoot -ChildPath 'node_modules\typescript\bin\tsc'), '--noEmit') },
                @{ Name = 'Vite'; FilePath = $nodeExecutable; ArgumentList = @((Join-Path -Path $projectRoot -ChildPath 'node_modules\vite\bin\vite.js'), 'build') },
                @{ Name = 'Playwright'; FilePath = $nodeExecutable; ArgumentList = @((Join-Path -Path $projectRoot -ChildPath 'node_modules\@playwright\test\cli.js'), 'test') }
            )
        }

        foreach ($step in $Steps) {
            Invoke-ReleaseGateStep -Name $step.Name -FilePath $step.FilePath -ArgumentList $step.ArgumentList -LogPath $logPath
        }

        if (-not $SkipGitDiffCheck) {
            Invoke-ReleaseGateStep -Name 'Git diff check' -FilePath 'git' -ArgumentList @('diff', '--check', 'master...HEAD') -LogPath $logPath
        }

        Write-ReleaseGateStatus -LogPath $logPath -Message 'PASS: release gates'
        return [pscustomobject]@{ LogPath = $logPath }
    }
    catch {
        $gateFailure = $_
        throw
    }
    finally {
        $cleanupFailure = $null
        if (-not [string]::IsNullOrWhiteSpace($logPath) -and (Test-Path -LiteralPath $logPath -PathType Leaf)) {
            try {
                & $LogFinalizer $logPath
            }
            catch {
                $cleanupFailure = $_
                if ($null -ne $gateFailure) {
                    Write-Warning "Release-gate log finalization failed after the gate error: $($_.Exception.Message)"
                }
            }
        }

        try {
            Set-Location -LiteralPath $originalLocation
        }
        catch {
            if ($null -eq $cleanupFailure) {
                $cleanupFailure = $_
            }
            if ($null -ne $gateFailure) {
                Write-Warning "Release-gate working-directory restoration failed after the gate error: $($_.Exception.Message)"
            }
        }

        if ($null -eq $gateFailure -and $null -ne $cleanupFailure) {
            throw $cleanupFailure
        }
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    $result = Invoke-ReleaseGates
    Write-Host "Release gates passed. Log: $($result.LogPath)"
}
