# 神评卡片媒体、音效与 GitHub 发布准备设计

日期：2026-09-14  
目标分支：从 `master` 新建功能分支  
运行基线：Windows 11 / PowerShell 7.6.6 / Node 22.22.2

## 1. 目标

在不扩展平台范围、不改变现有评论选择与 Panel 状态机的前提下，完成四项 MVP 发布前优化：

1. 将产品全局品牌更新为“有神评”，卡片左上角使用纯文字字标；
2. 改进启用视频封面后的自适应尺寸，尤其保证 16:9 横版优先展示视频画面；
3. 建立面向 GitHub 的 CI 与标签发布机制；
4. 将现有轻弱提示音替换为辨识度更高、但不会打扰用户的两阶段本地音效。

## 2. 非目标

- 不增加其他视频平台；
- 不自动发布 Chrome Web Store；
- 不引入服务端、遥测、上传或远程音频；
- 不重新设计 Panel；
- 不修改评论解析、选择模式、导出确认和下载语义；
- 不安装或切换 Node 24；
- 不在 CI 中保存签名密钥或长期凭据。

## 3. “有神评”品牌标识

卡片左上角采用纯文字“有神评”作为产品标识，不增加电视图标或第三方平台 Logo。

要求：

- 字标由 Canvas 确定性绘制“有神评”，不依赖远程资源或第三方平台 Logo；
- 品牌短句固定为“有神评，让更多人看见”，使用低于主字标的视觉层级；
- bilibili 仅以“内容来自 bilibili”的普通来源文字出现；
- 3:4、9:16、16:9 三种输出均设置明确安全边距；
- 品牌区与单行视频标题位于同一信息带，标题溢出继续使用省略号；

验收以 Canvas 绘制调用、三比例截图和真实导出 PNG 为准。

## 4. 视频封面自适应

### 4.1 比例区间

启用封面且图片加载成功时：

| 卡片比例 | 标准 16:9 视频封面布局 |
| --- | --- |
| 3:4 | 铺满 1040px 安全内容宽度，高度约占卡片 36.6% |
| 9:16 | 铺满 936px 安全内容宽度，高度约占卡片 27.4% |
| 16:9 | 在正文最小安全区约束下尽量放大，约占卡片高度 42%–68%，宽度与正文一致 |

16:9 的封面优先级最高：短评论以 70% 为请求上限，但必须为正文保留至少一行安全高度，因此标准布局实际约为 68%；中等和长评论逐步降低封面高度，最低约 42%。实际高度不能只按字符数量决定，必须结合正文、作者/时间/属性安全区和内部间距计算。

### 4.2 布局与降级

- 封面图片使用等比 `contain` 并在媒体区域内居中，允许 resize，但禁止裁切和拉伸；
- 图片比例与媒体区域不一致时，剩余空间显示卡片主题背景，优先保证原始封面完整；
- 封面实际宽度定义共享内容列；正文、作者、时间、属性与来源文字不得超出封面左右边界；
- 16:9 长评论优先递减正文字号，再逐步降低封面高度；封面不得低于卡片高度 42%；
- 正文、作者、时间和可选属性值必须保持安全间距且不得重叠；
- 3:4 和 9:16 继续以正文为主，不因横版规则而扩大封面；
- 封面关闭、URL 缺失、超时或跨域失败时沿用无封面布局，生成流程继续并向用户显示既有降级提示；
- 是否显示属性面板开关及偏好持久化语义不变。

### 4.3 可测试接口

封面应由单一几何函数根据卡片比例、可用区域和正文测量结果计算，避免在绘制阶段散布比例条件。测试需要覆盖区间、单调变化、三比例、极短/中等/极长正文、属性与封面开关和加载失败。

## 5. 生成音效

继续使用本地 WebAudio 合成，不加入网络请求或二进制音频文件。

音效分为三个受控 cue：

- `start`：用户点击“制作卡片”后播放能量启动音；
- `success`：生成成功并进入预览时播放清脆完成音；
- `failure`：生成失败时播放更短、更低沉的失败反馈。

行为要求：

- 完整成功路径的听感约 600–800ms，各 cue 自身使用快速 attack/release；
- 音量克制但明显高于现有单次提示；
- 同一生成事务每种 cue 最多播放一次；重复点击或忙碌状态不叠加；
- `soundEnabled=false` 时不创建 `AudioContext`；
- AudioContext 不可用、被浏览器拒绝或播放异常时静默降级，不阻断渲染、预览或保存；
- `prefers-reduced-motion` 不隐式静音，音效仅由用户开关决定；
- 每次播放后释放 oscillator/gain/context，不保留后台计时器或常驻音频资源。

## 6. 像素电视悬浮入口

现有文字胶囊入口替换为与 Panel 同一视觉体系的像素电视玩偶入口。优先复用项目内 `mascot-master.png`，通过 HTML/CSS 组合迷你卡片，不生成风格不一致的替代素材。

- 玩偶待机时仅有轻微呼吸/眨眼，并周期性从侧面弹出迷你评论卡片后收回；
- `prefers-reduced-motion: reduce` 下停止所有循环动画，但入口保持清晰、可点击、可拖动；
- Pointer Events 同时支持鼠标和触控笔；达到 6px 位移阈值后判定为拖动，释放时不得误触发选择模式；
- 拖动释放后吸附最近的左侧或右侧安全边缘；
- 保存 `side: "left" | "right"` 与归一化纵向位置 `yRatio: number`，刷新后恢复；窗口缩放时重新夹在可视区内；
- 位置使用 `chrome.storage.local` 下独立的 `floatingEntryPlacement` 字段，不混入卡片生成偏好，也不写入 B站页面的 localStorage；
- 缺失、损坏或越界的持久化值回退到右下角默认位置；
- 进入选择模式、打开 Panel 和状态提示时，入口与其他浮层不得互相遮挡。

## 7. GitHub CI

新增 `.github/workflows/ci.yml`：

- 触发条件：所有 Pull Request，以及提交到 `master`；
- 运行环境：`ubuntu-latest`；
- Node：22 LTS，使用 lockfile 和 `npm ci`；
- 缓存 npm 下载；
- 安装 Playwright Chromium 及必要系统依赖；
- 顺序执行 Vitest、`tsc --noEmit`、Vite production build、production-package audit、Playwright E2E 和 diff/仓库卫生检查；
- 使用现有 npm scripts 或增加跨平台 npm script 编排，不从 Linux 调用 Windows PowerShell gate；
- 失败时保留 Playwright report/test-results，成功时不上传无必要的大型临时文件；
- 为并发提交设置 concurrency，取消同一 PR/分支的旧运行。

本地 `scripts/run-release-gates.ps1` 继续保留，仍是 Windows 人工发布前入口；CI 与本地门禁应调用同一底层 npm 命令，避免验证内容漂移。

## 8. 标签发布

新增 `.github/workflows/release.yml`：

- 仅在推送 `v*` 标签时触发；
- 使用 Node 22 和与 CI 相同的完整验证步骤；
- 校验标签去掉 `v` 后与 `package.json` 版本、构建后的 `manifest.json` 版本完全一致；
- 只打包 production `dist`，ZIP 根目录直接包含 `manifest.json`，不得额外嵌套 `dist/`；
- ZIP 不包含源码、测试、日志、浏览器 profile、下载样本、source-chroma 原始素材或个人数据；
- 生成 SHA-256 校验文件；
- 创建或更新对应 GitHub Release，并上传 ZIP 与 SHA-256；
- 使用 GitHub 内置 `GITHUB_TOKEN` 的最小 `contents: write` 权限；普通 CI 权限保持只读；
- 标签版本不一致、门禁失败或产物审计失败时禁止发布。

本轮不配置 Chrome Web Store 自动提交。

## 9. 数据流与兼容性

评论源数据、用户偏好和 Panel draft 接口保持向后兼容。主要变化路径：

```text
CardRenderInput
  → media geometry（按比例和正文测量计算）
  → bilibili mark + cover + body/meta 绘制
  → Canvas/PNG

用户点击制作
  → start cue
  → render/export preview
  → success cue 或 failure cue

pointer down/move/up
  → click 或 drag 判定
  → 最近边缘吸附
  → chrome.storage.local 持久化 placement

PR/master
  → GitHub CI

v* tag
  → full gates
  → version check
  → ZIP + SHA-256
  → GitHub Release
```

## 10. 测试与验收

采用 TDD，先增加会失败的测试，再实施最小代码变更。

### 10.1 渲染

- “有神评”字标、品牌短句和来源文字均准确绘制；
- 三种卡片比例中的品牌区和标题不重叠；
- 竖版标准 16:9 封面铺满安全内容宽度；
- 16:9 短/中/长正文的封面高度单调递减，且短评受正文安全区约束、长评不低于约 42%；
- cover 完整等比缩放、不裁切不拉伸，正文和 meta 不重叠；
- 关闭/缺失/失败封面回退正常；
- PNG IHDR 分别为 1200×1600、1080×1920、1920×1080。

### 10.2 音效

- start/success/failure cue 的 oscillator、gain、调度及资源释放；
- 开关关闭零 AudioContext；
- 成功、失败、重试和忙碌去重；
- WebAudio 缺失、构造失败、播放失败不影响主流程。

### 10.3 CI/CD

- workflow YAML 可解析；
- CI 触发条件、Node 22、权限、concurrency 和步骤完整；
- release 仅匹配 `v*`，版本不一致会失败；
- ZIP 根结构正确且只包含 production 文件；
- SHA-256 可复算一致；
- 本地完整 protected release gate 继续通过。

### 10.4 悬浮入口

- 默认右下角、单一入口和像素素材可见；
- 小于 6px 的移动仍按点击处理，达到阈值后只拖动不点击；
- 左右吸附、纵向 clamp、窗口 resize 和刷新恢复；
- storage 缺失/非法值回退；
- reduced-motion 下无循环动画；
- 选择提示、Panel 和状态提示不被入口遮挡。

### 10.5 人工检查

- 在真实 B站分别导出带封面的 3:4、9:16、16:9；重点观察横版短评的大封面与长评的正文安全区；
- 检查“有神评”字标和短句清晰，与标题不重叠，来源文字不过度抢眼；
- 开关音效，确认开始与完成反馈明显、关闭后完全静音；
- 从 GitHub Actions artifact 解压并加载扩展，完成入口→选择→生成→确认保存冒烟测试。
- 在左右两侧拖动入口并刷新，确认吸附位置恢复；确认拖动不会误触发选择模式。

## 11. 实施边界与交付物

预计修改：

- `src/render/card-renderer.ts`
- `src/audio/generation-sound.ts`
- `src/content/index.ts`
- `src/ui/overlay-root.ts`
- `src/ui/overlay.css`
- `src/storage/floating-entry-placement.ts`
- 对应 unit/integration/E2E tests
- `package.json`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- 必要的跨平台打包/版本校验脚本
- README 与发布说明

交付完成条件：全部自动化门禁通过、真实三比例封面与新音效人工验收通过、GitHub CI/release workflow 经过静态验证，且无新增权限、外部网络 sink、敏感文件或未解释的发布产物。
