# 神评卡片 MVP 发布候选收尾 Spec

日期：2026-09-12
状态：已确认，待实施
目标版本：MVP Release Candidate（RC）
目标平台：B站网页版视频页、Chrome Manifest V3

## 1. 目标

在不扩展产品范围的前提下，把当前 `feat/pixel-perfect-panel-state-machine` 分支整理为可明确判定是否发布的 MVP RC：自动化门禁可重复、五种 Panel 状态不发生几何回归、核心生成与保存链路可靠、生产权限保持最小，并形成一份区分自动化证据与真实 B站人工证据的 RC 验收报告。

本轮只修复阻断发布的 P0/P1 缺陷。视觉微调、更多平台、折叠回复分页、自定义模板及 Node 24 均不进入本轮。

## 2. 当前基线

### 2.1 已完成功能

- B站视频页评论选择；
- 顶层评论和默认已渲染的 `bili-comment-reply-renderer` 回复选择；
- 评论间连续 hover 流光、滚动后静止指针目标更新；
- Escape、右键、非评论区域、入口 toggle、提示退出五种退出路径；
- 单一固定尺寸制作 Panel；
- `editing`、`generating`、`failed`、`generated`、`saved` 五状态；
- Bilibili 默认风格及温暖、历史、嘲讽、SSS 风格；
- 3:4、9:16、横版 16:9；
- 评论正文修改、恢复原文、封面开关、属性值开关、游戏化装饰开关；
- 本地 Canvas 渲染、PNG 预览、确认保存和失败重试；
- 像素风 Panel 素材、共享底部地面及状态装饰。

### 2.2 当前自动化基线

- Vitest：15 个测试文件，149/149 tests passed；
- TypeScript：passed；
- Vite production build：passed；
- Playwright：10 passed，1 个显式视觉截图用例 skipped；
- Git diff check：passed；
- Node：继续使用 22.22.2；
- Windows/Codex 完整门禁入口：`scripts/run-release-gates.ps1`。

### 2.3 已有真实页面证据

- 真实 B站编辑态截图已确认 Panel 挂载、折叠区、固定操作区和底部装饰正常；
- 用户已人工确认顶层评论、默认回复、动画连续切换、滚动后目标更新以及 PNG 本地保存主链路；
- 尚未形成五状态逐态、全部风格/比例、失败恢复、权限隐私的同一轮 RC 证据包。

## 3. 范围

### 3.1 本轮包含

1. 生产构建产物和 Manifest 最小权限审计；
2. 五种 Panel 状态固定几何与关键内容回归；
3. 主流程、横版 16:9、失败恢复、重复保存保护回归；
4. PNG 文件名、非空内容和精确尺寸验证；
5. 真实 B站 RC 人工验收清单与证据规范；
6. P0/P1 缺陷的 TDD 修复；
7. RC 验收报告和发布结论。

### 3.2 本轮不包含

- YouTube、抖音、小红书或其他平台；
- B站非视频页面、移动端页面；
- 点击“查看回复”后加载的折叠回复、回复分页或无限加载；
- AI 评分、后端、账号、收藏、社区和模板市场；
- GIF、视频或动态文件导出；
- 自定义卡片素材编辑器；
- Node 24 安装、NVM 镜像调整或永久系统环境修改；
- 仅为美观而不影响发布的 P2/P3 调整。

## 4. 发布门禁架构

发布收尾由四层证据组成：

```text
Release Candidate Gate
├── A. Production Artifact Audit
├── B. Deterministic Automated Regression
├── C. Visual State QA
└── D. Real Bilibili Acceptance
```

任何自动化 fixture 结果都不得替代真实 B站验收。真实页面受登录状态、动态 DOM、网络和 B站改版影响，必须独立标记 `PASS`、`FAIL`、`BLOCKED` 或 `NOT RUN`。

## 5. Gate A：生产包与权限审计

生产构建后必须验证：

- `manifest_version` 精确为 `3`；
- content script match 精确为 `https://www.bilibili.com/video/*`；
- permissions 精确为 `storage`、`downloads`；
-不存在 `host_permissions`；
- 生产 `dist` 不得残留 E2E localhost match；
- 生产 content script、manifest 和所需像素素材均存在且非空；
- 不包含后端地址、遥测入口或评论上传逻辑；
- 构建完成后的审计必须针对最终恢复的 production `dist`，不能审计临时 E2E build。

审计失败属于 P0，直接阻断 RC。

## 6. Gate B：确定性自动化回归

统一通过以下入口执行：

```powershell
& '.\scripts\run-release-gates.ps1'
```

必须覆盖：

- 149 项现有 unit/integration 回归不减少；
- 顶层评论与默认已渲染回复选择；
- 评论之间直接移动时高亮层连续复用；
- 滚动后静止指针重新命中评论；
- 五种退出方式与 wheel 不退出；
- reduced-motion 下关闭循环动画但功能可用；
- editing → generating → generated → saved 主状态流；
- generating → failed → retry / return-editing 异常流；
- 3:4 主链路和横版 16:9 主链路；
- 下载只发生在用户确认保存后；
- 失败下载保留 artifact，可重试且不重复渲染；
- 关闭或取消时释放临时 object URL；
- 生成和保存阶段重复事件不会触发并发操作。

任何崩溃、未捕获异常、重复下载或资源泄漏属于 P0/P1。

## 7. Gate C：五状态视觉 QA

### 7.1 固定几何

五状态共享一个 Panel Shell，并满足：

- 外部尺寸固定为 336 × 570 CSS px；
- Header、StateViewport、ActionArea、BottomDecoration 使用同一几何基准；
- 状态内容不得撑高 Panel；
- 操作按钮完整位于 Panel 内，不被底部装饰遮挡；
- 共享地面覆盖 Panel 内宽，状态场景保持 `contain`，不得拉伸；
- 生成预览图不得应用 pixelated 渲染。

### 7.2 逐态检查

| 状态 | 必须可见 | 不得出现 |
| --- | --- | --- |
| editing | 内容设置、样式摘要、更多选项、重置、制作卡片 | 数字步骤器、生成进度 |
| generating | 状态插画、制作中文案、取消制作 | 编辑表单、保存按钮 |
| failed | 失败插画、错误说明、重新生成、返回修改 | 成功文案、下载确认 |
| generated | PNG 预览、实际比例与尺寸、返回修改、确认保存 | 自动下载或保存成功文案 |
| saved | 成功插画、文件格式、分辨率、保存结果、再做一张 | 可再次触发同一保存的活跃按钮 |

### 7.3 截图规则

- 每个状态单独截图，不把五状态实现成五列页面；
- 截图使用固定 Panel viewport 和相同 device scale；
- 文件名带 `_执行命令说明_YYYYMMDD_HHmmss`，不得覆盖；
- 自动化截图只能证明 fixture 视觉；真实 B站截图需单独归档；
- 本轮至少保留五张状态截图或对应的 Playwright artifact。

明显几何错位、按钮越界、底部未覆盖或状态内容错误属于 P1。纯色差和非阻断像素素材微调进入 backlog。

## 8. Gate D：真实 B站人工验收

使用 production `dist` 加载 unpacked extension，并在真实 B站视频页验证：

1. 页面刷新后右下角入口唯一且可见；
2. 顶层评论可 hover、选择并打开 editing；
3. 默认已展示回复可独立 hover、选择，卡片只包含该回复自身作者、正文和时间；
4. 相邻评论直接移动和滚轮滚动后的高亮连续；
5. 评论正文可修改并可恢复原文；
6. 样式摘要和更多选项摘要与实际选择一致；
7. 3:4 与横版 16:9 各生成并保存一张非空 PNG；
8. generated 阶段不自动保存，只有“确认保存”才下载；
9. Escape、右键、点击空白、入口 toggle、提示退出均正常；
10. 页面 console 无扩展导致的 uncaught exception 或 error；
11. Panel 关闭后页面原有评论点击、滚动、链接和右键行为恢复；
12. 125% Windows 缩放下 Panel 不越出可视区，底部操作区可用。

人工证据不得包含 Cookie、登录凭据、完整个人主页地址或不必要的评论正文。截图可对昵称、头像和评论正文做脱敏。

## 9. PNG 与内容验收

- 3:4、9:16、16:9 输出像素尺寸必须与渲染配置一致；
- 16:9 必须为宽大于高的横版图；
- 文件名以 `.png` 结尾并使用零填充本地时间；
- 文件大小大于 0，浏览器可正常打开；
- 评论正文视觉上纵向居中；
- 顶部同一行显示 bilibili 标识与视频标题，超出一行使用省略号；
- 昵称与发布时间位于正文右下区域；
- 属性值默认关闭；开启后最大值突出，关闭后不保留空占位；
- 封面缺失或跨域加载失败时生成必须继续，不得生成空白卡片。

## 10. 缺陷分级与处理

### P0：必须修复

- 扩展无法加载或入口不出现；
- 合法评论无法选择；
- 生成或保存主链路不可用；
- 导出空文件、尺寸错误或重复下载；
- 权限超出约定范围；
- 评论或图片被上传到外部服务；
- 页面出现扩展导致的持续崩溃。

### P1：发布前修复

- 默认已展示回复解析错误；
- 状态机无法返回、重试或取消；
- Panel 按钮越界、底部装饰遮挡操作；
- 16:9 仍呈竖版；
- 长文本导致核心操作不可达；
- reduced-motion 无法使用核心流程；
- 临时 URL 未释放或失败重试重复渲染。

### P2/P3：记录后延期

- 非阻断色差、阴影或像素素材位置微调；
- 更丰富音效、粒子和过渡；
- 折叠回复、分页回复和其他平台；
- 自定义卡片素材系统。

所有 P0/P1 修复必须先增加可失败的自动化回归，再实施最小修复。

## 11. RC 判定

### PASS

- Gate A、B、C 全部通过；
- Gate D 的 12 项真实站点检查完成且无 P0/P1；
- 完整门禁日志、视觉 artifact 和人工证据路径已记录；
- 工作树干净，未混入日志、下载 PNG、浏览器 profile 或敏感信息。

### CONDITIONAL PASS

- Gate A、B、C 全部通过；
- Gate D 因工具或真实站点外部条件存在少量 `NOT RUN/BLOCKED`；
- 已完成的真实主链路无 P0/P1；
- 未执行项被明确列出，不能描述为已验证。

### FAIL

- 任一 P0 未关闭；
- 任一 P1 影响主流程或固定 Panel 几何；
- production manifest/权限不符合约束；
- 自动化门禁失败；
- 证据无法区分 fixture 与真实站点。

## 12. 交付物

- 可重复的 production artifact 审计；
- 五状态视觉 QA artifact；
- Node 22 完整门禁日志；
- 更新后的真实浏览器检查清单；
- `docs/status/2026-09-12-mvp-rc-closure-report.md`；
- 明确的 `PASS`、`CONDITIONAL PASS` 或 `FAIL` 结论；
- P2/P3 backlog，不与 RC 阻断项混合。

## 13. 实施约束

- Windows 原生 PowerShell；
- Node 22.22.2；
- 不安装 Node 24；
- 不修改 NVM 镜像或系统永久环境；
- 不使用 WebSocket，网络访问默认 HTTPS；
- 不执行 `git push`；
- 不删除分支、worktree、Node 版本或 `C:\Users\001` 下文件；
- 执行日志和交接草稿保持 Git ignored；
- 只有正式 Spec、计划、测试、代码和 RC 报告进入 Git。
