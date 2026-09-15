# Card Media, Audio, and GitHub Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve card branding and cover geometry, add transaction-aware audio and a draggable pixel mascot entry, then establish GitHub CI and tagged release artifacts.

**Architecture:** Keep the existing Canvas renderer and Panel state machine. Add focused helpers for cover geometry and floating placement, evolve WebAudio to explicit cues, and let GitHub workflows call the same cross-platform npm commands as the Windows release gate.

**Tech Stack:** TypeScript, Canvas 2D, WebAudio, Chrome MV3 storage, Vitest/jsdom, Playwright, Vite 7, GitHub Actions, Node 22.

**Spec:** `docs/superpowers/specs/2026-09-14-card-media-audio-github-release-design.md`

## Global Constraints

- Windows local work uses native PowerShell 7; Node remains 22.22.2.
- Work in an isolated Git worktree; do not push, merge, or delete without approval.
- No remote media, telemetry, upload, new host permission, Web Store publishing, Node 24, or long-lived secret.
- Preserve current selection, Panel, preview, confirmation, and download semantics.
- Every product change requires a focused RED, minimal implementation, focused GREEN, review, and fresh full gates.
- Logs remain under ignored `.superpowers/logs/` with unique names.

---

### Task 1: 有神评 branding and ratio-aware cover geometry

**Files:**
- Modify: `manifest.config.ts`
- Modify: `src/ui/extension-panel.ts`
- Modify: `src/ui/overlay-root.ts`
- Modify: `src/ui/confirm-card.ts`
- Modify: `src/export/export-service.ts`
- Modify: `src/render/card-renderer.ts`
- Modify: `tests/unit/card-renderer.test.ts`
- Modify: `tests/e2e/selection-flow.spec.ts`

**Interfaces:**
- Consumes: `RenderCardInput`, `CardRatio`, `layoutText`, `CARD_DIMENSIONS`.
- Produces: one internal cover-geometry calculation; `renderCard(input): Promise<RenderCardResult>` remains compatible.

- [ ] Add failing tests that record Canvas destinations and assert the “有神评” brand contract, title non-overlap, full-source contain drawing, portrait covers filling the safe content width, a shared cover/text column, and monotonically decreasing 16:9 cover sizing with a protected body line.
- [ ] Run `npx vitest run tests/unit/card-renderer.test.ts`; retain the expected RED showing old 16:9 cover sizing or mark geometry failure.
- [ ] Replace third-party platform branding with deterministic Canvas text for “有神评” and “有神评，让更多人看见”; keep bilibili as plain source attribution only.
- [ ] Centralize cover height selection from ratio, body/meta budget and measured text; use centered `contain` geometry with the full source rectangle, finite values, and the existing load-failure fallback.
- [ ] Extend Playwright’s horizontal test to verify 1920×1080 output and the maximized media region for a short comment without losing the comment body.
- [ ] Run the focused Vitest and `npx playwright test tests/e2e/selection-flow.spec.ts --grep "horizontal|ratio"`.
- [ ] Commit only this task as `feat: prioritize card branding and video covers`.

### Task 2: Transaction-aware generation cues

**Files:**
- Modify: `src/audio/generation-sound.ts`
- Modify: `src/content/index.ts`
- Modify: `tests/unit/generation-sound.test.ts`
- Modify: `tests/integration/content-app.test.ts`

**Interfaces:**
- Produces: `type GenerationSoundCue = "start" | "success" | "failure"` and `playGenerationSound(cue: GenerationSoundCue): void`.
- Consumes: `soundEnabled`, the generation busy guard, and render terminal transitions.

- [ ] Add failing tests: ascending start, two-note bright success, descending failure, context release, disabled zero-context, busy de-duplication, and exactly one matching terminal cue.
- [ ] Run `npx vitest run tests/unit/generation-sound.test.ts tests/integration/content-app.test.ts`; retain the expected cue-API RED.
- [ ] Implement short attack/release oscillator and gain schedules; keep the perceived success transaction at 600–800ms and catch all WebAudio failures.
- [ ] Call `start` only after an accepted user action, `success` after preview creation, and `failure` in the generation error branch.
- [ ] Re-run the two focused suites and commit as `feat: add distinctive generation sound cues`.

### Task 3: Draggable snapping pixel mascot entry

**Files:**
- Create: `src/storage/floating-entry-placement.ts`
- Modify: `src/ui/overlay-root.ts`
- Modify: `src/ui/overlay.css`
- Create: `tests/unit/floating-entry-placement.test.ts`
- Modify: `tests/integration/overlay-root.test.ts`
- Modify: `tests/e2e/selection-flow.spec.ts`

**Interfaces:**
- Produces: `FloatingEntryPlacement { side: "left" | "right"; yRatio: number }`, `loadFloatingEntryPlacement()`, `saveFloatingEntryPlacement(value)`, plus pure snap/clamp helpers.
- Consumes: `mascot-master.png`, current `toggle-selection`, Shadow DOM lifecycle, and `chrome.storage.local`.

- [x] Add failing unit tests for default `{ side: "right", yRatio: 0.86 }`, domain validation, nearest-edge snap, resize clamp, storage rejection fallback, and the standalone `floatingEntryPlacement` key.
- [x] Add failing overlay tests proving movement below 6px clicks once while movement at or above 6px only drags, captures/releases the pointer, snaps, persists once, and is inert after destroy.
- [x] Run `npx vitest run tests/unit/floating-entry-placement.test.ts tests/integration/overlay-root.test.ts` and retain missing-module/behavior RED.
- [x] Implement placement storage separately from `CardPreferences`; never write Bilibili localStorage.
- [x] Replace the text capsule with a semantic mascot button and CSS mini-card; add pointerdown/move/up/cancel, a 6px Euclidean threshold, nearest-side snap, resize clamp, and non-blocking persistence.
- [x] Add restrained breathing/card-pop cycles and disable cycles under `prefers-reduced-motion`; keep prompt/Panel/status stacking correct.
- [x] Extend Playwright to drag, verify no toggle, reload and restore, resize and clamp, then click to enter selection.
- [x] Run focused Vitest and the new Playwright grep; commit as `feat: add draggable pixel mascot entry`.

### Task 4: Cross-platform GitHub CI

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `scripts/run-release-gates.ps1`
- Create: `tests/unit/github-workflows.test.ts`

**Interfaces:**
- Produces npm scripts `typecheck`, `audit:production`, `test:ci`, and `verify:ci` usable on Windows and Linux.
- Windows release gate consumes the same npm commands and retains unique logging.

- [ ] Add a failing workflow contract test for PR plus `master` triggers, read-only permissions, concurrency cancellation, Node 22, `npm ci`, Playwright Chromium, all gates, and failure-only artifact upload.
- [ ] Run `npx vitest run tests/unit/github-workflows.test.ts` and retain missing-workflow RED.
- [ ] Add cross-platform npm scripts and one Ubuntu job using pinned-major official actions, npm lockfile caching, and failure-only Playwright reports; do not invoke PowerShell from Linux.
- [ ] Update the Windows gate to call the shared underlying commands without reducing its coverage or log guarantees.
- [ ] Run `npm run test:ci`, `npm run typecheck`, `npm run build`, `npm run audit:production`, and the workflow contract test.
- [ ] Commit as `ci: validate extension on pull requests`.

### Task 5: Tagged release ZIP and checksum

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `scripts/verify-release-version.mjs`
- Create: `tests/unit/release-workflow.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `node scripts/verify-release-version.mjs <tag> <manifest-path>`; success requires exact tag/package/manifest version agreement.
- Produces `comment-card-extension-vX.Y.Z.zip` and `.sha256`, with `manifest.json` at ZIP root.

- [ ] Add failing tests for exact matching, invalid/missing `v`, version mismatch, `v*` trigger, minimal release permission, full gates, ZIP root, checksum, and Release upload.
- [ ] Run `npx vitest run tests/unit/release-workflow.test.ts` and retain missing-script/workflow RED.
- [ ] Implement strict `vMAJOR.MINOR.PATCH` parsing and concise deterministic output in the Node verifier.
- [ ] Add the tag workflow: run full CI-equivalent gates, build production, run the version guard, zip from inside `dist`, audit the archive listing, compute SHA-256, and publish using only `GITHUB_TOKEN` with `contents: write`.
- [ ] Run the focused suite and `node scripts/verify-release-version.mjs v0.1.0 dist/manifest.json`.
- [ ] Commit as `ci: package tagged extension releases`.

### Task 6: Documentation and final acceptance

**Files:**
- Modify: `README.md`
- Modify: `docs/manual-test-checklist.md`
- Create: `docs/status/2026-09-14-card-media-audio-ci-handoff.md`

**Interfaces:**
- Consumes all prior task behavior and gate evidence.
- Produces reproducible contributor/release instructions and a merge-ready handoff.

- [ ] Document mascot drag/snap and storage, cover ranges, sound cues, npm verification, PR/master CI, tag artifacts, installation, and the absence of Web Store automation.
- [ ] Run `& '.\scripts\run-release-gates.ps1'`; require all Vitest, TypeScript, production build/audit, Playwright, and diff checks to pass and record the unique log path.
- [ ] Capture ignored screenshots for 3:4, 9:16, short/long 16:9, left/right mascot, and reduced motion.
- [ ] Ask the user to verify new sound on/off and mascot drag/reload on a real Bilibili video page; do not represent fixture evidence as real-site evidence.
- [ ] Record commits, environment, test counts, log/artifact paths, manual status, workflow scope, non-blockers, and merge readiness in the handoff.
- [ ] Run `git diff --check` and `git status --short --branch`; commit tracked documentation as `docs: record media audio and CI acceptance`.

