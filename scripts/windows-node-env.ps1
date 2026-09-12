Set-StrictMode -Version Latest

function Test-ValidWindowsRoot {
    param([AllowNull()][string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $false
    }

    try {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        if (-not $item.PSIsContainer) {
            return $false
        }

        $commandProcessor = Join-Path -Path $Path -ChildPath 'System32\cmd.exe'
        return Test-ValidCommandProcessor -Path $commandProcessor
    }
    catch {
        return $false
    }
}

function Test-ValidCommandProcessor {
    param([AllowNull()][string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $false
    }

    try {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        return (-not $item.PSIsContainer) -and ($item.Name -ieq 'cmd.exe')
    }
    catch {
        return $false
    }
}

function Resolve-WindowsNodeEnvironmentRoot {
    param(
        [AllowNull()][string]$MachineRoot,
        [AllowNull()][string]$SpecialFolderRoot,
        [AllowNull()][string]$FallbackRoot
    )

    foreach ($candidate in @($MachineRoot, $SpecialFolderRoot, $FallbackRoot)) {
        if (Test-ValidWindowsRoot -Path $candidate) {
            return $candidate
        }
    }

    throw 'Unable to resolve a valid Windows root for the current process.'
}

function Initialize-WindowsNodeEnvironment {
    param(
        [AllowNull()][string]$MachineRoot = [Environment]::GetEnvironmentVariable('SystemRoot', 'Machine'),
        [AllowNull()][string]$SpecialFolderRoot = [Environment]::GetFolderPath([Environment+SpecialFolder]::Windows),
        [AllowNull()][string]$FallbackRoot = 'C:\Windows'
    )

    if (-not $IsWindows) {
        return
    }

    $processSystemRoot = [Environment]::GetEnvironmentVariable('SystemRoot', 'Process')
    $processWindir = [Environment]::GetEnvironmentVariable('WINDIR', 'Process')
    $processComSpec = [Environment]::GetEnvironmentVariable('ComSpec', 'Process')

    if (-not [string]::IsNullOrWhiteSpace($processSystemRoot) -and -not (Test-ValidWindowsRoot -Path $processSystemRoot)) {
        throw "Existing process SystemRoot value '$processSystemRoot' is invalid; refusing to overwrite it."
    }
    if (-not [string]::IsNullOrWhiteSpace($processWindir) -and -not (Test-ValidWindowsRoot -Path $processWindir)) {
        throw "Existing process WINDIR value '$processWindir' is invalid; refusing to overwrite it."
    }
    if (-not [string]::IsNullOrWhiteSpace($processComSpec) -and -not (Test-ValidCommandProcessor -Path $processComSpec)) {
        throw "Existing process ComSpec value '$processComSpec' is invalid; refusing to overwrite it."
    }

    $selectedRoot = $processSystemRoot
    if ([string]::IsNullOrWhiteSpace($selectedRoot)) {
        $selectedRoot = Resolve-WindowsNodeEnvironmentRoot -MachineRoot $MachineRoot -SpecialFolderRoot $SpecialFolderRoot -FallbackRoot $FallbackRoot
    }

    $generatedComSpec = Join-Path -Path $selectedRoot -ChildPath 'System32\cmd.exe'
    if (-not (Test-ValidCommandProcessor -Path $generatedComSpec)) {
        throw "Resolved Windows root '$selectedRoot' does not provide a valid System32\\cmd.exe."
    }

    if ([string]::IsNullOrWhiteSpace($processSystemRoot)) {
        [Environment]::SetEnvironmentVariable('SystemRoot', $selectedRoot, 'Process')
    }
    if ([string]::IsNullOrWhiteSpace($processWindir)) {
        [Environment]::SetEnvironmentVariable('WINDIR', $selectedRoot, 'Process')
    }
    if ([string]::IsNullOrWhiteSpace($processComSpec)) {
        [Environment]::SetEnvironmentVariable('ComSpec', $generatedComSpec, 'Process')
    }
}
