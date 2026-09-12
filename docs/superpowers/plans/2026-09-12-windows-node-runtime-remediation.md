# Windows Node Runtime Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore reliable Node/NVM execution inside the Windows Codex child-process environment and complete the extension release gates on Node LTS 24.21.0.

**Architecture:** Add a project-owned PowerShell environment initializer that restores only missing Windows variables and a single release-gate entrypoint that invokes local Node tools after initialization. Validate the initializer independently, then install/switch Node through NVM without deleting 22.22.2 and run the full project gates.

**Tech Stack:** PowerShell 7, NVM for Windows 1.2.2, Node.js, Vitest, TypeScript, Vite, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-12-windows-network-node-runtime-investigation.md`

## Global Constraints

- Windows native PowerShell only; do not use Bash or nested PowerShell commands.
- Restore `SystemRoot`, `WINDIR`, and `ComSpec` only when missing; never overwrite valid existing values.
- Keep Node 22.22.2 installed.
- Install Node LTS 24.21.0 and switch via NVM only after the environment initializer passes.
- Do not change the NVM mirror unless installation fails; preserve the original `settings.txt` before any mirror change.
- Do not run `git push` or delete branches, worktrees, Node versions, or files under `C:\Users\001`.
- Test/build logs use unique `_执行命令说明_日期` names and remain outside Git tracking.

---

### Task 1: Project-owned Windows environment initializer

**Files:**
- Create: `scripts/windows-node-env.ps1`
- Create: `tests/scripts/windows-node-env.test.ps1`

**Interfaces:**
- Produces: `Initialize-WindowsNodeEnvironment`, a PowerShell function that returns after ensuring the three required variables exist for the current process.
- Consumes: machine-level `SystemRoot` when available, otherwise the Windows special-folder API, with `C:\Windows` as the validated final fallback.

- [ ] **Step 1: Write the failing PowerShell test**

The test must start a child scope, clear the three variables, invoke `Initialize-WindowsNodeEnvironment`, and assert exact restored values. A second case sets sentinel values and asserts that the function does not overwrite them.

- [ ] **Step 2: Run the test to verify RED**

Run:

```powershell
& 'C:\Program Files\WindowsApps\Microsoft.PowerShell_7.6.5.0_x64__8wekyb3d8bbwe\pwsh.exe' -NoProfile -File '.\tests\scripts\windows-node-env.test.ps1'
```

Expected: failure because `scripts/windows-node-env.ps1` does not exist.

- [ ] **Step 3: Implement the initializer**

Required behavior:

```powershell
function Initialize-WindowsNodeEnvironment {
  if (-not $IsWindows) { return }
  $machineRoot = [Environment]::GetEnvironmentVariable('SystemRoot', 'Machine')
  $resolvedRoot = if ($machineRoot) { $machineRoot } else { [Environment]::GetFolderPath('Windows') }
  if (-not $resolvedRoot) { $resolvedRoot = 'C:\Windows' }
  if (-not $env:SystemRoot) { $env:SystemRoot = $resolvedRoot }
  if (-not $env:WINDIR) { $env:WINDIR = $env:SystemRoot }
  if (-not $env:ComSpec) { $env:ComSpec = Join-Path $env:SystemRoot 'System32\cmd.exe' }
}
```

The implementation must validate that the selected Windows root and `ComSpec` path exist before assigning them.

- [ ] **Step 4: Run the PowerShell test to verify GREEN**

Expected: both missing-variable and non-overwrite cases pass with exit code 0.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- scripts/windows-node-env.ps1 tests/scripts/windows-node-env.test.ps1
git commit -m 'fix: restore Windows environment for Node tools'
```

### Task 2: Protected project release-gate entrypoint

**Files:**
- Create: `scripts/run-release-gates.ps1`
- Modify: `README.md`
- Test: `tests/scripts/windows-node-env.test.ps1`

**Interfaces:**
- Consumes: `Initialize-WindowsNodeEnvironment` from Task 1.
- Produces: `scripts/run-release-gates.ps1`, the supported Windows entrypoint for Vitest, TypeScript, Vite build, Panel Playwright E2E, and `git diff --check`.

- [ ] **Step 1: Extend the failing test**

Assert that `run-release-gates.ps1` dot-sources `windows-node-env.ps1` and invokes the initializer before resolving or starting Node.

- [ ] **Step 2: Verify RED**

Expected: failure because `scripts/run-release-gates.ps1` does not exist.

- [ ] **Step 3: Implement the gate script**

The script must:

1. dot-source `windows-node-env.ps1`;
2. call `Initialize-WindowsNodeEnvironment`;
3. resolve `node.exe` after initialization;
4. call `node_modules/vitest/vitest.mjs --run`;
5. call `node_modules/typescript/bin/tsc --noEmit`;
6. call `node_modules/vite/bin/vite.js build`;
7. call `node_modules/@playwright/test/cli.js test`;
8. call `git diff --check master...HEAD`;
9. check `$LASTEXITCODE` after every external process;
10. write a unique transcript under `.superpowers/logs/`.

- [ ] **Step 4: Update README**

Document `scripts/run-release-gates.ps1` as the Windows/Codex-safe full verification command and explain why `npm` alone cannot restore variables before Node startup.

- [ ] **Step 5: Verify GREEN and commit Task 2**

Run the script-structure test, then commit:

```powershell
git add -- scripts/run-release-gates.ps1 tests/scripts/windows-node-env.test.ps1 README.md
git commit -m 'chore: add protected Windows release gates'
```

### Task 3: Install Node LTS 24.21.0 and complete release verification

**Files:**
- Modify outside repository: `D:\03-env\nvm\` through NVM only.
- Preserve: `D:\03-env\nvm\v22.22.2`.
- Log only: `.superpowers/logs/node-lts-install_执行命令说明_20260912_<time>.log`

**Interfaces:**
- Consumes: project environment initializer and NVM 1.2.2.
- Produces: active Node 24.21.0 plus fresh release-gate evidence.

- [ ] **Step 1: Validate environment before installation**

After initialization, require all of the following:

- `node:crypto.randomBytes(16)` exits 0;
- `127.0.0.1:7897` accepts a TCP connection;
- `nvm list available` includes `24.21.0`.

- [ ] **Step 2: Install and switch without deleting Node 22**

Run NVM with process-local `NVM_HOME` and `NVM_SYMLINK`. If npmmirror times out, stop and request confirmation before changing `settings.txt`.

- [ ] **Step 3: Verify the active runtime**

Require:

- `node --version` reports `v24.21.0`;
- `node:crypto.randomBytes(16)` succeeds three consecutive times;
- `nvm list` still contains both `24.21.0` and `22.22.2`.

- [ ] **Step 4: Run full project release gates**

Run `scripts/run-release-gates.ps1`. Expected results:

- Vitest: 149 tests pass;
- TypeScript: exit 0;
- production build: exit 0;
- Panel Playwright E2E: 3 tests pass and the explicit screenshot-only case skips;
- `git diff --check master...HEAD`: exit 0.

- [ ] **Step 5: Record handoff**

Update the ignored `.superpowers/status/` handoff with the active Node version, test counts, logs, commits, and remaining local-merge decision. Do not push.
