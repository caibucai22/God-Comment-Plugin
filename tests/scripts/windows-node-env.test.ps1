Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$productionScript = Join-Path -Path $projectRoot -ChildPath 'scripts\windows-node-env.ps1'

if (-not (Test-Path -LiteralPath $productionScript -PathType Leaf)) {
    throw "Production script is missing: $productionScript"
}

. $productionScript

function Assert-Equal {
    param(
        [AllowNull()][string]$Actual,
        [AllowNull()][string]$Expected,
        [string]$Message
    )

    if ($Actual -cne $Expected) {
        throw "$Message Expected '$Expected', got '$Actual'."
    }
}

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

function Assert-Throws {
    param(
        [scriptblock]$Action,
        [string]$ExpectedMessage
    )

    try {
        & $Action
    }
    catch {
        Assert-True -Condition $_.Exception.Message.Contains($ExpectedMessage) -Message "Expected an error containing '$ExpectedMessage', got '$($_.Exception.Message)'."
        return
    }

    throw "Expected an error containing '$ExpectedMessage', but no error was thrown."
}

function Set-ProcessEnvironmentValue {
    param(
        [string]$Name,
        [AllowNull()]$Value
    )

    $environmentPath = 'Env:' + $Name
    if ($null -eq $Value) {
        Remove-Item -LiteralPath $environmentPath -ErrorAction SilentlyContinue
        return
    }

    Set-Item -LiteralPath $environmentPath -Value $Value
}

if (-not $IsWindows) {
    Write-Host 'SKIP: Windows-only environment initializer tests.'
    exit 0
}

$fallbackRoot = 'C:\Windows'
$machineRootCandidate = Join-Path -Path $fallbackRoot -ChildPath '.'
$specialFolderRootCandidate = Join-Path -Path $fallbackRoot -ChildPath 'System32\..'
$invalidRoot = Join-Path -Path $fallbackRoot -ChildPath 'missing-system-root'
$validComSpec = Join-Path -Path $fallbackRoot -ChildPath 'System32\cmd.exe'
$comSpecSentinel = Join-Path -Path $fallbackRoot -ChildPath 'System32\.\cmd.exe'

Assert-True -Condition (Test-Path -LiteralPath $fallbackRoot -PathType Container) -Message "Test setup requires the C:\\Windows fallback, got '$fallbackRoot'."
Assert-True -Condition (Test-Path -LiteralPath $validComSpec -PathType Leaf) -Message "Test setup requires a valid command processor, got '$validComSpec'."
Assert-True -Condition (Test-Path -LiteralPath $machineRootCandidate -PathType Container) -Message "Test setup requires a valid machine root candidate, got '$machineRootCandidate'."
Assert-True -Condition (Test-Path -LiteralPath $specialFolderRootCandidate -PathType Container) -Message "Test setup requires a valid special-folder root candidate, got '$specialFolderRootCandidate'."
Assert-True -Condition (Test-Path -LiteralPath $comSpecSentinel -PathType Leaf) -Message "Test setup requires a valid ComSpec sentinel, got '$comSpecSentinel'."
Assert-True -Condition ($machineRootCandidate -cne $fallbackRoot) -Message 'Machine candidate must be string-distinct from the fallback.'
Assert-True -Condition ($specialFolderRootCandidate -cne $fallbackRoot) -Message 'Special-folder candidate must be string-distinct from the fallback.'
Assert-True -Condition ($comSpecSentinel -cne $validComSpec) -Message 'ComSpec sentinel must be string-distinct from the generated default.'

Assert-Equal -Actual (Resolve-WindowsNodeEnvironmentRoot -MachineRoot $machineRootCandidate -SpecialFolderRoot $specialFolderRootCandidate -FallbackRoot $fallbackRoot) -Expected $machineRootCandidate -Message 'The machine-level root must be preferred when valid.'
Assert-Equal -Actual (Resolve-WindowsNodeEnvironmentRoot -MachineRoot $invalidRoot -SpecialFolderRoot $specialFolderRootCandidate -FallbackRoot $fallbackRoot) -Expected $specialFolderRootCandidate -Message 'The special-folder root must be used when the machine-level root is invalid.'
Assert-Equal -Actual (Resolve-WindowsNodeEnvironmentRoot -MachineRoot $invalidRoot -SpecialFolderRoot $invalidRoot -FallbackRoot $fallbackRoot) -Expected $fallbackRoot -Message 'The C:\\Windows fallback must be used when earlier candidates are invalid.'
Write-Host 'PASS: resolves machine, special-folder, then C:\\Windows candidates in order.'

$variableNames = @('SystemRoot', 'WINDIR', 'ComSpec')
$originalValues = @{}
foreach ($name in $variableNames) {
    $originalValues[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
    foreach ($name in $variableNames) {
        Set-ProcessEnvironmentValue -Name $name -Value $null
    }

    Initialize-WindowsNodeEnvironment -MachineRoot $invalidRoot -SpecialFolderRoot $specialFolderRootCandidate -FallbackRoot $fallbackRoot

    $restoredRoot = [Environment]::GetEnvironmentVariable('SystemRoot', 'Process')
    $restoredWindir = [Environment]::GetEnvironmentVariable('WINDIR', 'Process')
    $restoredComSpec = [Environment]::GetEnvironmentVariable('ComSpec', 'Process')

    Assert-True -Condition (-not [string]::IsNullOrWhiteSpace($restoredRoot)) -Message 'Initialize-WindowsNodeEnvironment did not restore SystemRoot.'
    Assert-Equal -Actual $restoredRoot -Expected $specialFolderRootCandidate -Message 'SystemRoot must use the injected special-folder root after an invalid machine root.'
    Assert-True -Condition (Test-Path -LiteralPath $restoredRoot -PathType Container) -Message "SystemRoot '$restoredRoot' is not a valid directory."
    Assert-Equal -Actual $restoredWindir -Expected $restoredRoot -Message 'WINDIR must use the restored SystemRoot when it is absent.'
    Assert-Equal -Actual $restoredComSpec -Expected (Join-Path -Path $restoredRoot -ChildPath 'System32\cmd.exe') -Message 'ComSpec must use the restored SystemRoot when it is absent.'
    Assert-True -Condition (Test-Path -LiteralPath $restoredComSpec -PathType Leaf) -Message "ComSpec '$restoredComSpec' is not a valid file."
    Write-Host 'PASS: restores all missing process environment variables.'

    Set-ProcessEnvironmentValue -Name 'SystemRoot' -Value $machineRootCandidate
    Set-ProcessEnvironmentValue -Name 'WINDIR' -Value $specialFolderRootCandidate
    Set-ProcessEnvironmentValue -Name 'ComSpec' -Value $comSpecSentinel

    Initialize-WindowsNodeEnvironment -MachineRoot $invalidRoot -SpecialFolderRoot $fallbackRoot -FallbackRoot $fallbackRoot

    Assert-Equal -Actual ([Environment]::GetEnvironmentVariable('SystemRoot', 'Process')) -Expected $machineRootCandidate -Message 'A valid SystemRoot sentinel must not be overwritten.'
    Assert-Equal -Actual ([Environment]::GetEnvironmentVariable('WINDIR', 'Process')) -Expected $specialFolderRootCandidate -Message 'A valid WINDIR sentinel must not be overwritten.'
    Assert-Equal -Actual ([Environment]::GetEnvironmentVariable('ComSpec', 'Process')) -Expected $comSpecSentinel -Message 'A valid ComSpec sentinel must not be overwritten.'
    Write-Host 'PASS: preserves valid process environment sentinels.'

    Set-ProcessEnvironmentValue -Name 'SystemRoot' -Value $invalidRoot
    Assert-Throws -Action { Initialize-WindowsNodeEnvironment } -ExpectedMessage 'SystemRoot'
    Write-Host 'PASS: rejects an invalid existing SystemRoot.'

    Set-ProcessEnvironmentValue -Name 'SystemRoot' -Value $fallbackRoot
    Set-ProcessEnvironmentValue -Name 'ComSpec' -Value (Join-Path -Path $fallbackRoot -ChildPath 'System32\missing-cmd.exe')
    Assert-Throws -Action { Initialize-WindowsNodeEnvironment } -ExpectedMessage 'ComSpec'
    Write-Host 'PASS: rejects an invalid existing ComSpec.'

    Set-ProcessEnvironmentValue -Name 'ComSpec' -Value $validComSpec
    Set-ProcessEnvironmentValue -Name 'WINDIR' -Value $projectRoot
    Assert-Throws -Action { Initialize-WindowsNodeEnvironment } -ExpectedMessage 'WINDIR'
    Assert-Equal -Actual ([Environment]::GetEnvironmentVariable('WINDIR', 'Process')) -Expected $projectRoot -Message 'An invalid WINDIR value must remain unchanged after rejection.'
    Write-Host 'PASS: rejects an existing WINDIR ordinary directory.'
}
finally {
    foreach ($name in $variableNames) {
        Set-ProcessEnvironmentValue -Name $name -Value $originalValues[$name]
    }
}
