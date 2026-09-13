# 神评卡片媒体、音效与 GitHub 发布准备设计

日期：2026-09-14  
目标分支：从 `master` 新建功能分支  
运行基线：Windows 11 / PowerShell 7.6.6 / Node 22.22.2

## 1. 目标

在不扩展平台范围、不改变现有评论选择与 Panel 状态机的前提下，完成四项 MVP 发布前优化：

1. 优化生成卡片左上角的 bilibili 标识；
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

## 3. bilibili 标识

卡片左上角采用本地 SVG 的官方风格粉色 `bilibili` 纯文字标识，不增加底板、小电视或附加标签。

要求：

- SVG 保持透明背景，路径或文字轮廓不得依赖外部字体和远程资源；
- 统一使用 B站品牌粉作为主色，并允许各卡片主题对其进行必要的明暗对比补偿；
- 保持原始宽高比，不拉伸；
- 3:4、9:16、16:9 三种输出均设置明确最大宽度和安全边距；
- 标识与单行视频标题位于同一信息带，标题溢出继续使用省略号；
- 标识加载失败不能阻断卡片生成，使用已有文字 fallback。

验收以 Canvas 绘制调用、三比例截图和真实导出 PNG 为准，不以源 SVG 单独存在作为完成标准。

## 4. 视频封面自适应

### 4.1 比例区间

启用封面且图片加载成功时：

| 卡片比例 | 封面占卡片高度目标区间 |
| --- | --- |
| 3:4 | 22%–28% |
| 9:16 | 18%–24% |
| 16:9 | 42%–70% |

16:9 的封面优先级最高：短评论使用 62%–70%，中等评论使用 52%–62%，长评论使用 42%–52%。实际高度不能只按字符数量决定，必须结合正文排版测量、字号递减结果、作者/时间/属性安全区和内部间距计算。

### 4.2 布局与降级

- 封面使用 16:9 视觉窗口；图片使用等比 `cover`、居中裁切，不拉伸；
- 图片源比例与窗口不一致时允许对称裁切，不允许出现未设计的透明缝隙；
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

## 6. GitHub CI

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

## 7. 标签发布

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

## 8. 数据流与兼容性

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

PR/master
  → GitHub CI

v* tag
  → full gates
  → version check
  → ZIP + SHA-256
  → GitHub Release
```

## 9. 测试与验收

采用 TDD，先增加会失败的测试，再实施最小代码变更。

### 9.1 渲染

- bilibili SVG 本地、非空、透明背景、绘制保持宽高比；
- 三种卡片比例中的标识和标题不重叠；
- 封面高度落在对应区间；
- 16:9 短/中/长正文的封面高度单调递减且为 42%–70%；
- cover 裁切不拉伸，正文和 meta 不重叠；
- 关闭/缺失/失败封面回退正常；
- PNG IHDR 分别为 1200×1600、1080×1920、1920×1080。

### 9.2 音效

- start/success/failure cue 的 oscillator、gain、调度及资源释放；
- 开关关闭零 AudioContext；
- 成功、失败、重试和忙碌去重；
- WebAudio 缺失、构造失败、播放失败不影响主流程。

### 9.3 CI/CD

- workflow YAML 可解析；
- CI 触发条件、Node 22、权限、concurrency 和步骤完整；
- release 仅匹配 `v*`，版本不一致会失败；
- ZIP 根结构正确且只包含 production 文件；
- SHA-256 可复算一致；
- 本地完整 protected release gate 继续通过。

### 9.4 人工检查

- 在真实 B站分别导出带封面的 3:4、9:16、16:9；重点观察横版短评的大封面与长评的正文安全区；
- 检查 bilibili 标识清晰、比例正确，与标题不重叠；
- 开关音效，确认开始与完成反馈明显、关闭后完全静音；
- 从 GitHub Actions artifact 解压并加载扩展，完成入口→选择→生成→确认保存冒烟测试。

## 10. 实施边界与交付物

预计修改：

- `src/assets/bilibili-mark.svg`
- `src/render/card-renderer.ts`
- `src/audio/generation-sound.ts`
- `src/content/index.ts`
- 对应 unit/integration/E2E tests
- `package.json`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- 必要的跨平台打包/版本校验脚本
- README 与发布说明

交付完成条件：全部自动化门禁通过、真实三比例封面与新音效人工验收通过、GitHub CI/release workflow 经过静态验证，且无新增权限、外部网络 sink、敏感文件或未解释的发布产物。
