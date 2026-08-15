# Task 8 Report: PNG Export and Complete Content App Composition

## Implementation

- Added `src/export/export-service.ts` with the public `exportPng(canvas, filename)` contract and an injectable export service for deterministic tests.
- Added local-time, zero-padded `神评卡片-bilibili-YYYYMMDD-HHmmss.png` filename generation.
- Added exact `image/png` Canvas conversion, Promise and callback Chrome downloads handling, `chrome.runtime.lastError` handling, and a safely appended/removed hidden anchor fallback.
- Added explicit Object URL ownership. Successful download acceptance revokes the URL; a Chrome-plus-anchor double failure transfers ownership through `PngDownloadError.retained`; retry success, replacement, cancellation, status dismissal, or app destruction releases it exactly once.
- Added a complete injectable content application factory and one-instance-per-document production bootstrap. Test imports do not auto-bootstrap because production startup is gated by `import.meta.env.MODE !== "test"`.
- Composed adapter resolution, OverlayRoot mounting, preference load/save, SelectionController lifecycle, stable attribute generation, Canvas rendering, PNG export, completion state, and all specified error/degradation paths.
- Added exact-four-field preference persistence, source validation, cover-fallback completion messaging, generation concurrency guards, and post-destroy async guards.
- Minimally extended OverlayRoot with generation busy state and a visible `再次下载` action, including retained-download cancellation on status dismissal.
- Isolated OverlayRoot interactions from SelectionController document-capture handlers through a shared `composedPath()` host guard, so real Shadow DOM toggle, hint, cancel, and context-menu interactions do not become outside clicks.
- Kept `manifest.config.ts` unchanged: Bilibili video scope and existing `storage`/`downloads` permissions remain intact.

## TDD Evidence

- Initial missing-module RED: `npm test -- --run tests/unit/export-service.test.ts tests/integration/content-app.test.ts` failed both suites because `src/export/export-service.ts` did not exist.
- Export GREEN: the initial exporter suite passed 8/8 after the minimal implementation; review coverage later brought it to 9/9 with delayed callback-success revocation timing.
- Content factory RED: `tests/integration/content-app.test.ts` failed 11/11 with `createContentApp is not a function` / `bootstrapContentApp is not a function` while `src/content/index.ts` was still empty.
- Content factory GREEN: the initial composition suite passed 11/11 after wiring the application.
- Overlay extension RED: two new tests failed because `setGenerationBusy` and `showDownloadRetry` did not exist.
- Overlay extension GREEN: OverlayRoot plus existing confirmation tests passed 13/13 after the minimal extension.
- Retry-cancel race RED: a pending retry cancelled by the user still emitted success (`expected true to be false`).
- Retry-cancel race GREEN: retained ownership is checked after retry settlement, so cancellation cannot complete or restore an obsolete download.
- Destroy-during-render RED: resolving a pending render after `destroy()` called the exporter once.
- Destroy-during-render GREEN: destroyed checks after asynchronous save/render boundaries prevent any later export.
- Real Shadow DOM integration RED: real OverlayRoot + SelectionController tests failed all specified interactions: toggle stayed active, hint became `outside`, and confirmation cancel lost active selection. A fourth test showed overlay context menu was consumed.
- Real Shadow DOM integration GREEN: a single shared overlay-host `composedPath()` guard restored all four interactions; focused content/selection suites passed 29/29.
- Root review round 1 busy-cancel RED: with real OverlayRoot and SelectionController, the current Cancel button remained enabled during a pending render (`expected false to be true`), and retained/programmatic cancellation could alter confirmation state while the async operation continued.
- Root review round 1 busy-cancel GREEN: current and retained Cancel controls are inert while busy, programmatic `cancel-generate` is guarded by the same application lock, and the single render/export operation completes normally.
- Four-digit year RED/GREEN: year 7 initially produced `70102`; the filename helper now produces the strict `00070102` date prefix.
- Supported-page import coverage: the content integration file uses a real `https://www.bilibili.com/video/...` jsdom URL and verifies that importing/reset-importing the module in test mode creates no overlay host.

## Verification

- `npm test -- --run tests/unit/export-service.test.ts tests/integration/content-app.test.ts tests/integration/overlay-root.test.ts tests/integration/confirm-card.test.ts` — PASS before review fixes (32/32).
- `npm test -- --run tests/integration/content-app.test.ts tests/integration/selection-controller.test.ts` — PASS after the Shadow DOM capture fix (29/29).
- `npm test -- --run tests/unit/export-service.test.ts` — PASS after callback-success coverage (9/9).
- `npm test -- --run` — PASS (97/97 across 12 files), final fresh run immediately before the review-fix commit.
- `npx tsc --noEmit` — PASS, final fresh run.
- `npm run build` — PASS; Vite transformed 16 modules and emitted the non-empty content chunk.
- `git diff --check` — PASS.
- `git diff -- manifest.config.ts` — empty; production manifest scope and permissions are unchanged.

## Self-review

- Chrome download acceptance is awaited before URL revocation; API rejection and callback `lastError` both fall back with the same still-live URL.
- Anchor removal is in `finally`; double failure leaves no anchor while deliberately retaining the URL for the visible retry action.
- Retained URLs have one owner at a time. Concurrent retry cancellation defers low-level release until the in-flight attempt settles and prevents stale UI completion.
- Content listeners are named and removed; controller observers/listeners, overlay host, pending retained URL, and busy UI state are all cleaned idempotently.
- A destroyed app does not continue from pending save/render into render/export work.
- Generation is guarded both in OverlayRoot and the application before the first asynchronous boundary.
- Busy generation disables both Generate and Cancel. Old retained Cancel nodes and synthetic `cancel-generate` events cannot close confirmation or mutate selection state until the operation settles.
- Only the four preference fields are constructed and persisted; generated attributes and source content remain local.
- Production bootstrap is isolated from test imports and the built content chunk is non-empty.

## Independent Review

- Initial read-only review found one Critical issue: SelectionController document-capture listeners treated retargeted Shadow DOM controls as outside clicks. It also found two Minor test gaps: callback-success coverage and a direct isolated-import bootstrap assertion.
- The Critical issue was reproduced with real components in four failing tests and fixed at the event-source boundary. Callback success was also covered with delayed acceptance and revocation assertions.
- Focused re-review found no unresolved Critical or Important issues and returned `Ready: Yes`.
- Root review round 1 found one Important busy-cancel inconsistency and two Minor gaps (direct supported-page import coverage and strict four-digit years). All three were reproduced or covered and resolved with focused tests.

## Commit

- `feat: complete local card generation flow`

## Concerns and Next Step

- Test-mode bootstrap isolation is implemented through Vite's `import.meta.env.MODE` and now has direct import coverage on a supported Bilibili URL. Real browser verification should still confirm exactly one overlay host.
- Task 9/10 browser verification should prefer the installed `chrome-mcp-tools` for real Chrome and extension interaction. Playwright remains the repeatable automated baseline for regression coverage.
- No browser `alert`, backend, AI, React, Tailwind, Framer Motion, or html2canvas was introduced.
