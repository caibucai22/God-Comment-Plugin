Set-StrictMode -Version Latest

function Test-ValidWindowsRoot {
    param([AllowNull()][string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $false
    }

    try {
        return (Get-Item -LiteralPath $Path -Force -ErrorAction Stop).PSIsContainer
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

function Initialize-WindowsNodeEnvironment {
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
        $rootCandidates = @(
            [Environment]::GetEnvironmentVariable('SystemRoot', 'Machine'),
            [Environment]::GetFolderPath([Environment+SpecialFolder]::Windows),
            'C:\Windows'
        )

        foreach ($candidate in $rootCandidates) {
            if (Test-ValidWindowsRoot -Path $candidate) {
                $selectedRoot = $candidate
                break
            }
        }
    }

    if (-not (Test-ValidWindowsRoot -Path $selectedRoot)) {
        throw 'Unable to resolve a valid Windows root for the current process.'
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
