# Browser Extension Pixel-Perfect Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有确认卡重构为一个固定尺寸、共享外壳、可在五种业务状态间切换的粉白像素风浏览器插件 Panel，并以逐状态截图完成视觉校正。

**Architecture:** `OverlayRoot` 继续拥有 Shadow DOM 与宿主生命周期，新建纯状态模型和 `ExtensionPanel` 渲染单元；内容应用通过明确事件驱动 `editing → generating → generated → saved` 与失败回退。生成产物在用户确认保存前保留，不再渲染完成后立即下载。

**Tech Stack:** TypeScript、原生 DOM、Shadow DOM、CSS、Vitest/JSDOM、Playwright、Vite/Manifest V3。

**Spec:** `docs/superpowers/specs/2026-08-15-mvp-rc-two-stage-optimization-design.md` 第 19 节。

## Global Constraints

- 运行时只显示一个 `320 × 754px` Panel，不创建五列页面。
- 五状态共享 Shell、Header、Stepper、固定几何与 BottomDecoration。
- Panel 不显示 Beta 标识。
- 不使用 Emoji、随机图标、网络图片或不一致的替代素材。
- 缺失素材使用无图形占位节点和 `data-missing-asset` 标记，并在验收报告列出。
- 真实卡片预览来自最终 artifact，不应用 `image-rendering: pixelated`。
- 生产权限不新增，所有生成与保存保持本地。
- 每个行为变更必须先有失败测试；每个视觉阶段必须有浏览器截图证据。
- 日志与交接总结写入 Git 忽略目录，不纳入提交；不得 push。

---

### Task 1: Panel 状态模型与共享 Shell

**Files:**
- Create: `src/ui/extension-panel.ts`
- Create: `src/ui/panel-state.ts`
- Modify: `src/ui/overlay-root.ts`
- Modify: `src/ui/overlay.css`
- Test: `tests/integration/extension-panel.test.ts`
- Test: `tests/integration/overlay-root.test.ts`

**Interfaces:**
- Produces: `PanelState = "editing" | "generating" | "failed" | "generated" | "saved"`。
- Produces: `PanelViewModel`，包含 source、preferences、draft、progress/error/artifact/saveInfo 等当前状态所需数据。
- Produces: `createExtensionPanel(document, model, handlers): HTMLElement`，每次只渲染一个共享 `.ccg-extension-panel`。

- [ ] **Step 1: 写共享 Shell 的失败测试**

断言五种 model 分别渲染时都只有一个 `.ccg-extension-panel`，并拥有同一 `.ccg-panel-header`、`.ccg-stepper`、`.ccg-state-viewport`、`.ccg-bottom-decoration`；断言不存在 Beta 文案和五列容器。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `npm test -- --run tests/integration/extension-panel.test.ts`

Expected: FAIL，原因是 `extension-panel` 模块不存在。

- [ ] **Step 3: 实现状态类型和最小共享 Shell**

使用单一 DOM 树与 state 分支替换 `StateViewport`；Shell 上设置 `data-panel-state`，Stepper 依据映射激活步骤，Header 和 BottomDecoration 始终由同一构造函数创建。

- [ ] **Step 4: 接入 OverlayRoot 并保持旧入口/选择事件兼容**

`showConfirm()` 打开 `editing`；`setGenerationBusy(true)` 切换 `generating`；销毁后保留节点事件继续惰性。

- [ ] **Step 5: 运行目标测试与现有 Overlay 测试**

Run: `npm test -- --run tests/integration/extension-panel.test.ts tests/integration/overlay-root.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交**

Run: `git add src/ui tests/integration && git commit -m "feat: add shared pixel panel shell"`

### Task 2: Editing 状态与折叠控件

**Files:**
- Modify: `src/ui/extension-panel.ts`
- Modify: `src/ui/overlay.css`
- Modify: `src/domain/types.ts`
- Modify: `src/storage/preferences.ts`
- Test: `tests/integration/extension-panel.test.ts`
- Test: `tests/unit/preferences.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `PanelViewModel` 与 `createExtensionPanel()`。
- Produces: `panel-generate` 事件 detail，包含编辑后的正文与风格、比例、封面、趣味属性、游戏化装饰、声效选项。

- [ ] **Step 1: 写 Editing 行为失败测试**

覆盖内容设置默认展开、样式设置和更多选项折叠、评论可编辑/恢复、风格选项含 Bilibili 默认/温暖/历史/嘲讽/SSS、比例为 3:4/16:9、趣味属性默认关闭、面板皮肤仅在更多选项切换且不改变卡片风格。

- [ ] **Step 2: 运行并确认 RED**

Run: `npm test -- --run tests/integration/extension-panel.test.ts tests/unit/preferences.test.ts`

Expected: FAIL 于缺失控件、类型或默认值。

- [ ] **Step 3: 实现原生表单语义和事件**

使用 textarea、radio、checkbox 与 button；折叠标题使用 `aria-expanded`/`aria-controls`；空正文阻止生成；恢复原文只修改当前草稿。

- [ ] **Step 4: 实现固定几何与参考图视觉令牌**

Panel `320 × 754px`、Header `68px`、Stepper `58px`、内容 padding `14px`、BottomDecoration `128px`；用多层伪元素形成粉色像素角，缺失图形节点只显示空白占位并带 `data-missing-asset`。

- [ ] **Step 5: 运行目标测试**

Run: `npm test -- --run tests/integration/extension-panel.test.ts tests/unit/preferences.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交**

Run: `git add src tests && git commit -m "feat: build pixel editing panel"`

### Task 3: 五状态转换与延迟保存

**Files:**
- Modify: `src/content/index.ts`
- Modify: `src/ui/overlay-root.ts`
- Modify: `src/ui/extension-panel.ts`
- Modify: `src/export/export-service.ts`
- Test: `tests/integration/content-app.test.ts`
- Test: `tests/integration/extension-panel.test.ts`
- Test: `tests/unit/export-service.test.ts`

**Interfaces:**
- Produces: Overlay 方法 `showGenerated(artifact)`、`showFailed(message)`、`showSaved(info)`。
- Produces: `PngArtifact` 生命周期：生成后预览，确认保存后下载，返回修改/关闭/销毁时释放。
- Produces events: `cancel-generation`、`retry-generation`、`return-editing`、`confirm-save`、`create-another`。

- [ ] **Step 1: 写状态机失败测试**

断言点击制作后为 generating；渲染成功后不下载而进入 generated；确认保存才下载并进入 saved；失败进入 failed；重试、返回修改、再做一张路径正确；重复事件只执行一次。

- [ ] **Step 2: 运行并确认 RED**

Run: `npm test -- --run tests/integration/content-app.test.ts tests/integration/extension-panel.test.ts tests/unit/export-service.test.ts`

Expected: FAIL，因为当前实现渲染后立即下载且没有 generated/saved 状态。

- [ ] **Step 3: 拆分 artifact 创建与下载**

生成阶段创建 Blob/Object URL；保存阶段调用 Chrome downloads；在返回、替换、关闭和 destroy 时统一 revoke。

- [ ] **Step 4: 接入五状态事件与错误恢复**

保留草稿和选项；生成失败回 failed；下载失败保持 generated 并显示可重试保存；取消生成不留下后台状态更新。

- [ ] **Step 5: 运行目标与全量测试**

Run: `npm test -- --run`

Expected: PASS。

- [ ] **Step 6: 提交**

Run: `git add src tests && git commit -m "feat: drive panel generation state machine"`

### Task 4: 单 Panel 浏览器预览与逐状态 E2E

**Files:**
- Create: `tests/e2e/panel-preview.html`
- Create: `tests/e2e/panel-preview-entry.ts`
- Create: `tests/e2e/panel-visual.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `vite.config.ts`
- Test: `tests/e2e/panel-visual.spec.ts`

**Interfaces:**
- Consumes: `createExtensionPanel()`。
- Produces: `?state=editing|generating|failed|generated|saved` 单状态预览；任意页面只挂载一个 Panel。

- [ ] **Step 1: 写单状态预览失败测试**

五个 case 分别导航到对应 query，断言页面只存在一个 Panel、固定 bounding box、正确 state、无 Beta、无横向五列布局。

- [ ] **Step 2: 运行并确认 RED**

Run: `npx playwright test tests/e2e/panel-visual.spec.ts`

Expected: FAIL，原因是预览入口不存在。

- [ ] **Step 3: 实现预览夹具和确定性数据**

每个 query 只渲染对应状态；生成预览使用本地确定性 Canvas；缺失素材节点保留 `data-missing-asset`，不引入替代图。

- [ ] **Step 4: 固化五状态截图**

使用固定浏览器 viewport，使 Panel 以整数像素渲染；保存截图到 Git 忽略的 `.superpowers/visual-qa/round-1/`。

- [ ] **Step 5: 运行 E2E**

Run: `npx playwright test tests/e2e/panel-visual.spec.ts`

Expected: PASS。

- [ ] **Step 6: 提交**

Run: `git add tests/e2e playwright.config.ts vite.config.ts && git commit -m "test: add single panel visual harness"`

### Task 5: 三轮 Visual QA、回归验证与交接

**Files:**
- Modify: `src/ui/overlay.css`
- Modify: `src/ui/extension-panel.ts`
- Create ignored: `.superpowers/visual-qa/round-1/`
- Create ignored: `.superpowers/visual-qa/round-2/`
- Create ignored: `.superpowers/visual-qa/round-3/`
- Create ignored: `.superpowers/status/pixel-panel-handoff_执行命令说明_<timestamp>.md`

**Interfaces:**
- Consumes: Task 4 的单状态预览。
- Produces: 五状态三轮截图、每轮差异清单、最终验证证据和素材缺口清单。

- [ ] **Step 1: Round 1 — P0 Geometry**

逐状态截图并记录 Panel 宽高、Header、Stepper、Content、按钮、预览和 BottomDecoration 的最大差异；只修复几何与对齐。

- [ ] **Step 2: Round 2 — P1/P2 Spacing 与 Typography**

逐状态截图，校正 padding、gap、字号、字重、行高和中文换行；不以默认字体代替明确字体栈。

- [ ] **Step 3: Round 3 — P3/P4 Style 与 Pixel Art**

校正颜色、边框、像素角、圆角、阴影和已有素材缩放；所有缺失素材继续明确标记并写入交接。

- [ ] **Step 4: 运行最终验证并分别记录日志**

Run: `npm test -- --run`

Run: `npx tsc --noEmit`

Run: `npm run build`

Run: `npx playwright test`

Run: `git diff --check`

Expected: 全部通过；日志使用不覆盖的时间戳文件名写入 `.superpowers/logs/`。

- [ ] **Step 5: 写本地交接报告**

报告必须列出已完成部分、仍有明显差异、Missing Asset、下一轮最高优先级和真实浏览器人工验证步骤；文件保持 Git 忽略。

- [ ] **Step 6: 提交代码与受管测试**

Run: `git add src tests docs/superpowers && git commit -m "feat: reconstruct pixel panel states"`
