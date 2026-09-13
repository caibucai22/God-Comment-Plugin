# MVP 发布前真实 B站手工检查清单

## 证据规则

- 结果仅可填写 `PASS`、`FAIL`、`NOT RUN` 或 `BLOCKED`。fixture 自动化和真实 B站结果必须分开记录。
- 2026-09-13 由用户在真实 B站、production `dist` 上完成人工接管验收；原始记录为 `C:\Users\001\Pictures\caima\comment-card\manual-test\人工测试.md`，截图位于同目录。自动化 fixture 仍不得替代真实站点结果。
- 仅继承以下已命名的历史真实证据：`docs/status/2026-08-15-mvp-acceptance-handoff.md`（入口可见/可用、顶层评论、默认已展示回复可识别/可选择、连续动画、滚动目标更新、生成与本地保存）和 `.superpowers/status/manual-acceptance_执行命令说明_20260912.md`（真实编辑态 Panel 截图）。入口唯一性和回复卡片内容边界不在继承范围内。
- 证据不得包含 Cookie、登录凭据、完整个人主页地址或不必要的评论正文；截图可对昵称、头像和正文脱敏。

## 执行信息

| 字段 | 填写值 |
| --- | --- |
| 当前 RC 日期/时区 | 2026-09-13 / Asia/Shanghai |
| 当前控制器 | 用户人工接管；Codex 复核报告与截图 |
| Chrome 版本 | 截图所示 Chrome 151 系列；精确补丁版本未单独记录 |
| 扩展构建 | 当前 Node 22.22.2 production `dist`，已在真实页面加载验证 |
| 测试 URL 范围（脱敏） | `https://www.bilibili.com/video/<BV号>/` |
| 当前真实站点结论 | `PASS`：Gate D 12 项完成，无 P0/P1 |
| 本轮 fixture 视觉证据 | `.superpowers/visual-qa/round-mvp-rc-20260913_105656_186-bc892c77b93e4ba48bb61c9322c291fd/`（非真实 B站） |

## 入口、选择与站点兼容性

| 检查项 | 结果 | 备注/具名证据 |
| --- | --- | --- |
| 受支持视频页“开启评论选择”入口可见且可用 | `PASS` | 本轮真实截图与人工报告 |
| “开启评论选择”入口唯一性 | `PASS` | 本轮真实截图仅显示一个入口 |
| 顶层评论能 hover、选择并打开 editing | `PASS` | 本轮人工报告 |
| 默认已展示的 `bili-comment-reply-renderer` 可独立选择 | `PASS` | 本轮人工报告；不包含折叠展开或分页回复 |
| 默认已展示回复生成的卡片只含该回复自身作者、正文和时间 | `PASS` | 本轮人工逐项确认 |
| 相邻评论移动与滚动后的高亮连续/目标更新 | `PASS` | 本轮人工报告 |
| 非评论区域悬停、点击不被误选 | `PASS` | 空白点击退出验证覆盖 |
| Panel 关闭后原有评论点击、滚动、链接和右键行为恢复 | `PASS` | 本轮人工报告 |

## Panel 五状态与选项

| 检查项 | 结果 | 备注/具名证据 |
| --- | --- | --- |
| editing：内容设置、折叠层级、固定操作区和底部装饰可见且不遮挡 | `PASS` | 继承 `.superpowers/status/manual-acceptance_执行命令说明_20260912.md` 的真实编辑态截图检查；本轮未复测 |
| generating：状态插画、制作中、取消制作，且无编辑/保存控件 | `PASS` | 本轮真实生成流程与声效开关验证 |
| failed：失败说明、重新生成、返回修改，且无成功/下载确认 | `PASS`（自动化） | 真实站点未人为制造故障；确定性 fixture 已覆盖失败恢复，不属于 Gate D 12 项必测项 |
| generated：PNG 预览、比例/尺寸、返回修改、确认保存，且不自动下载 | `PASS` | 本轮人工报告与比例截图 |
| saved：成功插画、PNG、分辨率、本地下载和再做一张 | `PASS` | 本轮人工保存验证 |
| 默认比例 `3:4`，可选择 `9:16` | `PASS` | 本轮 3:4、9:16 截图与人工报告 |
| `16:9` 生成并保存非空横版 PNG | `PASS` | 本轮 16:9 截图与人工报告 |
| generated 前无下载，仅“确认保存”后下载 | `PASS` | 本轮人工确认生成前零下载、确认后一次 |
| 评论正文修改、恢复原文、样式/更多选项摘要与实际选择一致 | `PASS` | 本轮人工报告 |

## 退出、缩放、控制台与隐私

| 检查项 | 结果 | 备注/具名证据 |
| --- | --- | --- |
| Escape、右键、点击空白、入口 toggle、提示退出五种退出路径 | `PASS` | 报告记录前三项；用户随后逐项确认入口 toggle 与提示按钮正常 |
| 125% Windows 缩放下 Panel 不越出可视区，底部操作区可用 | `PASS` | 本轮截图与人工报告 |
| `prefers-reduced-motion: reduce` 下动效关闭且主流程可用 | `NOT RUN` | 无当前 Chrome MCP 会话 |
| 页面 console 无扩展导致的 uncaught exception / error | `PASS` | 本轮人工报告 |
| 生产权限仅 `storage`、`downloads`，无 `host_permissions` | `PASS`（Gate A） | production-package audit 判定；不依赖页面视觉 |
| 手工证据未包含 Cookie、登录凭据或完整个人主页 URL | `PASS` | 截图包含公开页面昵称/评论正文，仅在本机外部证据目录保存，未加入 Git |

## 真实浏览器证据登记

| 证据类别 | 路径/标识 | 状态 | 备注 |
| --- | --- | --- | --- |
| 历史真实主流程 | `docs/status/2026-08-15-mvp-acceptance-handoff.md` | `PASS` | 仅继承入口可见/可用、顶层/默认回复可识别/可选择、连续动画、滚动更新、生成与保存；不包含入口唯一性或回复卡片内容边界 |
| 历史真实 editing Panel | `.superpowers/status/manual-acceptance_执行命令说明_20260912.md` | `PASS` | 单张真实页面编辑态截图；不覆盖其余四态 |
| 本轮用户人工接管 | `C:\Users\001\Pictures\caima\comment-card\manual-test\` | `PASS` | 原始报告、比例/皮肤/缩放/入口等真实页面截图；未加入 Git |
| 本轮五态截图 | `.superpowers/visual-qa/round-mvp-rc-20260913_105656_186-bc892c77b93e4ba48bb61c9322c291fd/` | `PASS`（fixture） | 非真实 B站，不能替代以上人工验收 |

详细操作步骤见 [Chrome MCP 真实浏览器检查清单](testing/chrome-mcp-checklist.md)。
