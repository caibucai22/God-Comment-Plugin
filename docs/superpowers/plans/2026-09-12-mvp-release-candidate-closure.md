# MVP Release Candidate Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a repeatable, evidence-backed MVP RC decision for the Bilibili Chrome extension without expanding product scope.

**Architecture:** Extend the existing protected Windows release gate with a deterministic production-package audit, strengthen Playwright release-critical geometry and export coverage, capture five state-specific visual artifacts, then consolidate automated and real-site evidence into one RC report. Fixture, source audit, and real Bilibili evidence remain explicitly separated.

**Tech Stack:** PowerShell 7, Node.js 22.22.2, TypeScript, Vitest, Vite, Playwright, Chrome Manifest V3.

**Spec:** `docs/superpowers/specs/2026-09-12-mvp-release-candidate-closure-design.md`

## Global Constraints

- Windows native PowerShell only; no Bash/cmd and no nested PowerShell process.
- Use Node 22.22.2 through `scripts/run-release-gates.ps1`; do not install Node 24.
- Production content-script match remains exactly `https://www.bilibili.com/video/*`.
- Permissions remain exactly `storage` and `downloads`; `host_permissions` remains absent.
- Real Bilibili evidence cannot be inferred from localhost fixture tests.
- Only P0/P1 release blockers may change product behavior; P2/P3 items go to backlog.
- Every behavior fix follows RED → GREEN TDD.
- Visual artifacts and execution logs use unique `_执行命令说明_日期` names and stay Git ignored.
- Do not push, merge, delete branches/worktrees/Node versions, or modify permanent system/NVM settings.

---

### Task 1: Deterministic production-package audit

**Files:**
- Create: `scripts/audit-production-package.mjs`
- Create: `tests/unit/production-package-audit.test.ts`
- Modify: `scripts/run-release-gates.ps1`
- Modify: `tests/scripts/windows-node-env.test.ps1`
- Modify: `README.md`

**Interfaces:**
- Produces: `auditProductionPackage(options)` returning an immutable audit result with manifest match, permissions, required output files, sizes, and forbidden-pattern findings.
- Consumes: final production `dist/` produced by the Vite gate.
- Produces: a `Production package audit` step immediately after Vite and before Playwright.

- [ ] **Step 1: Write failing unit tests for the audit**

Create temporary fixture directories inside the test environment and assert:

```ts
await expect(auditProductionPackage({ distDir: validDist })).resolves.toMatchObject({
  manifestVersion: 3,
  matches: [["https://www.bilibili.com/video/*"]],
  permissions: ["storage", "downloads"],
});
```

Add separate failures for localhost production matches, extra permissions, present `host_permissions`, missing/empty content script, missing required pixel assets, and forbidden source tokens representing telemetry/upload endpoints.

- [ ] **Step 2: Run focused Vitest and verify RED**

Run the local Vitest CLI through the initialized Node environment. Expected: module import fails because `scripts/audit-production-package.mjs` does not exist.

- [ ] **Step 3: Implement the audit module**

The module must:

- read and parse `dist/manifest.json`;
- require MV3, exact permissions, exact Bilibili match, and absent `host_permissions`;
- resolve manifest-declared content scripts and require every file to exist and be non-empty;
- require at least one non-empty generated asset matching each production family: mascot, shared ground, generating state, failed state, saved state, and all five bottom-state assets;
- recursively inspect emitted `.js` and `.json` text for explicit forbidden project-owned telemetry/upload markers defined in one exported constant;
- return normalized relative paths and byte sizes without writing files;
- expose a CLI that prints one JSON result and exits non-zero with a concise error on failure.

- [ ] **Step 4: Verify GREEN**

Run the focused unit test. Expected: all valid and invalid fixture cases pass with no warnings.

- [ ] **Step 5: Add the release-gate step with a failing structure test**

Extend the PowerShell AST test to require a direct `$nodeExecutable` invocation of `scripts/audit-production-package.mjs` after Vite and before Playwright, with an immediately bound `$LASTEXITCODE` check. Run it before editing `run-release-gates.ps1`; expected failure is the missing audit step.

- [ ] **Step 6: Integrate the audit and document it**

Add the audit step to the default gate array and update README so the protected gate description includes the final production-package audit. Do not add a second build.

- [ ] **Step 7: Run focused tests and full protected gates**

Expected: audit unit tests pass, PowerShell structure tests pass, and the full gate completes with the audit JSON in the unique log.

- [ ] **Step 8: Commit**

```powershell
git add -- scripts/audit-production-package.mjs scripts/run-release-gates.ps1 tests/unit/production-package-audit.test.ts tests/scripts/windows-node-env.test.ps1 README.md
git commit -m 'test: audit production extension package'
```

### Task 2: Five-state release geometry and semantic contract

**Files:**
- Modify: `tests/e2e/panel-visual.spec.ts`
- Modify: `tests/integration/extension-panel.test.ts`

**Interfaces:**
- Consumes: `PanelState` and the existing shared `ExtensionPanel` shell.
- Produces: one table-driven release contract for all five states, including action bounds, state-specific required controls, forbidden controls, and decoration geometry.

- [ ] **Step 1: Add the state-contract test**

Define an explicit table:

```ts
const stateContract = {
  editing: { required: ["内容设置", "制作卡片"], forbidden: ["制作中"] },
  generating: { required: ["制作中", "取消制作"], forbidden: ["确认保存"] },
  failed: { required: ["制作失败", "重新生成", "返回修改"], forbidden: ["保存成功"] },
  generated: { required: ["确认保存", "返回修改"], forbidden: ["保存成功"] },
  saved: { required: ["保存成功", "再做一张"], forbidden: ["确认保存"] },
} as const;
```

For every state, require exactly one Panel, 336 × 570 geometry, one shared Header/StateViewport/ActionArea/BottomDecoration, full-width 18px ground, contained state scene, and all interactive controls within Panel bounds. Add a generated-preview assertion that computed `image-rendering` is not `pixelated`.

- [ ] **Step 2: Run the focused contract tests**

Run the focused Panel integration/E2E tests. Coverage-only additions may pass immediately when current production already satisfies the approved contract; record that honestly. If any assertion fails, confirm it reproduces a product P0/P1 rather than weakening the test.

- [ ] **Step 3: Complete the minimal test contract or repair only a discovered P0/P1 defect**

If current production code satisfies the contract, finish the table-driven tests without changing product code. If a real P0/P1 defect is reproduced, retain the observed RED, add the smallest production fix in the owning Panel file, and preserve the failing test as regression coverage.

- [ ] **Step 4: Verify GREEN**

Run focused integration and Panel Playwright tests. Expected: all five state contracts pass; the explicit screenshot test remains skipped unless a visual round is supplied.

- [ ] **Step 5: Commit**

Commit tests alone when no product defect exists:

```powershell
git add -- tests/e2e/panel-visual.spec.ts tests/integration/extension-panel.test.ts
git commit -m 'test: lock release panel state contracts'
```

If production code changed, include only the owning Panel source/CSS files in the same commit and use `fix: enforce release panel state contracts`.

### Task 3: Export matrix and failure-recovery release coverage

**Files:**
- Modify: `tests/e2e/selection-flow.spec.ts`
- Modify only if a P0/P1 is reproduced: `src/content/index.ts`, `src/export/export-service.ts`, `src/render/card-renderer.ts`

**Interfaces:**
- Consumes: production selection flow and downloaded PNG files.
- Produces: release-level E2E coverage for 3:4, 9:16, and 16:9 dimensions plus save-confirmation and recovery invariants.

- [ ] **Step 1: Add 9:16 download verification**

Drive the production Panel to `9:16`, generate, assert no download exists before “确认保存”, then save and parse the PNG IHDR. Require width `1080`, height `1920`, a `.png` filename, and file size greater than zero.

- [ ] **Step 2: Run the focused E2E**

Coverage-only additions may pass immediately when current production already implements 9:16 correctly; record that honestly. If the case fails, confirm the failure is a production mismatch rather than test setup before changing product code, and preserve that run as RED evidence.

- [ ] **Step 3: Complete the ratio matrix**

Refactor only test helpers needed to express:

```ts
[
  { ratio: "3:4", width: 1200, height: 1600 },
  { ratio: "9:16", width: 1080, height: 1920 },
  { ratio: "16:9", width: 1920, height: 1080 },
]
```

Each row must verify generated-state metadata, no pre-confirmation download, one non-empty PNG after confirmation, exact IHDR dimensions, and saved state. Keep one full comment-selection journey; reuse an already-open Panel for additional rows only if state reset remains production-realistic.

- [ ] **Step 4: Add failure-recovery assertions**

Use existing deterministic failure seams to verify generation failure returns `failed`, retry returns to `generating`, return-editing restores editable content, and repeated confirmation while busy produces exactly one render/download. Do not add network-dependent failures.

- [ ] **Step 5: Fix only reproduced P0/P1 behavior**

If tests expose a product defect, apply strict RED → GREEN to the smallest owning module. Do not refactor unrelated rendering or add new options.

- [ ] **Step 6: Verify GREEN and full gates**

Run the focused selection E2E, then `scripts/run-release-gates.ps1`. Expected: ratio matrix, failure recovery, all unit/integration tests, production audit, build, full E2E, and Git diff check pass.

- [ ] **Step 7: Commit**

```powershell
git add -- tests/e2e/selection-flow.spec.ts
git commit -m 'test: verify release export matrix and recovery'
```

Include a production source file only when the RED test proved a P0/P1 defect, and adjust the subject to `fix:`.

### Task 4: Visual artifacts, real-site checklist, and RC decision

**Files:**
- Modify: `docs/testing/chrome-mcp-checklist.md`
- Modify: `docs/manual-test-checklist.md`
- Create: `docs/status/2026-09-12-mvp-rc-closure-report.md`
- Artifact only, ignored: `.superpowers/visual-qa/round-mvp-rc-<timestamp>/`
- Artifact only, ignored: `.superpowers/logs/release-gates_执行命令说明_<timestamp>_<id>.log`

**Interfaces:**
- Consumes: Tasks 1–3 automated evidence, user-provided real Bilibili screenshot evidence, and current Chrome manual results.
- Produces: one auditable RC verdict: `PASS`, `CONDITIONAL PASS`, or `FAIL`.

- [ ] **Step 1: Capture five unique visual artifacts**

Set a unique process-local `CCG_VISUAL_QA_ROUND` value and directly invoke the local Playwright CLI for `tests/e2e/panel-visual.spec.ts`. Verify exactly `editing.png`, `generating.png`, `failed.png`, `generated.png`, and `saved.png` exist, are non-empty, and share dimensions.

- [ ] **Step 2: Inspect every screenshot**

Record for each state: 336 × 570 shell, correct state content, action bounds, full-width ground, contained scene, and absence of overlap. Any P0/P1 starts a TDD fix loop in the owning task; P2/P3 differences are written to backlog.

- [ ] **Step 3: Update the real-site checklist**

Replace stale version/test counts and add explicit rows for the five Panel states, 16:9, 9:16, confirmation-before-download, 125% Windows scaling, Panel-close interaction restoration, and evidence privacy. Retain all prior `PASS` evidence only when its source is named; keep unexecuted checks as `NOT RUN`.

- [ ] **Step 4: Run the final protected release gates**

Run `scripts/run-release-gates.ps1` once after all changes. Record the unique log path and exact current counts. Do not copy ignored logs into `docs/`.

- [ ] **Step 5: Write the RC closure report**

The report must contain:

- commit and environment;
- Gate A/B/C/D tables;
- exact automated counts and log/artifact paths;
- distinction between fixture and real-site evidence;
- P0/P1 open-item count;
- P2/P3 backlog;
- final verdict using the spec rules.

If real-site checks remain unexecuted but automated gates and previously confirmed real main flow pass, the maximum verdict is `CONDITIONAL PASS`.

- [ ] **Step 6: Validate documentation and repository hygiene**

Run `git diff --check`, confirm `git status --short` contains only intended docs before commit, and confirm screenshots/logs/downloads/browser profiles are ignored.

- [ ] **Step 7: Commit**

```powershell
git add -- docs/testing/chrome-mcp-checklist.md docs/manual-test-checklist.md docs/status/2026-09-12-mvp-rc-closure-report.md
git commit -m 'docs: record MVP release candidate closure'
```

Do not merge or push. Leave the branch ready for the user's integration decision.
