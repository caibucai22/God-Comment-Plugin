# Compact Panel Production Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将真实 B 站页面中的制作面板收敛为约 `336 × 570px`、信息密度更高且不与评论选择态冲突的生产级插件 UI。

**Architecture:** 保留现有 `PanelState` 与 `OverlayRoot` 生命周期，以共享 Shell 的 Header、可滚动 StateViewport、固定 ActionArea、低权重 BottomDecoration 重新组织布局。Editing 状态继续使用原生表单；选择提示由 Overlay 根据 confirmation 可见性自动抑制，不修改评论命中与解析逻辑。

**Tech Stack:** TypeScript、原生 DOM、Shadow DOM、CSS、Vitest/JSDOM、Playwright、Vite。

**Spec:** `docs/superpowers/specs/2026-08-15-mvp-rc-two-stage-optimization-design.md` 与 2026-09-11 真实 B 站截图评估结论。

## Global Constraints

- 单 Panel 目标宽高为 `336 × min(570px, calc(100dvh - 32px))`，比例约 `1:1.696`，不得扩展为页面或侧边栏应用。
- 删除可见数字 Stepper，但保留五状态模型和状态专属文案。
- Header 目标高度 `48px`；底部品牌层目标高度 `44px`。
- 主操作区固定在 Shell 内，Accordion 内容单独滚动。
- B站粉只用于主 CTA、选中和焦点；结构边框改为中性灰；恢复原文使用 B站蓝。
- Panel 打开时隐藏选择提示，关闭/返回后的选择状态由既有 ContentApp 事件决定。
- 不恢复 Beta，不新增依赖，不修改卡片渲染器，不执行 merge 或 push。

---

### Task 1: Compact Shell and Selection Context

**Files:**
- Modify: `src/ui/extension-panel.ts`
- Modify: `src/ui/overlay-root.ts`
- Modify: `src/ui/overlay.css`
- Test: `tests/integration/extension-panel.test.ts`
- Test: `tests/integration/overlay-root.test.ts`
- Test: `tests/e2e/panel-visual.spec.ts`

**Interfaces:**
- Preserves: `PanelState` and all existing Overlay events.
- Produces: one `.ccg-panel-action-area` outside `.ccg-state-scroll`, with state content and actions rendered into separate targets.

- [ ] Write failing tests asserting no `.ccg-stepper`, fixed Header/scroll/action/decor structure, selection prompt hidden while a Panel is open, and `336 × 570` geometry.
- [ ] Run focused Vitest and Playwright tests and verify failures describe the old shell.
- [ ] Move state actions out of content, remove Stepper rendering, suppress prompt when `confirmation` exists, and implement compact geometry.
- [ ] Run focused tests until green.

### Task 2: Editing Density and Summaries

**Files:**
- Modify: `src/ui/extension-panel.ts`
- Modify: `src/ui/overlay.css`
- Test: `tests/integration/extension-panel.test.ts`

**Interfaces:**
- Produces: live `.ccg-character-count`, style summary, options summary, and complete `恢复原文` label.

- [ ] Write failing tests for `0 / 500` style live counts, `温暖 · 3:4` summaries, default/selected option summaries, and complete restore copy.
- [ ] Verify RED, implement summaries and live count without changing `GenerateOptions`, then verify GREEN.

### Task 3: Neutral Production Visual System

**Files:**
- Modify: `src/ui/overlay.css`
- Test: `tests/e2e/panel-visual.spec.ts`

**Interfaces:**
- Consumes: compact Shell DOM from Tasks 1–2.
- Produces: neutral structural tokens, restrained pink CTA, blue text action, low-weight pixel decoration.

- [ ] Add browser assertions for visible fixed actions, scroll containment, and full Panel viewport fit at the target size.
- [ ] Verify RED where the old geometry exceeds constraints.
- [ ] Apply neutral borders, compact control spacing, quiet close button, `44px` decoration, and reduced-motion-safe transitions.
- [ ] Capture five state screenshots and compare geometry before changing micro-style.

### Task 4: Full Regression and Real-Page Handoff

**Files:**
- Modify ignored: `.superpowers/status/compact-panel-handoff_执行命令说明_<timestamp>.md`

- [ ] Run full Vitest, TypeScript, production build, and Playwright with timestamped ignored logs.
- [ ] Verify production manifest permissions and asset output remain unchanged in scope.
- [ ] Record Chrome manual checks for DPR/zoom, long comment, all Accordion sections, five states, 3:4 and 16:9.
- [ ] Request independent code review and address all Critical/Important findings before local commit.
