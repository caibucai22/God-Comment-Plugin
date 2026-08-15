# Task 9 Report: Browser E2E Acceptance and Usage Documentation

## Outcome

- Added a deterministic Playwright baseline that loads the unpacked `dist/` extension into a persistent bundled Chromium context with `--disable-extensions-except` and `--load-extension`.
- Added a dynamic-port localhost HTTP fixture shaped like Bilibili comments, with an in-process cover asset and no public-site dependency.
- Added an isolated `e2e` Vite/manifest mode. Only the E2E build accepts `http://127.0.0.1/*` and the local `/video/` fixture; a normal build keeps the production content-script match exactly `https://www.bilibili.com/video/*`.
- Added setup/teardown builds that inspect the generated production manifest before the temporary E2E build and restore/inspect production `dist/` afterward.
- Added README setup, validation, load-unpacked, feature, permission, privacy, URL-scope, and limitation documentation using PowerShell-only examples.
- Added `docs/testing/chrome-mcp-checklist.md`. It explicitly records that this implementer did not run Chrome MCP and hands the actual real-browser MCP session to the parent/controller.
- Fixed an initialization race exposed by repeated E2E: the overlay is now mounted only after preferences load, so the visible entry cannot accept and lose a click before content-app listeners exist.
- Isolated Vitest discovery to unit/integration `*.test.ts` files so Playwright `*.spec.ts` is never collected by Vitest.

## Automated Browser Coverage

The three real-browser tests verify:

1. Entry visible, enter selection, legal comment hover, `ccg-comment-hover`, comment selection, confirmation, exact comment preview, four styles, default `3:4`, available/checked cover, game decoration false, exact no-fallback success message, real download event, `.png` suggested filename, and non-empty retained file.
2. Escape exit, right-click exit with fixture context menu suppressed, non-comment exit, entry-toggle exit, hint exit, and wheel preserving selection.
3. `prefers-reduced-motion: reduce` producing `animationName: none` while entry, selection, comment click, and confirmation remain usable.

The happy path also collects `pageerror` and error-level console messages from before navigation and requires the collection to remain empty.

Persistent profile, local server, and download resources are cleaned after each test. Cleanup covers browser-launch failure and continues across individual cleanup failures. Playwright runs one worker because the extension build/context is shared by process-level setup.

## TDD / RED-GREEN Evidence

### RED: missing E2E boundary

- `RED缺少E2E基线_执行命令说明_20260815_113238.log`
- `npm run test:e2e` exited 1. Without a dedicated Playwright config, Playwright collected Vitest files, reported CSS/Vitest runner errors, and ended with `No tests found`.

### Runtime prerequisite investigation

- `RED本地Fixture未注入_执行命令说明_20260815_113534.log` and `RED本地Fixture未注入修正运行时_执行命令说明_20260815_113600.log` showed that neither the separate headless shell nor the expected full bundled Chromium was installed.
- System Chrome/Edge 151 were present, but are not used as an extension-loading fallback. After approved `npx playwright install chromium`, bundled Chromium 151.0.7922.34 existed and launched through `channel: "chromium"`.

### RED: production-only match rejects fixture

- `RED测试构建范围缺失_执行命令说明_20260815_113909.log`
- The real persistent browser launched successfully; the test failed exactly because the local fixture had no “开启评论选择” entry.

### GREEN: full happy path

- `GREEN完整选择下载流程修复观察_执行命令说明_20260815_114224.log`
- The unpacked E2E build loaded and the full selection-to-PNG flow passed 1/1.
- A preceding diagnostic run proved Playwright stores the physical download using a GUID while `suggestedFilename()` contains the user-facing `.png` name; the final test asserts the correct two boundaries.

### RED/GREEN: Vitest and Playwright isolation

- `最终全量验证_执行命令说明_20260815_115421.log` failed because Vitest collected `tests/e2e/selection-flow.spec.ts` after all 97 existing tests passed.
- `GREEN隔离Vitest与Playwright_执行命令说明_20260815_115505.log` passed 97/97 after the minimal Vitest include boundary.

### RED/GREEN: visible-entry readiness race

- A repeated full E2E run failed because the reduced-motion test clicked the already-visible entry before asynchronous preference loading had attached the content-app listener.
- `RED偏好加载前入口可交互_执行命令说明_20260815_115712.log` reproduced this in integration: expected zero mounts while preferences were pending, received one.
- `GREEN入口就绪竞态_执行命令说明_20260815_115749.log` recorded `GREEN_VERIFICATION=PASS`; the focused content-app suite passed 20/20 and reduced-motion E2E passed after moving mount after preference load.

## Final Verification

- `最终目标E2E_执行命令说明_20260815_120057.log` — PASS, targeted real-browser happy path 1/1.
- `最终单元集成_执行命令说明_20260815_120117.log` — PASS, 98/98 tests across 12 files.
- `最终TypeScript可审计复跑_执行命令说明_20260815_120713.log` — PASS, `npx tsc --noEmit` exit 0; transcript exists even though tsc produced no diagnostic output.
- `最终生产构建前置_执行命令说明_20260815_120154.log` — PASS, Vite production build transformed 16 modules.
- `最终完整E2E_执行命令说明_20260815_120206.log` — PASS, 3/3 with one worker; setup built/inspected production, built E2E, and teardown restored production.
- `最终生产Manifest差异检查干净复跑_执行命令说明_20260815_120257.log` — PASS, final production build; generated content-script match exactly `https://www.bilibili.com/video/*`, permissions exactly `storage,downloads`, `host_permissions` absent.
- `最终差异检查无换行提示_执行命令说明_20260815_120312.log` — PASS, `git -c core.autocrlf=false diff --check` exit 0 with no output.

Logs live in ignored `.superpowers/sdd/2026-08-12-comment-card-extension-implementation/task-9-logs/` and use non-overwriting `_执行命令说明_YYYYMMDD_HHmmss` names.

## Environment

- Windows Native / Win32NT, OS build reported as Microsoft Windows 10.0.26200 by the runtime on Windows 11.
- PowerShell 7.6.4 Core.
- Node.js v22.22.2; npm 10.9.7.
- Playwright 1.62.1.
- Bundled Chromium 151.0.7922.34 at the Playwright user cache path.
- Version evidence: `运行时版本采集_执行命令说明_20260815_115344.log`.

## Independent Review

The read-only reviewer found no Critical issues and initially returned “With fixes” for:

1. Incomplete cleanup when browser launch or an earlier cleanup action fails.
2. A success assertion that also accepted the cover-fallback message.
3. This required report/commit still being pending.
4. A Minor Chrome MCP fixture-lifetime ambiguity.

The implementation now wraps the full fixture lifecycle, attempts every cleanup, reports cleanup errors when they are the primary failure, asserts the exact non-fallback message span, adds this report, and states that the current MCP manual path uses a real Bilibili page because the automated fixture is not kept alive after E2E.

## Manifest and Runtime Concerns

- Normal `dist/manifest.json` is restored after every successful E2E run and was rebuilt/inspected again at final verification.
- CRXJS emits its existing origin-level `web_accessible_resources` match for the generated content chunk; content-script injection remains limited to the exact video URL pattern and no `host_permissions` are added.
- E2E requires Playwright bundled Chromium. Missing browsers fail explicitly; tests are never silently skipped. Install with `npx playwright install chromium`.
- System Chrome/Edge 151 are not the automated fallback because current branded browsers may reject unpacked-extension command-line loading.

## Chrome MCP Handoff

- Checklist: `docs/testing/chrome-mcp-checklist.md`.
- Actual Chrome MCP execution: **not performed by this implementer**.
- Parent/controller should build production `dist/`, load it in real Chrome, select/open a supported Bilibili video page, capture a snapshot, evaluate the open Shadow DOM when needed, exercise click/hover/Escape/right-click, inspect console, and save screenshot/log evidence using `_执行命令说明_YYYYMMDD_HHmmss` names.

## Commit

- Starting point: `b301f59d465a0559d23228c831a8eb4473791be5` (`fix: guard cancellation during generation`).
- Task 9 commit title: `test: verify comment card extension flow`. The exact resulting SHA is supplied in the parent handoff because this report is included in that commit and cannot contain its own final SHA.
