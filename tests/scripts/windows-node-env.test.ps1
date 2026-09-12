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

$validRoot = [Environment]::GetEnvironmentVariable('SystemRoot', 'Machine')
if ([string]::IsNullOrWhiteSpace($validRoot)) {
    $validRoot = [Environment]::GetFolderPath([Environment+SpecialFolder]::Windows)
}
if ([string]::IsNullOrWhiteSpace($validRoot)) {
    $validRoot = 'C:\Windows'
}

Assert-True -Condition (Test-Path -LiteralPath $validRoot -PathType Container) -Message "Test setup requires a valid Windows root, got '$validRoot'."
$validComSpec = Join-Path -Path $validRoot -ChildPath 'System32\cmd.exe'
Assert-True -Condition (Test-Path -LiteralPath $validComSpec -PathType Leaf) -Message "Test setup requires a valid command processor, got '$validComSpec'."

$variableNames = @('SystemRoot', 'WINDIR', 'ComSpec')
$originalValues = @{}
foreach ($name in $variableNames) {
    $originalValues[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
    foreach ($name in $variableNames) {
        Set-ProcessEnvironmentValue -Name $name -Value $null
    }

    Initialize-WindowsNodeEnvironment

    $restoredRoot = [Environment]::GetEnvironmentVariable('SystemRoot', 'Process')
    $restoredWindir = [Environment]::GetEnvironmentVariable('WINDIR', 'Process')
    $restoredComSpec = [Environment]::GetEnvironmentVariable('ComSpec', 'Process')

    Assert-True -Condition (-not [string]::IsNullOrWhiteSpace($restoredRoot)) -Message 'Initialize-WindowsNodeEnvironment did not restore SystemRoot.'
    Assert-Equal -Actual $restoredRoot -Expected $validRoot -Message 'SystemRoot must use the first valid configured Windows root.'
    Assert-True -Condition (Test-Path -LiteralPath $restoredRoot -PathType Container) -Message "SystemRoot '$restoredRoot' is not a valid directory."
    Assert-Equal -Actual $restoredWindir -Expected $restoredRoot -Message 'WINDIR must use the restored SystemRoot when it is absent.'
    Assert-Equal -Actual $restoredComSpec -Expected (Join-Path -Path $restoredRoot -ChildPath 'System32\cmd.exe') -Message 'ComSpec must use the restored SystemRoot when it is absent.'
    Assert-True -Condition (Test-Path -LiteralPath $restoredComSpec -PathType Leaf) -Message "ComSpec '$restoredComSpec' is not a valid file."
    Write-Host 'PASS: restores all missing process environment variables.'

    Set-ProcessEnvironmentValue -Name 'SystemRoot' -Value $validRoot
    Set-ProcessEnvironmentValue -Name 'WINDIR' -Value $validRoot
    Set-ProcessEnvironmentValue -Name 'ComSpec' -Value $validComSpec

    Initialize-WindowsNodeEnvironment

    Assert-Equal -Actual ([Environment]::GetEnvironmentVariable('SystemRoot', 'Process')) -Expected $validRoot -Message 'A valid SystemRoot sentinel must not be overwritten.'
    Assert-Equal -Actual ([Environment]::GetEnvironmentVariable('WINDIR', 'Process')) -Expected $validRoot -Message 'A valid WINDIR sentinel must not be overwritten.'
    Assert-Equal -Actual ([Environment]::GetEnvironmentVariable('ComSpec', 'Process')) -Expected $validComSpec -Message 'A valid ComSpec sentinel must not be overwritten.'
    Write-Host 'PASS: preserves valid process environment sentinels.'

    Set-ProcessEnvironmentValue -Name 'SystemRoot' -Value (Join-Path -Path $validRoot -ChildPath 'missing-system-root')
    Assert-Throws -Action { Initialize-WindowsNodeEnvironment } -ExpectedMessage 'SystemRoot'
    Write-Host 'PASS: rejects an invalid existing SystemRoot.'

    Set-ProcessEnvironmentValue -Name 'SystemRoot' -Value $validRoot
    Set-ProcessEnvironmentValue -Name 'ComSpec' -Value (Join-Path -Path $validRoot -ChildPath 'System32\missing-cmd.exe')
    Assert-Throws -Action { Initialize-WindowsNodeEnvironment } -ExpectedMessage 'ComSpec'
    Write-Host 'PASS: rejects an invalid existing ComSpec.'
}
finally {
    foreach ($name in $variableNames) {
        Set-ProcessEnvironmentValue -Name $name -Value $originalValues[$name]
    }
}
