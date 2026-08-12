# 神评卡片浏览器扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 Manifest V3 浏览器扩展，让用户在 B 站网页版选择评论、确认样式，并在本地生成可下载的 PNG 评论卡片。

**Architecture:** Content Script 通过统一 `PlatformAdapter` 读取页面，`SelectionController` 管理选择状态，Shadow DOM 承载所有扩展 UI。评论数据、稳定趣味属性和样式令牌交给 Canvas 渲染管线，扩展不依赖后端或 HTML 截图库。

**Tech Stack:** TypeScript 5、Vite 7、`@crxjs/vite-plugin`、Vitest 3、jsdom、Playwright、原生 Web Components/Shadow DOM、Canvas 2D、Chrome Extension Manifest V3。

## Global Constraints

- 首发只匹配 `https://www.bilibili.com/video/*`，业务代码仍只依赖统一 `PlatformAdapter`。
- MVP 不使用 React、Tailwind、Framer Motion、`html2canvas`、后端或 AI API。
- 默认比例为 `3:4`（`1200 × 1600`），可切换 `9:16`（`1080 × 1920`），只导出 PNG。
- 风格为 `warm | history | sarcasm | sss`；游戏化装饰默认关闭。
- 趣味属性为幽默、温暖、嘲讽三项 `0–100`，同评论、同风格、同算法版本结果一致，至少一项位于 `80–99`。
- 所有扩展 UI 位于 Shadow DOM；离开选择模式必须清除宿主页面临时状态。
- `Esc`、选择模式下右键、点击非评论区域、再次点击入口或点击退出按钮均可退出。
- `MutationObserver` 只监测评论根容器是否失效或替换，不扫描或登记每条评论。
- 系统启用 `prefers-reduced-motion: reduce` 时禁用粒子和循环动效。
- 评论数据只在当前标签页内存中处理；存储仅包含最近风格、比例、封面和游戏化装饰偏好。

---

## File Map

```text
manifest.config.ts                     Manifest V3 配置
vite.config.ts                         扩展构建与测试别名
src/content/index.ts                   Content Script 组合根
src/domain/types.ts                    跨模块数据契约
src/platform/platform-adapter.ts       平台适配器接口
src/platform/bilibili-adapter.ts       B 站 DOM 提取与封面回退
src/platform/adapter-registry.ts       当前页面的平台解析
src/selection/selection-controller.ts  选择状态机、退出规则、有限监听
src/ui/overlay-root.ts                  Shadow DOM 根与 UI 生命周期
src/ui/overlay.css                      入口、提示、确认、状态卡样式
src/ui/confirm-card.ts                  最小确认卡行为
src/attributes/generator.ts             稳定趣味属性生成器
src/render/styles.ts                    四套主题令牌
src/render/text-layout.ts               文本换行、缩放和截断
src/render/card-renderer.ts             Canvas 卡片绘制
src/render/image-loader.ts              封面和 Logo 资源加载
src/export/export-service.ts            PNG 下载
src/storage/preferences.ts              最近偏好读写
src/assets/bilibili-mark.svg            本地平台标识
tests/fixtures/bilibili-comments.html   稳定 DOM fixture
tests/unit/*.test.ts                    纯逻辑测试
tests/integration/*.test.ts             jsdom 交互与适配测试
tests/e2e/selection-flow.spec.ts         浏览器闭环测试
tests/e2e/fixture-page.html              不依赖线上 B 站的验收页面
```

---

### Task 1: 可构建、可测试的扩展骨架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `manifest.config.ts`
- Create: `src/content/index.ts`
- Create: `src/domain/types.ts`
- Create: `tests/unit/manifest.test.ts`

**Interfaces:**
- Produces: `CommentCardSource`, `GenerateOptions`, `CardAttributes`, `CardStyle`, `CardRatio`, `CardPreferences`。
- Produces: `npm run build`, `npm test`, `npm run test:e2e` scripts。

- [ ] **Step 1: 创建项目清单和失败的 Manifest 测试**

```ts
// tests/unit/manifest.test.ts
import { describe, expect, it } from "vitest";
import manifest from "../../manifest.config";

describe("manifest", () => {
  it("only injects the MVP content script into Bilibili video pages", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.content_scripts?.[0]?.matches).toEqual([
      "https://www.bilibili.com/video/*",
    ]);
    expect(manifest.permissions).toEqual(["storage", "downloads"]);
  });
});
```

- [ ] **Step 2: 安装依赖并验证测试因配置缺失而失败**

Run: `npm install && npm test -- --run tests/unit/manifest.test.ts`

Expected: FAIL，提示无法解析 `manifest.config`。

- [ ] **Step 3: 创建最小配置、领域类型和入口**

```ts
// src/domain/types.ts
export type CardStyle = "warm" | "history" | "sarcasm" | "sss";
export type CardRatio = "3:4" | "9:16";

export interface CommentCardSource {
  platform: "bilibili";
  content: string;
  authorName?: string;
  publishedAt?: string;
  videoCoverUrl?: string;
}

export interface GenerateOptions {
  style: CardStyle;
  ratio: CardRatio;
  includeCover: boolean;
  gameDecoration: boolean;
}

export interface CardAttributes {
  humor: number;
  warmth: number;
  sarcasm: number;
}

export type CardPreferences = GenerateOptions;
```

`manifest.config.ts` 必须导出 `ManifestV3Export`，名称为“神评卡片”，只声明 `storage`、`downloads` 权限和 B 站视频页 Content Script。`package.json` 固定使用 ESM，并提供 `build: vite build`、`test: vitest`、`test:e2e: playwright test`。

- [ ] **Step 4: 运行单测和生产构建**

Run: `npm test -- --run tests/unit/manifest.test.ts && npm run build`

Expected: 1 test PASS；`dist/manifest.json` 与 Content Script 产物生成成功。

- [ ] **Step 5: 提交扩展骨架**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts manifest.config.ts src tests/unit/manifest.test.ts
git commit -m "chore: scaffold comment card extension"
```

---

### Task 2: 统一平台接口与 B 站数据提取

**Files:**
- Create: `src/platform/platform-adapter.ts`
- Create: `src/platform/bilibili-adapter.ts`
- Create: `src/platform/adapter-registry.ts`
- Create: `tests/fixtures/bilibili-comments.html`
- Create: `tests/unit/bilibili-adapter.test.ts`

**Interfaces:**
- Consumes: `CommentCardSource` from `src/domain/types.ts`。
- Produces: `PlatformAdapter` with `matches`, `findCommentRoot`, `resolveComment`, `extractComment`, `getVideoCoverUrl`。
- Produces: `resolvePlatformAdapter(document, location): PlatformAdapter | null`。

- [ ] **Step 1: 写入覆盖评论、嵌套回复、无昵称和封面元数据的 fixture 与失败测试**

```ts
it("extracts normalized source from a nested target", () => {
  document.body.innerHTML = fixture;
  const adapter = new BilibiliAdapter(document, location);
  const nested = document.querySelector("[data-testid=comment-text] span")!;
  const comment = adapter.resolveComment(nested)!;
  expect(adapter.extractComment(comment)).toEqual({
    platform: "bilibili",
    content: "历史不是过去的回声，而是今天仍在发生的选择。",
    authorName: "纸飞机",
    publishedAt: "2026-08-11",
    videoCoverUrl: "https://i0.hdslb.com/demo.jpg",
  });
});
```

Fixture 同时提供 `#commentapp` 根、带 `data-testid="comment-item"` 的稳定测试节点，以及当前 B 站结构候选 class；测试适配器使用有序选择器数组回退。

- [ ] **Step 2: 运行适配器测试并确认失败**

Run: `npm test -- --run tests/unit/bilibili-adapter.test.ts`

Expected: FAIL，提示 `BilibiliAdapter` 尚不存在。

- [ ] **Step 3: 实现接口与容错提取**

```ts
export interface PlatformAdapter {
  readonly platform: CommentCardSource["platform"];
  matches(location: Location): boolean;
  findCommentRoot(): Element | null;
  resolveComment(target: EventTarget | null): Element | null;
  extractComment(element: Element): CommentCardSource | null;
  getVideoCoverUrl(): string | undefined;
}
```

`extractComment` 对正文执行空白折叠和 `trim()`；正文为空返回 `null`；昵称缺失保留 `undefined`；封面按 `meta[property="og:image"]`、播放器图片节点顺序回退。所有 B 站选择器集中在 `bilibili-adapter.ts` 的常量中。

- [ ] **Step 4: 验证提取、缺失字段与错误目标**

Run: `npm test -- --run tests/unit/bilibili-adapter.test.ts`

Expected: 所有 adapter tests PASS。

- [ ] **Step 5: 提交平台适配层**

```bash
git add src/platform tests/fixtures tests/unit/bilibili-adapter.test.ts
git commit -m "feat: add Bilibili platform adapter"
```

---

### Task 3: 稳定趣味属性与偏好存储

**Files:**
- Create: `src/attributes/generator.ts`
- Create: `src/storage/preferences.ts`
- Create: `tests/unit/attribute-generator.test.ts`
- Create: `tests/unit/preferences.test.ts`

**Interfaces:**
- Consumes: `CardStyle`, `CardAttributes`, `CardPreferences`。
- Produces: `generateAttributes(content: string, style: CardStyle): CardAttributes`。
- Produces: `loadPreferences(): Promise<CardPreferences>` and `savePreferences(patch: Partial<CardPreferences>): Promise<CardPreferences>`。

- [ ] **Step 1: 编写稳定性、范围、主属性和默认偏好的失败测试**

```ts
it("returns stable attributes with one strong value", () => {
  const first = generateAttributes("同一条评论", "warm");
  const second = generateAttributes("同一条评论", "warm");
  expect(second).toEqual(first);
  expect(Object.values(first).every((n) => n >= 0 && n <= 100)).toBe(true);
  expect(Math.max(...Object.values(first))).toBeGreaterThanOrEqual(80);
  expect(Math.max(...Object.values(first))).toBeLessThanOrEqual(99);
});
```

偏好默认值必须严格等于 `{ style: "warm", ratio: "3:4", includeCover: true, gameDecoration: false }`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- --run tests/unit/attribute-generator.test.ts tests/unit/preferences.test.ts`

Expected: FAIL，两个模块均不存在。

- [ ] **Step 3: 实现版本化 FNV-1a 种子与 Chrome storage 包装**

生成器使用固定 `ATTRIBUTE_ALGORITHM_VERSION = "v1"`，将 `${version}|${normalizedContent}|${style}` 做 FNV-1a 哈希，再用 `mulberry32` 产生三个值；如果最大值低于 80，将由种子选中的主属性映射到 `80–99`。偏好存储只接受领域类型中的四个字段，并在存储数据非法时回退默认值。

- [ ] **Step 4: 运行属性和存储测试**

Run: `npm test -- --run tests/unit/attribute-generator.test.ts tests/unit/preferences.test.ts`

Expected: 所有 tests PASS；同输入输出严格相同，默认游戏化装饰为 `false`。

- [ ] **Step 5: 提交属性与偏好模块**

```bash
git add src/attributes src/storage tests/unit/attribute-generator.test.ts tests/unit/preferences.test.ts
git commit -m "feat: add stable attributes and preferences"
```

---

### Task 4: 选择状态机与有限动态监听

**Files:**
- Create: `src/selection/selection-controller.ts`
- Create: `tests/integration/selection-controller.test.ts`

**Interfaces:**
- Consumes: `PlatformAdapter`。
- Produces: `SelectionController` constructor `{ adapter, document, onSelect, onStateChange }`。
- Produces: `enter()`, `exit(reason)`, `destroy()`, and readonly `active`。
- `onStateChange` emits `{ active, hoveredElement, reason? }` for UI synchronization。

- [ ] **Step 1: 编写进入、悬停、点击和五种退出路径的失败测试**

测试必须覆盖：`Esc`、右键且 `defaultPrevented === true`、点击非评论区域、调用入口切换、提示退出按钮调用 `exit("hint")`；滚轮事件不得退出。另写一个 observer 测试：替换评论根容器后旧状态被清理并重新挂载，而新增单条评论不会触发全量扫描。

- [ ] **Step 2: 运行状态机测试并确认失败**

Run: `npm test -- --run tests/integration/selection-controller.test.ts`

Expected: FAIL，提示 `SelectionController` 不存在。

- [ ] **Step 3: 实现事件委托、临时 class 和有限 observer**

控制器在 `document` 级捕获 `pointerover`、`pointerout`、`click`、`contextmenu`、`keydown`；每次通过 `adapter.resolveComment(event.target)` 即时判断。只为当前悬停节点增加 `ccg-comment-hover`。`MutationObserver` 观察评论根节点的父节点，只判断根节点 `isConnected` 或 `adapter.findCommentRoot()` 引用是否变化；回调通过单个 `requestAnimationFrame` 节流。

- [ ] **Step 4: 运行状态机测试并检查监听器清理**

Run: `npm test -- --run tests/integration/selection-controller.test.ts`

Expected: 所有 tests PASS；`destroy()` 后分发事件不再触发回调。

- [ ] **Step 5: 提交选择控制器**

```bash
git add src/selection tests/integration/selection-controller.test.ts
git commit -m "feat: add comment selection state machine"
```

---

### Task 5: Shadow DOM 入口、提示与确认卡

**Files:**
- Create: `src/ui/overlay-root.ts`
- Create: `src/ui/confirm-card.ts`
- Create: `src/ui/overlay.css`
- Create: `tests/integration/overlay-root.test.ts`
- Create: `tests/integration/confirm-card.test.ts`

**Interfaces:**
- Consumes: `CommentCardSource`, `GenerateOptions`, `CardPreferences`。
- Produces: `OverlayRoot.mount()`, `setSelectionActive(active)`, `showConfirm(source, preferences)`, `showStatus(kind, message)`, `destroy()`。
- Produces events: `toggle-selection`, `exit-selection`, `confirm-generate` with `{ source, options }`, `cancel-generate`。

- [ ] **Step 1: 编写 Shadow DOM 隔离与确认值测试**

```ts
it("emits default-off game decoration in generate options", () => {
  const overlay = new OverlayRoot(document);
  overlay.mount();
  overlay.showConfirm(source, defaults);
  const listener = vi.fn();
  overlay.addEventListener("confirm-generate", listener);
  overlay.shadowRoot!.querySelector<HTMLButtonElement>("[data-action=generate]")!.click();
  expect(listener.mock.calls[0][0].detail.options.gameDecoration).toBe(false);
});
```

同时断言宿主 `document.head` 没有新增 style、关闭封面后控件状态正确、取消事件可用。

- [ ] **Step 2: 运行 UI 集成测试并确认失败**

Run: `npm test -- --run tests/integration/overlay-root.test.ts tests/integration/confirm-card.test.ts`

Expected: FAIL，UI 模块不存在。

- [ ] **Step 3: 实现统一卡片语言**

入口固定右下角，使用青→紫→粉→暖金渐变；选择模式提示提供退出按钮；确认卡只包含只读正文、四风格、两比例、封面开关、默认关闭的游戏化装饰开关、取消和生成。CSS 使用 `::before` 实现边缘流光，水雾扩散不超过选框外 12px；`prefers-reduced-motion` 下移除动画。

- [ ] **Step 4: 运行 UI 测试并执行可访问性静态检查**

Run: `npm test -- --run tests/integration/overlay-root.test.ts tests/integration/confirm-card.test.ts`

Expected: 所有 tests PASS；所有按钮存在中文 `aria-label`，单选控件可通过键盘切换。

- [ ] **Step 5: 提交覆盖层 UI**

```bash
git add src/ui tests/integration/overlay-root.test.ts tests/integration/confirm-card.test.ts
git commit -m "feat: add shadow DOM card interactions"
```

---

### Task 6: 主题令牌与文本布局引擎

**Files:**
- Create: `src/render/styles.ts`
- Create: `src/render/text-layout.ts`
- Create: `tests/unit/styles.test.ts`
- Create: `tests/unit/text-layout.test.ts`

**Interfaces:**
- Produces: `getStyleTokens(style: CardStyle, gameDecoration: boolean): CardStyleTokens`。
- Produces: `layoutText(ctx, text, bounds, config): TextLayoutResult` with `lines`, `fontSize`, `truncated`。

- [ ] **Step 1: 编写四主题、游戏化开关和文本边界测试**

断言每套主题都有背景、边框、正文、强调、粒子颜色；`gameDecoration: false` 时 `badge`、`energyLines` 和 `extraParticles` 全部关闭。文本测试覆盖短中文、长中文、英文长单词、Emoji；结果行宽不得超过 bounds，最小字号仍溢出时末行以 `…` 结束。

- [ ] **Step 2: 运行主题与布局测试并确认失败**

Run: `npm test -- --run tests/unit/styles.test.ts tests/unit/text-layout.test.ts`

Expected: FAIL，主题和布局模块不存在。

- [ ] **Step 3: 实现数据驱动主题和测量循环**

`styles.ts` 使用纯对象定义 warm/history/sarcasm/sss，不在渲染器中写风格条件。`layoutText` 从最大字号按 2px 递减至最小字号，基于 `Intl.Segmenter` 分词；环境不支持时回退 `Array.from`。英文长词按字符拆分，截断只发生在最后一行。

- [ ] **Step 4: 运行测试**

Run: `npm test -- --run tests/unit/styles.test.ts tests/unit/text-layout.test.ts`

Expected: 所有 tests PASS。

- [ ] **Step 5: 提交渲染基础模块**

```bash
git add src/render/styles.ts src/render/text-layout.ts tests/unit/styles.test.ts tests/unit/text-layout.test.ts
git commit -m "feat: add card themes and text layout"
```

---

### Task 7: Canvas 卡片渲染器

**Files:**
- Create: `src/render/image-loader.ts`
- Create: `src/render/card-renderer.ts`
- Create: `src/assets/bilibili-mark.svg`
- Create: `tests/unit/card-renderer.test.ts`

**Interfaces:**
- Consumes: source、options、attributes、style tokens、text layout。
- Produces: `renderCard(input: RenderCardInput): Promise<RenderCardResult>` where result is `{ canvas, coverFallbackUsed }`。
- Produces: `loadImage(url, timeoutMs): Promise<HTMLImageElement>`。

- [ ] **Step 1: 编写尺寸、绘制顺序、封面自适应和降级测试**

使用 mock Canvas context 记录调用，断言 `3:4` 为 `1200×1600`、`9:16` 为 `1080×1920`；长评论的封面高度小于短评论且始终位于 18%–26%；无封面时正文扩展；昵称和时间分两行右对齐；最高属性使用更大字号。

- [ ] **Step 2: 运行渲染测试并确认失败**

Run: `npm test -- --run tests/unit/card-renderer.test.ts`

Expected: FAIL，`renderCard` 不存在。

- [ ] **Step 3: 实现分区绘制管线**

按“背景 → 纹理 → 边框 → 平台区 → 封面 → 正文 → 署名/时间 → 属性 → 可选游戏化装饰”的固定顺序绘制。封面高度按正文估算行数线性映射到 18%–26%；图片加载超时或失败后设置 `coverFallbackUsed: true` 并重排无封面布局。SSS 关闭游戏化时只绘制金紫细边、SSS 字标和稀疏星点。

- [ ] **Step 4: 运行渲染测试并生成测试快照数据**

Run: `npm test -- --run tests/unit/card-renderer.test.ts`

Expected: 所有 tests PASS；两个比例的 context 调用均未越过画布边界。

- [ ] **Step 5: 提交 Canvas 渲染器**

```bash
git add src/render src/assets tests/unit/card-renderer.test.ts
git commit -m "feat: render themed comment cards"
```

---

### Task 8: PNG 导出与完整 Content Script 编排

**Files:**
- Create: `src/export/export-service.ts`
- Modify: `src/content/index.ts`
- Create: `tests/unit/export-service.test.ts`
- Create: `tests/integration/content-app.test.ts`

**Interfaces:**
- Produces: `exportPng(canvas, filename): Promise<void>`。
- Content root composes adapter、overlay、selection、preferences、attributes、renderer、exporter。

- [ ] **Step 1: 编写 PNG 下载和应用闭环失败测试**

导出测试断言 MIME 为 `image/png`，文件名格式为 `神评卡片-bilibili-YYYYMMDD-HHmmss.png`，Object URL 最终被 revoke。应用测试模拟 `toggle-selection → comment select → confirm-generate`，断言保存偏好、生成属性、调用 renderer、调用 exporter、显示完成状态并退出选择模式。

- [ ] **Step 2: 运行导出与应用测试并确认失败**

Run: `npm test -- --run tests/unit/export-service.test.ts tests/integration/content-app.test.ts`

Expected: FAIL，导出服务和组合逻辑未实现。

- [ ] **Step 3: 实现导出与错误分支**

优先使用 `chrome.downloads.download({ saveAs: true })`；测试或 API 不可用时使用隐藏 `<a download>` 回退。封面失败时显示“封面加载失败，已使用无封面布局”；评论失效时返回选择模式；Canvas/下载失败时保留 canvas Blob URL 并显示“再次下载”按钮，不调用 `alert`。

- [ ] **Step 4: 运行全部单元与集成测试和构建**

Run: `npm test -- --run && npm run build`

Expected: 所有 tests PASS；生产构建 exit 0。

- [ ] **Step 5: 提交可运行 MVP 闭环**

```bash
git add src/content src/export tests/unit/export-service.test.ts tests/integration/content-app.test.ts
git commit -m "feat: complete local card generation flow"
```

---

### Task 9: 浏览器端到端验收与使用说明

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixture-page.html`
- Create: `tests/e2e/selection-flow.spec.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: production `dist/` unpacked extension。
- Produces: repeatable Chromium E2E and local installation instructions。

- [ ] **Step 1: 编写失败的端到端流程**

测试通过 persistent Chromium context 加载 `dist/`，打开 fixture page，完成：点击入口、悬停评论、确认边框 class、选择评论、确认默认 `3:4` 与游戏化关闭、生成 PNG。另覆盖 `Esc`、右键、非评论点击退出和 `prefers-reduced-motion`。

- [ ] **Step 2: 构建并运行 E2E，记录首个失败点**

Run: `npm run build && npm run test:e2e`

Expected: 初次 FAIL 于 fixture host 未被测试 Manifest 匹配或下载监听尚未配置。

- [ ] **Step 3: 增加仅限测试构建的 fixture host 和下载断言**

`manifest.config.ts` 在 `mode === "test"` 时额外匹配 Playwright 本地服务器地址，生产构建仍只匹配 B 站。E2E 监听 download，断言建议文件名以 `.png` 结尾且文件非空。README 写明安装 Node、`npm install`、`npm test`、`npm run build`、Chrome“加载已解压的扩展程序”选择 `dist/`，以及 MVP 权限和隐私边界。

- [ ] **Step 4: 运行完整验证矩阵**

Run: `npm test -- --run && npm run build && npm run test:e2e`

Expected: 单元/集成测试 0 failures；生产构建 exit 0；Playwright E2E 0 failures。

- [ ] **Step 5: 提交 E2E 与文档**

```bash
git add playwright.config.ts tests/e2e README.md manifest.config.ts
git commit -m "test: verify comment card extension flow"
```

---

### Task 10: 实机 B 站冒烟验证与发布前检查

**Files:**
- Modify: `README.md`
- Create: `docs/manual-test-checklist.md`

**Interfaces:**
- Consumes: unpacked `dist/` build and a real Bilibili video page。
- Produces: repeatable manual acceptance record without storing comment content。

- [ ] **Step 1: 写入人工验证清单**

清单逐项列出：入口出现、评论与回复识别、滚动不退出、五种退出路径、四风格、两比例、封面开关、游戏化默认关闭、同评论属性一致、长文本/Emoji、封面降级、下载尺寸、页面原功能、减少动态效果。每项只记录 PASS/FAIL 和浏览器版本，不复制真实评论。

- [ ] **Step 2: 在 Chrome 中加载 `dist/` 并执行真实页面冒烟测试**

Run: `npm run build`

Manual: 打开 `chrome://extensions`，启用开发者模式，加载 `dist/`，访问一个 B 站视频详情页并执行清单。

Expected: 清单全部 PASS；若 B 站结构与 fixture 不同，只修改 `BilibiliAdapter` 的选择器与对应 fixture/test，不在控制器中增加平台特例。

- [ ] **Step 3: 重新运行自动化验证**

Run: `npm test -- --run && npm run build && npm run test:e2e`

Expected: 0 failures，生产 Manifest 只包含 B 站视频匹配项。

- [ ] **Step 4: 更新 README 的已验证环境**

记录实际 Chrome/Edge 版本、验证日期 `2026-08-12`、B 站视频页范围和已知限制；不得声称支持未测试的平台。

- [ ] **Step 5: 提交发布前验证记录**

```bash
git add README.md docs/manual-test-checklist.md src/platform/bilibili-adapter.ts tests
git commit -m "docs: record MVP acceptance checks"
```

---

## Final Verification

- [ ] Run: `npm test -- --run`
- [ ] Run: `npm run build`
- [ ] Run: `npm run test:e2e`
- [ ] Inspect: `dist/manifest.json` 只匹配 B 站视频页，只申请 `storage` 和 `downloads`。
- [ ] Inspect: `git status --short` 无意外生成文件或未提交修改。
- [ ] Review the specification against Tasks 1–10; every MVP requirement must map to at least one automated or manual acceptance check.
