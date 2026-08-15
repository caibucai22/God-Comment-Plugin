# Chrome MCP 真实浏览器检查清单

本清单用于父控制器或审阅者通过已安装的 `chrome-mcp-tools` 复核真实 Chrome。Task 9 实现者只准备流程，**没有执行或声称执行本次 Chrome MCP 会话**。

## 1. 准备生产扩展

在 Windows Native PowerShell 中执行：

```powershell
npm run build
```

确认 `dist/manifest.json` 的 content-script match 仍只有 `https://www.bilibili.com/video/*`，permissions 恰为 `storage` 与 `downloads`，且没有新增 `host_permissions`。在 `chrome://extensions/` 开启开发者模式并加载项目 `dist` 目录。

本清单当前的 Chrome MCP 手工路径使用一个真实 Bilibili 视频页。`npm run test:e2e` 内部使用的本地 fixture 只在自动化测试进程期间存活；测试结束后服务器关闭且 `dist` 恢复生产构建，不能在随后独立的 MCP 会话中继续访问。真实站点结果受登录、网络和页面改版影响，因此 MCP 手工结果不能代替本地 Playwright fixture 基线。

## 2. 页面与 Shadow DOM

1. 用 Chrome MCP 选择现有标签页或打开目标视频页。
2. 先获取 accessibility snapshot，定位“开启评论选择”按钮。
3. 如果 snapshot 无法穿透扩展的 open Shadow DOM，用 evaluate 查找宿主：

```javascript
const host = document.querySelector('[data-ccg-overlay-root]');
const root = host?.shadowRoot;
({
  hostPresent: Boolean(host),
  entryText: root?.querySelector('.ccg-entry')?.textContent?.trim(),
  promptText: root?.querySelector('.ccg-selection-prompt')?.textContent?.trim(),
});
```

4. 确认页面只有一个 `[data-ccg-overlay-root]`。

## 3. 主流程

- 点击入口，确认提示出现。
- hover 一条合法评论，evaluate 确认评论节点含 `ccg-comment-hover`。
- 点击评论，确认“生成前确认”面板和评论预览出现。
- 核对默认 `3:4`、封面可用时勾选封面、游戏化装饰未勾选，并确认四种样式可选。
- 点击“生成卡片”，确认下载文件名以 `.png` 结尾且文件非空。
- 检查页面 console：不得有扩展引起的 uncaught exception 或 error 级日志。

## 4. 退出与无障碍动效

每次重新进入选择模式后分别验证：

- 按 Escape 退出。
- 在评论上右键，退出且浏览器 context menu 被抑制。
- 点击非评论区域退出。
- 再次点击入口退出。
- 点击提示中的“退出”按钮退出。
- 滚轮滚动后仍处于选择模式。

将系统或页面的 `prefers-reduced-motion` 设为 `reduce`，evaluate `.ccg-entry::before` 的 computed `animationName` 应为 `none`；随后仍应能进入选择、选择评论并打开确认面板。

## 5. 证据保存

检查前生成一次时间戳，所有截图和日志使用不覆盖命名：

```powershell
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$screenshotName = "ChromeMCP主流程_执行命令说明_$stamp.png"
$consoleLogName = "ChromeMCP控制台_执行命令说明_$stamp.log"
```

至少保留：入口 snapshot、hover/确认面板截图、下载文件信息、退出路径操作日志、reduced-motion computed style、console 检查结果。报告应区分“已按 MCP 执行并有工具证据”与“仅阅读本清单”；没有工具调用证据时不得写成已验证。
