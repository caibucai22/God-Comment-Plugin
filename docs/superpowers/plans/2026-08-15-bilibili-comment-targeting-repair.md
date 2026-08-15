# B站评论目标识别与动画连续性修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 正确识别真实 B站顶层评论与当前已渲染回复，并让指针移动、Shadow DOM 边界切换和滚动后的高亮过渡持续、准确、流畅。

**Architecture:** `BilibiliAdapter` 负责把事件或坐标命中的元素解析为统一 `ResolvedCommentTarget`，目标包含宿主、可见锚点和类型。`SelectionController` 记录指针坐标并通过单个 RAF 协调 pointer/scroll 事件，`CommentHighlight` 只负责复用视觉层、更新几何与控制近距离过渡。

**Tech Stack:** TypeScript、Chrome Extension Manifest V3、原生 DOM/Shadow DOM API、Vitest、Playwright、CSS Animation。

## Global Constraints

- 只支持当前已渲染的 `bili-comment-renderer` 与任意数量 `bili-comment-reply-renderer`；不自动展开、不处理回复分页。
- 不使用 XPath、第三方 DOM 库、全量评论扫描、矩形缓存、轮询或 subtree MutationObserver。
- pointer 与 scroll 同帧只允许一个 RAF 协调任务。
- 高亮层必须复用；近距离不超过 240px 使用约 140ms ease-out，远距离直接定位。
- reduced motion 下关闭循环动画与位置过渡。
- fixture 必须脱敏，不保存用户提供的正文、昵称、ID、头像或 URL。

---

## File Map

- Modify: `src/platform/platform-adapter.ts` — 定义统一评论目标接口。
- Modify: `src/platform/bilibili-adapter.ts` — 真实顶层/回复宿主解析、限定范围字段提取。
- Create: `src/selection/deep-element-from-point.ts` — 沿单一 open Shadow DOM 命中路径深入。
- Modify: `src/selection/selection-controller.ts` — 指针坐标、RAF 协调、点击与滚动命中。
- Modify: `src/selection/comment-highlight.ts` — 复用视觉层并按距离控制过渡。
- Modify: `src/selection/comment-highlight.css` — 140ms 几何过渡及 reduced-motion。
- Modify: `tests/unit/bilibili-adapter.test.ts` — 真实 sibling 结构与回复提取测试。
- Create: `tests/unit/deep-element-from-point.test.ts` — 深层命中边界测试。
- Modify: `tests/integration/selection-controller.test.ts` — 连续目标与滚动协调测试。
- Modify: `tests/integration/comment-highlight.test.ts` — 节点复用和近远距离过渡测试。
- Modify: `tests/e2e/fixture-page.html` — 忠实的 thread/top-level/replies DOM。
- Modify: `tests/e2e/selection-flow.spec.ts` — 顶层、回复、滚动与生成闭环。
- Modify: `docs/status/2026-08-15-mvp-acceptance-handoff.md` — 撤销旧假阳性并记录新证据。

---

### Task 1: 真实评论目标与回复解析

**Files:**
- Modify: `src/platform/platform-adapter.ts`
- Modify: `src/platform/bilibili-adapter.ts`
- Modify: `tests/unit/bilibili-adapter.test.ts`
- Modify: `tests/e2e/fixture-page.html`

**Interfaces:**
- Produces: `ResolvedCommentTarget { host: Element; anchor: Element; kind: "top-level" | "reply" | "legacy" }`
- Produces: `PlatformAdapter.resolveCommentTarget(target: EventTarget | null): ResolvedCommentTarget | null`
- Consumes: 当前页面 open Shadow DOM 和既有 `CommentCardSource`。

- [ ] **Step 1: 用真实 sibling 结构替换错误 fixture**

构建 `bili-comment-thread-renderer.shadowRoot`，其中顶层 renderer 与 `#replies` 为兄弟；`bili-comment-replies-renderer.shadowRoot #expander-contents` 内放置至少两个 `bili-comment-reply-renderer`，每个都有自己的 `shadowRoot > #body`、脱敏正文、昵称和时间。

- [ ] **Step 2: 写失败的 adapter 测试**

断言：顶层返回 `kind: "top-level"`；任一回复返回 `kind: "reply"`；回复 anchor 是自身 `#body`；回复字段来自自身；顶层正文不包含回复；replies/thread 容器返回 null。

- [ ] **Step 3: 运行 RED**

Run: `npm test -- --run tests/unit/bilibili-adapter.test.ts`

Expected: 回复解析与真实 fixture 断言失败，因为当前选择器没有 `bili-comment-reply-renderer`，接口也没有统一目标。

- [ ] **Step 4: 实现最小目标接口与适配器**

```ts
export interface ResolvedCommentTarget {
  readonly host: Element;
  readonly anchor: Element;
  readonly kind: "top-level" | "reply" | "legacy";
}
```

新增 `bili-comment-reply-renderer`，从命中元素沿 composed parent 查找最近宿主。anchor 只读取 `host.shadowRoot?.querySelector("#body") ?? host`。`extractComment` 接收明确 host，并限定在该 host 的 open Shadow DOM 范围内。

- [ ] **Step 5: 运行 GREEN 与类型检查**

Run: `npm test -- --run tests/unit/bilibili-adapter.test.ts`

Run: `npx tsc --noEmit`

Expected: PASS。

- [ ] **Step 6: Commit**

```powershell
git add src/platform tests/unit/bilibili-adapter.test.ts tests/e2e/fixture-page.html
git commit -m "fix: resolve Bilibili comment replies"
```

---

### Task 2: Shadow DOM 深层命中与滚动协调

**Files:**
- Create: `src/selection/deep-element-from-point.ts`
- Modify: `src/selection/selection-controller.ts`
- Create: `tests/unit/deep-element-from-point.test.ts`
- Modify: `tests/integration/selection-controller.test.ts`

**Interfaces:**
- Consumes: `PlatformAdapter.resolveCommentTarget(target)`。
- Produces: `deepElementFromPoint(document: Document, clientX: number, clientY: number, maxDepth?: number): Element | null`。
- Produces: SelectionController 内部单一 `schedulePointerReconciliation()` RAF 调度。

- [ ] **Step 1: 写深层命中失败测试**

测试 document → host.shadowRoot → nested host.shadowRoot 的单一路径；断言返回最深元素、重复命中停止、16层上限生效、没有命中返回 null。

- [ ] **Step 2: 运行深层命中 RED**

Run: `npm test -- --run tests/unit/deep-element-from-point.test.ts`

Expected: FAIL，因为模块不存在。

- [ ] **Step 3: 实现深层命中**

```ts
export function deepElementFromPoint(
  document: Document,
  clientX: number,
  clientY: number,
  maxDepth = 16,
): Element | null
```

只沿当前命中元素的 open shadowRoot 深入；相同结果或达到上限即停止。

- [ ] **Step 4: 写控制器失败测试**

验证 pointermove 更新最后坐标；同帧多事件只调度一个 RAF；RAF 使用最终坐标；scroll 后静止光标下的新回复切换；非评论命中清除；点击回复使用统一目标；退出后 RAF 与监听全部清理。

- [ ] **Step 5: 运行控制器 RED**

Run: `npm test -- --run tests/integration/selection-controller.test.ts`

Expected: 新增 pointermove/scroll 命中测试失败。

- [ ] **Step 6: 实现单 RAF 协调**

选择模式监听 `pointermove` 保存坐标并调度协调；scroll/resize 有坐标时调度重新命中。协调函数调用 `deepElementFromPoint`，随后调用 adapter 解析统一目标。点击优先 composedPath，必要时回退点击坐标深层命中。保留 Escape、右键、非评论点击、入口与提示退出规则。

- [ ] **Step 7: 运行 GREEN**

Run: `npm test -- --run tests/unit/deep-element-from-point.test.ts tests/integration/selection-controller.test.ts`

Run: `npx tsc --noEmit`

Expected: PASS。

- [ ] **Step 8: Commit**

```powershell
git add src/selection tests/unit/deep-element-from-point.test.ts tests/integration/selection-controller.test.ts
git commit -m "fix: reconcile comment targets from pointer coordinates"
```

---

### Task 3: 动画连续性、真实 E2E 与验收文档

**Files:**
- Modify: `src/selection/comment-highlight.ts`
- Modify: `src/selection/comment-highlight.css`
- Modify: `tests/integration/comment-highlight.test.ts`
- Modify: `tests/e2e/selection-flow.spec.ts`
- Modify: `docs/status/2026-08-15-mvp-acceptance-handoff.md`

**Interfaces:**
- Consumes: `ResolvedCommentTarget.anchor`。
- Produces: `CommentHighlight.show(anchor)` 复用同一视觉层，并设置近/远距离过渡状态。

- [ ] **Step 1: 写动画连续性失败测试**

断言同一层从 A 切到 B 后 DOM 身份不变；中心距离不超过 240px 时启用 transition；超过阈值时本次更新禁用 transition；下一帧恢复默认能力；reduced motion 由 CSS 禁用动画和 transition。

- [ ] **Step 2: 运行动画 RED**

Run: `npm test -- --run tests/integration/comment-highlight.test.ts`

Expected: 距离阈值和过渡状态断言失败。

- [ ] **Step 3: 实现最小过渡逻辑**

CSS 为几何属性设置 `140ms ease-out`。TS 比较前后矩形中心距离，通过 data attribute 或内联 transition 临时区分瞬移；不删除视觉层。reduced-motion 中 `animation: none` 且 `transition: none`。

- [ ] **Step 4: 写真实结构 E2E**

验证顶层 → 回复1 → 回复2 → 下一顶层高亮连续，回复确认面板显示自身脱敏正文，滚动使新目标进入静止光标后自动切换，生成并下载非空 PNG，五种退出和 reduced-motion 不回归。

- [ ] **Step 5: 运行完整 E2E**

Run: `npm run test:e2e`

Expected: PASS，且 teardown 恢复生产 manifest。

- [ ] **Step 6: 更新验收状态**

撤销旧错误 fixture 的回复 PASS 证据；记录新自动化为 PASS、真实 B站仍待用户复测。日志使用 `_执行命令说明_YYYYMMDD_HHmmss` 且不包含个人数据。

- [ ] **Step 7: 完整门禁**

Run: `npm test -- --run`

Run: `npx tsc --noEmit`

Run: `npm run build`

Run: `npm run test:e2e`

Run: `git diff --check`

Expected: 全部 exit 0。

- [ ] **Step 8: Commit**

```powershell
git add src/selection tests docs/status docs/logs
git commit -m "fix: keep Bilibili comment highlighting continuous"
```
