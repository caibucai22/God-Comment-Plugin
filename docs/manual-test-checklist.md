# MVP 发布前手工检查清单

## 使用方式

- 每项只能填写 `PASS`、`FAIL` 或 `NOT RUN`，并在“备注/证据”中给出截图、Chrome MCP snapshot、控制台日志或阻塞原因。
- 真实站点检查必须通过 Chrome MCP 完成，并且必须与本地 Playwright fixture 的结果分开记录；fixture 结果不能推断为真实 B 站通过。
- 所有新证据文件使用不覆盖命名：`<用途>_执行命令说明_YYYYMMDD_HHmmss.<扩展名>`。
- 证据中不得保存评论正文、昵称、头像、URL query、登录态、Cookie 或其他可识别内容；仅保留脱敏后的操作结果、文件大小、尺寸、选择器状态和错误摘要。

## 执行信息

| 字段 | 填写值 |
| --- | --- |
| 执行日期/时区 | |
| 执行人/控制器 | |
| Chrome 版本 | Chrome/151.0.0.0 |
| 扩展版本/`dist` 构建时间 | `430e7ae` 后的人工构建；选中特效修复包待复测 |
| 测试 URL 范围（脱敏） | `https://www.bilibili.com/video/BV1xx411c7mD/`（移除 tracking query） |
| 证据目录/文件 | screenshot：`NOT SAVED (MCP workspace-root restriction)` |
| 总体结论 | `FAIL`：核心生成链路可用，选中特效修复包待复测 |
| 阻塞项 | 新版嵌套回复尚未在真实页面验证；修复后的流光视觉尚未人工复测 |

## 入口、选择与站点兼容性

| 检查项 | 结果 | 备注/证据 |
| --- | --- | --- |
| 受支持视频页出现且仅出现一个“开启评论选择”入口 | `PASS` | 扩展 Reload 后刷新视频页，入口出现 |
| 普通评论能识别为可选目标 | `PASS` | 已人工选择一条顶层评论 |
| 默认展示的 `bili-comment-reply-renderer` 能识别为独立可选目标 | `NOT RUN` | 自动化真实结构已 PASS；仍需真实 B站复测，不要求展开或分页回复 |
| 仅合法评论悬停时附加 `ccg-comment-hover` 视觉状态 | `FAIL` | 原包无可见效果；最新修复已通过连续移动和滚动自动化，待人工复测后更新结果 |
| 非评论区域悬停、点击不被误选 | `NOT RUN` | |
| 滚轮滚动后仍处于选择模式，评论区域可继续识别 | `NOT RUN` | |
| 原有 B 站点击、回复、展开、滚动和右键以外的交互未被扩展破坏 | `NOT RUN` | |

## 退出路径

每次检查前先重新进入选择模式。

| 检查项 | 结果 | 备注/证据 |
| --- | --- | --- |
| 按 Escape 退出 | `NOT RUN` | |
| 在评论上右键退出，且该次浏览器 context menu 被抑制 | `NOT RUN` | |
| 点击非评论区域退出 | `NOT RUN` | |
| 再次点击入口退出 | `NOT RUN` | |
| 点击提示中的“退出”按钮退出 | `NOT RUN` | |

## 生成选项、内容边界与导出

| 检查项 | 结果 | 备注/证据 |
| --- | --- | --- |
| 确认面板提供温暖、历史、讽刺、SSS 四种样式 | `NOT RUN` | |
| 默认比例为 `3:4`，可切换 `9:16` | `NOT RUN` | |
| 有可用封面时默认勾选封面 | `NOT RUN` | |
| 游戏化装饰默认关闭 | `NOT RUN` | |
| 相同来源和样式重复生成时稳定属性一致 | `NOT RUN` | 仅比较脱敏后的属性；不保留评论内容 |
| 长文本正常排版、不溢出 | `NOT RUN` | |
| 英文和 Emoji 正常排版、不报错 | `NOT RUN` | |
| 封面不可用时出现可理解的 fallback，仍可完成生成 | `NOT RUN` | |
| 下载 PNG 非空，且像素尺寸与所选比例/导出规格精确一致 | `PASS` | 已人工确认生成并保存至本地；未保存评论图像证据 |

## 无障碍、控制台与隐私

| 检查项 | 结果 | 备注/证据 |
| --- | --- | --- |
| `prefers-reduced-motion: reduce` 下 `.ccg-entry::before` 的 `animationName` 为 `none` | `NOT RUN` | |
| reduced-motion 下仍能进入选择、选择评论和打开确认面板 | `NOT RUN` | |
| 页面 console 无扩展引起的 uncaught exception 或 error 级日志 | `NOT RUN` | |
| 仅申请 `storage`、`downloads`，没有 `host_permissions` | `NOT RUN` | 可引用生产 manifest 审计证据 |
| 手工证据未存储评论内容或其他个人数据 | `NOT RUN` | 检查截图、日志与下载目录记录 |

## Chrome MCP 证据登记

| 证据类别 | 路径/标识 | 状态 | 备注 |
| --- | --- | --- | --- |
| 已加载 unpacked extension 的 Chrome 状态 | 用户人工加载 | `PASS` | Reload 后刷新页面完成注入 |
| 入口 accessibility snapshot | 用户人工观察 | `PASS` | 右下角入口可见 |
| Shadow DOM evaluate（宿主、入口、提示） | MCP response（未存盘） | `PASS`（仅页面 DOM） | `#commentapp > bili-comments` 存在；20 个 thread host；未记录评论内容 |
| hover/确认面板截图 | | `NOT RUN` | |
| 下载文件信息 | | `NOT RUN` | |
| 五种退出路径操作日志 | | `NOT RUN` | |
| reduced-motion computed style | | `NOT RUN` | |
| console 检查结果 | MCP response（未存盘） | `PASS`（仅页面 DOM） | 无 browser error/warning；不等同于扩展 console 验收 |

详细操作步骤见 [Chrome MCP 真实浏览器检查清单](testing/chrome-mcp-checklist.md)。
