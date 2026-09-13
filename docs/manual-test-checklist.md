# MVP 发布前真实 B站手工检查清单

## 证据规则

- 结果仅可填写 `PASS`、`FAIL`、`NOT RUN` 或 `BLOCKED`。fixture 自动化和真实 B站结果必须分开记录。
- 本轮控制器没有可调用 Chrome MCP，未发生新的真实站点操作；所有未继承到命名证据的项目均为 `NOT RUN`，不得由本地 Playwright 推断为通过。
- 仅继承以下已命名的历史真实证据：`docs/status/2026-08-15-mvp-acceptance-handoff.md`（入口可见/可用、顶层评论、默认已展示回复可识别/可选择、连续动画、滚动目标更新、生成与本地保存）和 `.superpowers/status/manual-acceptance_执行命令说明_20260912.md`（真实编辑态 Panel 截图）。入口唯一性和回复卡片内容边界不在继承范围内。
- 证据不得包含 Cookie、登录凭据、完整个人主页地址或不必要的评论正文；截图可对昵称、头像和正文脱敏。

## 执行信息

| 字段 | 填写值 |
| --- | --- |
| 当前 RC 日期/时区 | 2026-09-13 / Asia/Shanghai |
| 当前控制器 | Codex；无可调用 Chrome MCP |
| Chrome 版本 | `Chrome/151.0.0.0`（仅历史证据记录，当前未复测） |
| 扩展构建 | 当前 Node 22.22.2 production `dist`；真实页面未重新加载 |
| 测试 URL 范围（脱敏） | 历史：`https://www.bilibili.com/video/BV1xx411c7mD/`；当前未打开真实页面 |
| 当前真实站点结论 | `NOT RUN`：本轮没有 Chrome MCP 能力；仅保留以下具名历史证据 |
| 本轮 fixture 视觉证据 | `.superpowers/visual-qa/round-mvp-rc-20260913_105656_186-bc892c77b93e4ba48bb61c9322c291fd/`（非真实 B站） |

## 入口、选择与站点兼容性

| 检查项 | 结果 | 备注/具名证据 |
| --- | --- | --- |
| 受支持视频页“开启评论选择”入口可见且可用 | `PASS` | 继承 `docs/status/2026-08-15-mvp-acceptance-handoff.md` 第 35 行的真实 B站结果；本轮未复测 |
| “开启评论选择”入口唯一性 | `NOT RUN` | 历史具名证据未单独覆盖唯一性；无当前 Chrome MCP 会话 |
| 顶层评论能 hover、选择并打开 editing | `PASS` | 同一具名历史真实验收；本轮未复测 |
| 默认已展示的 `bili-comment-reply-renderer` 可独立选择 | `PASS` | 同一具名历史真实验收；不包含折叠展开或分页回复；本轮未复测 |
| 默认已展示回复生成的卡片只含该回复自身作者、正文和时间 | `NOT RUN`（真实站点） | fixture 自动化 `PASS`：`tests/e2e/selection-flow.spec.ts` 的真实结构回复断言；无当前真实 B站证据 |
| 相邻评论移动与滚动后的高亮连续/目标更新 | `PASS` | 同一具名历史真实验收；本轮未复测 |
| 非评论区域悬停、点击不被误选 | `NOT RUN` | 无当前 Chrome MCP 会话 |
| Panel 关闭后原有评论点击、滚动、链接和右键行为恢复 | `NOT RUN` | 无当前 Chrome MCP 会话 |

## Panel 五状态与选项

| 检查项 | 结果 | 备注/具名证据 |
| --- | --- | --- |
| editing：内容设置、折叠层级、固定操作区和底部装饰可见且不遮挡 | `PASS` | 继承 `.superpowers/status/manual-acceptance_执行命令说明_20260912.md` 的真实编辑态截图检查；本轮未复测 |
| generating：状态插画、制作中、取消制作，且无编辑/保存控件 | `NOT RUN` | 无真实 B站逐态证据 |
| failed：失败说明、重新生成、返回修改，且无成功/下载确认 | `NOT RUN` | 无真实 B站逐态证据 |
| generated：PNG 预览、比例/尺寸、返回修改、确认保存，且不自动下载 | `NOT RUN` | 无真实 B站逐态证据 |
| saved：成功插画、PNG、分辨率、本地下载和再做一张 | `NOT RUN` | 无真实 B站逐态证据 |
| 默认比例 `3:4`，可选择 `9:16` | `NOT RUN` | 无当前 Chrome MCP 会话 |
| `16:9` 生成并保存非空横版 PNG | `NOT RUN` | 无当前 Chrome MCP 会话 |
| generated 前无下载，仅“确认保存”后下载 | `NOT RUN` | 无当前 Chrome MCP 会话；fixture 证据不替代真实结果 |
| 评论正文修改、恢复原文、样式/更多选项摘要与实际选择一致 | `NOT RUN` | 无当前 Chrome MCP 会话 |

## 退出、缩放、控制台与隐私

| 检查项 | 结果 | 备注/具名证据 |
| --- | --- | --- |
| Escape、右键、点击空白、入口 toggle、提示退出五种退出路径 | `NOT RUN` | 无当前 Chrome MCP 会话 |
| 125% Windows 缩放下 Panel 不越出可视区，底部操作区可用 | `NOT RUN` | 无当前 Chrome MCP 会话 |
| `prefers-reduced-motion: reduce` 下动效关闭且主流程可用 | `NOT RUN` | 无当前 Chrome MCP 会话 |
| 页面 console 无扩展导致的 uncaught exception / error | `NOT RUN` | 历史 MCP DOM console 观察不等同于扩展 console 验收 |
| 生产权限仅 `storage`、`downloads`，无 `host_permissions` | `NOT RUN` | 真实 Chrome 未复测；以 Gate A production-package audit 单独判定 |
| 手工证据已脱敏且无登录态/个人数据 | `NOT RUN` | 本轮没有新增真实站点证据 |

## 真实浏览器证据登记

| 证据类别 | 路径/标识 | 状态 | 备注 |
| --- | --- | --- | --- |
| 历史真实主流程 | `docs/status/2026-08-15-mvp-acceptance-handoff.md` | `PASS` | 仅继承入口可见/可用、顶层/默认回复可识别/可选择、连续动画、滚动更新、生成与保存；不包含入口唯一性或回复卡片内容边界 |
| 历史真实 editing Panel | `.superpowers/status/manual-acceptance_执行命令说明_20260912.md` | `PASS` | 单张真实页面编辑态截图；不覆盖其余四态 |
| 本轮 Chrome MCP 操作 | 无 | `NOT RUN` | 当前工具集没有可调用 Chrome MCP |
| 本轮五态截图 | `.superpowers/visual-qa/round-mvp-rc-20260913_105656_186-bc892c77b93e4ba48bb61c9322c291fd/` | `PASS`（fixture） | 非真实 B站，不能替代以上人工验收 |

详细操作步骤见 [Chrome MCP 真实浏览器检查清单](testing/chrome-mcp-checklist.md)。
