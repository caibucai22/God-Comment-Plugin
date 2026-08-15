# MVP 验收交接（2026-08-15）

## 结论状态

- 自动化验证：`PASS`，当前为 115/115 单元与集成测试、6/6 E2E；日志已纳入 `docs/logs/task-10/`。
- 真实 Bilibili 人工验证：入口、顶层评论选择、卡片生成及本地保存为 `PASS`。原构建的选中特效为 `FAIL`；修复构建待人工复测。新版嵌套回复为 `NOT RUN`。
- 发布判定：核心链路可用，但选中特效和新版嵌套回复尚未完成真实页面复测，不宣称完整实机验收通过。

## 范围与证据规则

- 支持范围仅为 `https://www.bilibili.com/video/*`，不扩展到其他平台、非视频页面或移动端。
- 自动化仅使用本机 Playwright fixture；它是可重复回归基线，不代表真实站点。
- 真机执行应遵循 [Chrome MCP 检查清单](../testing/chrome-mcp-checklist.md) 和 [手工检查清单](../manual-test-checklist.md)。
- 每个证据文件必须使用 `_执行命令说明_YYYYMMDD_HHmmss` 后缀，且不得记录评论正文、个人资料、登录态或 Cookie。

## 本次自动化矩阵

| 项目 | 命令/检查 | 结果 | 日志/备注 |
| --- | --- | --- | --- |
| 单元与集成测试 | `npm test -- --run` | `PASS`（115/115） | `docs/logs/task-10/targeting_repair_full_test_执行命令说明_20260815_175500.log` |
| TypeScript | `npx tsc --noEmit` | `PASS` | 初次检查发现测试替身缺少新接口并记录于 `docs/logs/task-10/tsc_执行命令说明_20260815_133826.log`；补齐后复检 exit 0 |
| 生产构建 | `npm run build` | `PASS` | `docs/logs/task-10/build_执行命令说明_20260815_133826.log` |
| E2E fixture | `npm run test:e2e` | `PASS`（6/6） | `docs/logs/task-10/targeting_repair_e2e_执行命令说明_20260815_175500.log`；覆盖真实 sibling 结构、`bili-comment-reply-renderer`、连续切换、静止光标滚动命中及回复自身内容，仍非真实 Bilibili |
| 生产 manifest | 精确 Bilibili match、仅 storage/downloads、无 host_permissions | `PASS` | `.superpowers/sdd/2026-08-12-comment-card-extension-implementation/task-10-logs/最终生产Manifest审查后_执行命令说明_20260815_131655.log` |
| Git 格式检查 | `git diff --check` | `PASS` | `.superpowers/sdd/2026-08-12-comment-card-extension-implementation/task-10-logs/最终Git差异检查_执行命令说明_20260815_130734.log`；仅有 CRLF 预警，无 diff whitespace error |

## Chrome MCP / 真实 Bilibili 交接

| 字段 | 状态/值 |
| --- | --- |
| 控制器 | 父控制器 |
| Chrome 版本 | `Chrome/151.0.0.0`（Windows 11） |
| unpacked extension 是否已加载 | `PASS`：用户完成加载；扩展 Reload 后刷新视频页才重新注入 |
| 测试 URL 范围（脱敏） | `https://www.bilibili.com/video/BV1xx411c7mD/`（登出态；已移除 `vd_source` query；滚动至 `#commentapp` 后评论可见） |
| 真实 Bilibili 结果 | 入口、顶层评论选择、生成及本地保存 `PASS`；原 hover 视觉 `FAIL`；修复后视觉与现代嵌套回复 `NOT RUN` |
| fixture MCP 结果 | `NOT RUN`；即使后续执行，也不得替代真实 Bilibili 结果 |
| 入口/评论/回复/滚动 | 入口和顶层评论 `PASS`；现代嵌套回复、滚动保持选择 `NOT RUN` |
| 五种退出路径 | `NOT RUN` |
| 合法评论 hover | 原构建 `FAIL`；独立页面高亮层修复自动化 `PASS`，真实页面待复测 |
| 四种样式、两种比例、封面、游戏化默认值 | `NOT RUN` |
| 稳定属性、长文本、英文、Emoji | `NOT RUN` |
| 封面 fallback、PNG 非空和精确尺寸 | `NOT RUN` |
| Bilibili 原有交互、reduced motion、console | 扩展交互与 reduced motion 为 `BLOCKED`；MCP DOM 侦测期间浏览器 console 为 `PASS`（无 error/warning），不等同于扩展 console 验收 |
| 隐私/权限及证据脱敏 | `NOT RUN` |
| Snapshot / screenshot / console / download / operation-log 路径 | screenshot 已在 MCP 响应内可见但 `NOT SAVED`：Chrome MCP workspace-root 限制拒绝仓库/worktree 路径；其余扩展流程证据为 `BLOCKED` |
| 阻塞因素 | 无加载阻塞；剩余为修复后人工视觉复测和现代嵌套回复真实页面验证 |

## 已纳入的真实 DOM 兼容性修复

父控制器在未加载扩展的真实页面中观察到以下结构：`#commentapp > bili-comments::shadow #feed > bili-comment-thread-renderer::shadow > bili-comment-renderer::shadow`；正文、作者、时间分别在 `#contents`、`#user-name`、`#pubdate` 的 open Shadow DOM 内。该侦测不构成功能通过证据，但已促成以下受自动化保护的最小修复：

- `BilibiliAdapter` 只在自身内穿透 open Shadow DOM，并沿 composed tree 判定评论归属。
- `SelectionController` 从 `event.composedPath()` 解析被 Shadow boundary 重定向的事件。
- 合法评论解析到 Shadow DOM 内可见的 `#body` 锚点；页面顶层独立高亮层绘制渐变流光和 12px 内弱水雾，并随滚动、缩放更新位置。
- `prefers-reduced-motion: reduce` 下关闭高亮层循环动画；退出选择、移出评论或销毁时移除视觉层。
- Shadow DOM 将非空 `pointerout.relatedTarget` 重定向为外层宿主时，不再提前清除刚切换到下一条评论的高亮；后续 `pointerover` 负责确定真实目标。真正离开文档或进入扩展浮层仍立即清理。
- 评论之间直接切换时复用同一个高亮层并更新锚点，不再删除、重建节点或重启流光动画。
- 已撤销旧自动化中“用 `bili-comment-renderer` 模拟回复”的假阳性；新 fixture 按真实结构将顶层评论与 `#replies` 作为 thread ShadowRoot 内兄弟，并使用任意数量可渲染的 `bili-comment-reply-renderer`。
- pointermove 与 scroll 通过最后光标坐标和 open Shadow DOM 深层 `elementFromPoint` 在单个 RAF 中协调；不可选中间容器不再制造临时空目标闪断。
- 近距离目标切换复用视觉层并使用 140ms ease-out；超过 240px 直接定位，reduced motion 下关闭位置过渡。
- 先后保留 RED 日志与 GREEN 回归：`RED真实ShadowDOM适配器回归_执行命令说明_20260815_130205.log`、`RED事件重定向回归_执行命令说明_20260815_130217.log`、`RED生产hover视觉回归_执行命令说明_20260815_130244.log`、`GREEN真实ShadowDOM最终回归_执行命令说明_20260815_130454.log`、`GREEN类型与ShadowDOM回归_执行命令说明_20260815_130617.log`。

## 发布前复核

1. 以生产 `dist` 加载 unpacked extension；不得把 E2E 临时 build 当成生产包。
2. 复跑自动化矩阵，确认 E2E 已在 teardown 后恢复生产 manifest。
3. 回填 Chrome 版本、脱敏 URL 范围、证据路径、实际结果和 blocker；无 unpacked extension 时记录 `NOT RUN/BLOCKED`，不模拟通过。
4. 若真实站点暴露选择器/适配问题，先增加失败的 adapter、integration 或 E2E 回归，再实施最小修复，且选择器只能留在 `BilibiliAdapter`。
