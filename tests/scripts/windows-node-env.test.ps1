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

function Get-FirstCommand {
    param(
        [System.Management.Automation.Language.CommandAst[]]$Commands,
        [scriptblock]$Predicate,
        [string]$Message
    )

    $matches = foreach ($candidate in $Commands) {
        if (& $Predicate $candidate) {
            $candidate
        }
    }
    $match = $matches | Sort-Object { $_.Extent.StartOffset } | Select-Object -First 1
    if ($null -eq $match) {
        throw $Message
    }

    return $match
}

function Assert-Precedes {
    param(
        [System.Management.Automation.Language.Ast]$Earlier,
        [System.Management.Automation.Language.Ast]$Later,
        [string]$Message
    )

    Assert-True -Condition ($Earlier.Extent.StartOffset -lt $Later.Extent.StartOffset) -Message $Message
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

$gateScript = Join-Path -Path $projectRoot -ChildPath 'scripts\run-release-gates.ps1'
if (-not (Test-Path -LiteralPath $gateScript -PathType Leaf)) {
    throw "Production script is missing: $gateScript"
}

$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($gateScript, [ref]$tokens, [ref]$parseErrors)
$parseErrorMessages = @($parseErrors | ForEach-Object { $_.Message })
Assert-True -Condition ($parseErrorMessages.Count -eq 0) -Message "Gate script contains PowerShell parse errors: $($parseErrorMessages -join '; ')"

$commands = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] }, $true))
$environmentSource = Get-FirstCommand -Commands $commands -Predicate {
    param($command)
    $command.InvocationOperator -eq [System.Management.Automation.Language.TokenKind]::Dot -and $command.Extent.Text -match 'windows-node-env\.ps1'
} -Message 'Gate script must dot-source windows-node-env.ps1.'
$initializer = Get-FirstCommand -Commands $commands -Predicate {
    param($command)
    $command.GetCommandName() -eq 'Initialize-WindowsNodeEnvironment'
} -Message 'Gate script must invoke Initialize-WindowsNodeEnvironment.'
$nodeResolution = Get-FirstCommand -Commands $commands -Predicate {
    param($command)
    $command.GetCommandName() -eq 'Get-Command' -and $command.Extent.Text -match 'node\.exe'
} -Message 'Gate script must resolve node.exe through Get-Command.'

Assert-Precedes -Earlier $environmentSource -Later $initializer -Message 'Environment initializer must run after the environment script is loaded.'
Assert-Precedes -Earlier $initializer -Later $nodeResolution -Message 'Environment initialization must happen before resolving node.exe.'

$entrypoints = @(
    @{ Name = 'Vitest'; Path = 'node_modules\\vitest\\vitest.mjs'; Argument = '--run' },
    @{ Name = 'TypeScript'; Path = 'node_modules\\typescript\\bin\\tsc'; Argument = '--noEmit' },
    @{ Name = 'Vite'; Path = 'node_modules\\vite\\bin\\vite.js'; Argument = 'build' },
    @{ Name = 'Playwright'; Path = 'node_modules\\@playwright\\test\\cli.js'; Argument = 'test' }
)
foreach ($entrypoint in $entrypoints) {
    $invocation = Get-FirstCommand -Commands $commands -Predicate {
        param($command)
        $command.InvocationOperator -eq [System.Management.Automation.Language.TokenKind]::Ampersand -and $command.Extent.Text -match $entrypoint.Path -and $command.Extent.Text -match [regex]::Escape($entrypoint.Argument)
    } -Message "Gate script must directly invoke the local $($entrypoint.Name) entrypoint with $($entrypoint.Argument)."
    Assert-Precedes -Earlier $nodeResolution -Later $invocation -Message "node.exe must be resolved before the local $($entrypoint.Name) entrypoint starts."
}

$gitDiffCheck = Get-FirstCommand -Commands $commands -Predicate {
    param($command)
    $command.GetCommandName() -eq 'git' -and $command.Extent.Text -match 'diff' -and $command.Extent.Text -match '--check' -and $command.Extent.Text -match 'master\.\.\.HEAD'
} -Message 'Gate script must run git diff --check master...HEAD.'
$lastExitCodeChecks = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.IfStatementAst] -and $node.Extent.Text -match '\$LASTEXITCODE' }, $true))
Assert-True -Condition ($lastExitCodeChecks.Count -ge 5) -Message 'Gate script must check $LASTEXITCODE after every Node and git process.'
Assert-Precedes -Earlier $gitDiffCheck -Later $lastExitCodeChecks[-1] -Message 'The git diff check must be followed by a $LASTEXITCODE check.'

Write-Host 'PASS: gate script initializes Windows environment before resolving Node and running local release tools.'
Write-Host 'PASS: gate script invokes all local release entrypoints and checks external-process exit codes.'
