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

function Get-ReleaseGateFunction {
    param(
        [System.Management.Automation.Language.Ast]$Ast,
        [string]$Name
    )

    $function = $Ast.Find({
        param($node)
        $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $Name
    }, $true)
    if ($null -eq $function) {
        throw "Gate script must define $Name for controllable release-gate execution."
    }

    return $function
}

function Get-HashtableValueText {
    param(
        [System.Management.Automation.Language.HashtableAst]$Hashtable,
        [string]$Key
    )

    $pair = $Hashtable.KeyValuePairs | Where-Object { $_.Item1.Extent.Text -eq $Key } | Select-Object -First 1
    if ($null -eq $pair) {
        throw "Release step is missing the $Key field."
    }

    return $pair.Item2.Extent.Text
}

function Assert-ReleaseGateStructure {
    param([string]$ScriptText)

    $tokens = $null
    $parseErrors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseInput($ScriptText, [ref]$tokens, [ref]$parseErrors)
    $parseErrorMessages = @($parseErrors | ForEach-Object { $_.Message })
    Assert-True -Condition ($parseErrorMessages.Count -eq 0) -Message "Gate script contains PowerShell parse errors: $($parseErrorMessages -join '; ')"

    $invokeGate = Get-ReleaseGateFunction -Ast $ast -Name 'Invoke-ReleaseGates'
    $invokeStep = Get-ReleaseGateFunction -Ast $ast -Name 'Invoke-ReleaseGateStep'

    $commands = @($invokeGate.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] }, $true))
    $environmentSource = Get-FirstCommand -Commands $commands -Predicate {
        param($command)
        $command.InvocationOperator -eq [System.Management.Automation.Language.TokenKind]::Dot -and $command.Extent.Text -match 'windows-node-env\.ps1'
    } -Message 'Gate script must dot-source windows-node-env.ps1.'
    $initializer = Get-FirstCommand -Commands $commands -Predicate {
        param($command)
        $command.GetCommandName() -eq 'Initialize-WindowsNodeEnvironment'
    } -Message 'Gate script must invoke Initialize-WindowsNodeEnvironment.'
    $npmResolution = Get-FirstCommand -Commands $commands -Predicate {
        param($command)
        $command.GetCommandName() -eq 'Get-Command' -and $command.Extent.Text -match 'npm\.cmd'
    } -Message 'Gate script must resolve npm.cmd through Get-Command.'
    Assert-Precedes -Earlier $environmentSource -Later $initializer -Message 'Environment initialization script must be loaded before it is invoked.'
    Assert-Precedes -Earlier $initializer -Later $npmResolution -Message 'Environment initialization must happen before resolving npm.cmd.'

    $entrypoints = @(
        @{ Name = 'Vitest'; Script = 'test:ci' },
        @{ Name = 'TypeScript'; Script = 'typecheck' },
        @{ Name = 'Vite'; Script = 'build' },
        @{ Name = 'Production package audit'; Script = 'audit:production' },
        @{ Name = 'Playwright'; Script = 'test:e2e' }
    )
    $releaseSteps = @($invokeGate.FindAll({ param($node) $node -is [System.Management.Automation.Language.HashtableAst] }, $true))
    $releaseStepByName = @{}
    foreach ($entrypoint in $entrypoints) {
        $step = $releaseSteps | Where-Object {
            $namePair = $_.KeyValuePairs | Where-Object { $_.Item1.Extent.Text -eq 'Name' } | Select-Object -First 1
            $null -ne $namePair -and $namePair.Item2.Extent.Text.Trim("'") -ceq $entrypoint.Name
        } | Select-Object -First 1
        if ($null -eq $step) {
            throw "Gate script must define the local $($entrypoint.Name) release step."
        }

        Assert-Equal -Actual (Get-HashtableValueText -Hashtable $step -Key 'FilePath') -Expected '$npmExecutable' -Message "$($entrypoint.Name) must be invoked by the resolved npm.cmd."
        $arguments = Get-HashtableValueText -Hashtable $step -Key 'ArgumentList'
        Assert-True -Condition ($arguments -match "'run'") -Message "$($entrypoint.Name) must invoke an npm script."
        Assert-True -Condition ($arguments -match [regex]::Escape($entrypoint.Script)) -Message "$($entrypoint.Name) must invoke npm script $($entrypoint.Script)."
        $releaseStepByName[$entrypoint.Name] = $step
    }
    Assert-Precedes -Earlier $releaseStepByName['Vite'] -Later $releaseStepByName['Production package audit'] -Message 'Production package audit must run after Vite.'
    Assert-Precedes -Earlier $releaseStepByName['Production package audit'] -Later $releaseStepByName['Playwright'] -Message 'Production package audit must run before Playwright.'

    $gitDiffCheck = Get-FirstCommand -Commands $commands -Predicate {
        param($command)
        $command.GetCommandName() -eq 'Invoke-ReleaseGateStep' -and
            $command.Extent.Text -match "Name 'Git diff check'" -and
            $command.Extent.Text -match "FilePath 'git'" -and
            $command.Extent.Text -match "master\.\.\.HEAD"
    } -Message 'Gate script must run git diff --check master...HEAD through the checked release-step helper.'
    Assert-Precedes -Earlier $npmResolution -Later $gitDiffCheck -Message 'Git diff check must run after npm resolution and the npm release steps.'

    $processInvocation = Get-FirstCommand -Commands @($invokeStep.FindAll({
        param($node)
        $node -is [System.Management.Automation.Language.CommandAst] -and
            $node.InvocationOperator -eq [System.Management.Automation.Language.TokenKind]::Ampersand -and
            $node.Extent.Text -match '\$FilePath'
    }, $true)) -Predicate { param($command) $true } -Message 'Release-step helper must invoke the supplied external file path.'
    $exitAssignment = $invokeStep.Find({
        param($node)
        $node -is [System.Management.Automation.Language.AssignmentStatementAst] -and
            $node.Extent.Text -match '^\s*\$exitCode\s*=\s*\$LASTEXITCODE\s*$'
    }, $true)
    if ($null -eq $exitAssignment) {
        throw 'Release-step helper must bind $LASTEXITCODE immediately after its external process.'
    }
    Assert-Precedes -Earlier $processInvocation -Later $exitAssignment -Message '$LASTEXITCODE must be read after the external process.'
    $pipelineStatement = $processInvocation.Parent
    $pipelineBlock = $pipelineStatement.Parent
    Assert-True -Condition ($pipelineStatement -is [System.Management.Automation.Language.PipelineAst]) -Message 'Release-step helper must run the external process in a pipeline statement.'
    Assert-True -Condition ($pipelineBlock -is [System.Management.Automation.Language.NamedBlockAst]) -Message 'Release-step helper pipeline must belong to a named block.'
    $statementIndex = [array]::IndexOf($pipelineBlock.Statements, $pipelineStatement)
    Assert-True -Condition ($statementIndex -ge 0 -and $statementIndex + 1 -lt $pipelineBlock.Statements.Count) -Message '$LASTEXITCODE check must immediately follow its external process statement.'
    Assert-True -Condition ($pipelineBlock.Statements[$statementIndex + 1] -eq $exitAssignment) -Message '$LASTEXITCODE check must be adjacent to its external process invocation.'

    $exitFailure = $invokeStep.Find({
        param($node)
        $node -is [System.Management.Automation.Language.IfStatementAst] -and $node.Extent.Text -match '\$exitCode\s*-ne\s*0'
    }, $true)
    if ($null -eq $exitFailure) {
        throw 'Release-step helper must reject a non-zero bound exit code.'
    }
}

$gateText = Get-Content -Raw -LiteralPath $gateScript
Assert-ReleaseGateStructure -ScriptText $gateText

$wrongViteCaller = $gateText.Replace("Name = 'Vite'; FilePath = `$npmExecutable", "Name = 'Vite'; FilePath = 'vite'")
Assert-True -Condition ($wrongViteCaller -cne $gateText) -Message 'Vite caller mutation did not change the gate source.'
Assert-Throws -Action { Assert-ReleaseGateStructure -ScriptText $wrongViteCaller } -ExpectedMessage 'Vite must be invoked by the resolved npm.cmd'

$wrongAuditCaller = $gateText.Replace("Name = 'Production package audit'; FilePath = `$npmExecutable", "Name = 'Production package audit'; FilePath = 'node'")
Assert-True -Condition ($wrongAuditCaller -cne $gateText) -Message 'Production package audit caller mutation did not change the gate source.'
Assert-Throws -Action { Assert-ReleaseGateStructure -ScriptText $wrongAuditCaller } -ExpectedMessage 'Production package audit must be invoked by the resolved npm.cmd'

$missingExitBinding = $gateText.Replace('$exitCode = $LASTEXITCODE', '$exitCode = 0')
Assert-True -Condition ($missingExitBinding -cne $gateText) -Message 'Exit-code mutation did not change the gate source.'
Assert-Throws -Action { Assert-ReleaseGateStructure -ScriptText $missingExitBinding } -ExpectedMessage 'bind $LASTEXITCODE immediately'

$interveningAssignment = $gateText.Replace('$exitCode = $LASTEXITCODE', "`$intermediate = 1`r`n    `$exitCode = `$LASTEXITCODE")
Assert-True -Condition ($interveningAssignment -cne $gateText) -Message 'Intervening-assignment mutation did not change the gate source.'
Assert-Throws -Action { Assert-ReleaseGateStructure -ScriptText $interveningAssignment } -ExpectedMessage 'adjacent to its external process invocation'

. $gateScript

$gateEnvironmentOriginal = @{}
foreach ($name in $variableNames) {
    $gateEnvironmentOriginal[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$callerLocation = (Get-Location).Path
$gateLogDirectory = Join-Path -Path $projectRoot -ChildPath '.superpowers\logs'

try {
    Initialize-WindowsNodeEnvironment
    $nodeExecutable = (Get-Command -Name 'node.exe' -CommandType Application -ErrorAction Stop).Path
    $successfulChild = @{
        Name = 'controlled child'
        FilePath = $nodeExecutable
        ArgumentList = @('-e', "console.log('CONTROLLED_STDOUT'); console.error('CONTROLLED_STDERR')")
    }
    $successfulResult = Invoke-ReleaseGates -Steps @($successfulChild) -LogDirectory $gateLogDirectory -SkipGitDiffCheck
    $successfulLog = Get-Content -Raw -LiteralPath $successfulResult.LogPath
    Assert-True -Condition $successfulLog.Contains('CONTROLLED_STDOUT') -Message 'Release log must contain native child stdout.'
    Assert-True -Condition $successfulLog.Contains('CONTROLLED_STDERR') -Message 'Release log must contain native child stderr.'
    Assert-True -Condition $successfulLog.Contains('START: controlled child') -Message 'Release log must contain the child start status.'
    Assert-True -Condition $successfulLog.Contains('PASS: controlled child') -Message 'Release log must contain the child pass status.'

    $failingChild = @{
        Name = 'controlled failing child'
        FilePath = $nodeExecutable
        ArgumentList = @('-e', "console.error('CONTROLLED_FAILURE'); process.exit(23)")
    }
    $observedFailure = $null
    try {
        Invoke-ReleaseGates -Steps @($failingChild) -LogDirectory $gateLogDirectory -SkipGitDiffCheck -LogFinalizer {
            param($LogPath)
            throw 'simulated log finalization failure'
        }
    }
    catch {
        $observedFailure = $_.Exception.Message
    }

    Assert-True -Condition ($observedFailure -match 'controlled failing child release gate failed with exit code 23') -Message "Log-finalization failure must not hide the original gate failure, got '$observedFailure'."
    Assert-Equal -Actual (Get-Location).Path -Expected $callerLocation -Message 'The caller working directory must be restored when log finalization fails.'
    Write-Host 'PASS: release logs contain native stdout, stderr, and per-step statuses.'
    Write-Host 'PASS: log finalization failure preserves the gate error and restores the caller directory.'
}
finally {
    foreach ($name in $variableNames) {
        Set-ProcessEnvironmentValue -Name $name -Value $gateEnvironmentOriginal[$name]
    }
}
