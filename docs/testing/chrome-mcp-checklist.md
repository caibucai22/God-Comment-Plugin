# Chrome MCP 真实浏览器 RC 检查清单

本清单用于在真实 Bilibili 视频页复核 production `dist`。2026-09-13 本轮没有可调用 Chrome MCP，改由用户人工接管真实 Chrome 完成 Gate D；原始报告与截图位于 `C:\Users\001\Pictures\caima\comment-card\manual-test\`。Playwright fixture 与真实站点证据仍严格分开。

## 当前证据状态

| 范围 | 状态 | 具名来源/限制 |
| --- | --- | --- |
| 历史真实主流程 | `PASS`（仅继承） | `docs/status/2026-08-15-mvp-acceptance-handoff.md`：入口可见/可用、顶层评论、默认已展示回复可识别/可选择、连续动画、滚动目标更新、生成和本地保存；不含唯一性或回复卡片内容边界 |
| 历史真实 editing Panel | `PASS`（仅继承） | `.superpowers/status/manual-acceptance_执行命令说明_20260912.md`：单一 editing 截图，固定操作区和底部装饰 |
| 本轮五态视觉 | `PASS`（fixture） | `.superpowers/visual-qa/round-mvp-rc-20260913_105656_186-bc892c77b93e4ba48bb61c9322c291fd/`；不能证明真实 B站 |
| 本轮真实 Chrome | `PASS`（用户人工接管） | 原始报告、比例/皮肤/缩放/入口等截图位于本机 manual-test 目录；未加入 Git |

## 准备生产扩展

在 Windows Native PowerShell / Node 22.22.2 中执行：

```powershell
& '.\scripts\run-release-gates.ps1'
```

完成后确认 production `dist/manifest.json` 的 content-script match 只有 `https://www.bilibili.com/video/*`，permissions 恰为 `storage` 与 `downloads`，且无 `host_permissions`。在 `chrome://extensions/` 开启开发者模式并加载该 `dist`。真实页面与本地 fixture 独立；fixture 测试结束后 `dist` 会恢复为 production 构建。

## RC 实测登记（下一次 Chrome MCP 会话填写）

| 检查项 | 当前状态 | 所需真实页面证据 |
| --- | --- | --- |
| 页面刷新后右下角“开启评论选择”入口可见且可用 | `PASS` | 本轮真实截图与人工操作 |
| 页面刷新后右下角入口唯一 | `PASS` | 本轮真实截图仅显示一个入口 |
| 顶层评论 hover、选择并打开 editing | `PASS` | 本轮人工报告 |
| 默认展示回复可独立识别和选择 | `PASS` | 本轮人工报告 |
| 默认展示回复的卡片只含其自身作者、正文和时间 | `PASS` | 本轮人工逐项确认 |
| 相邻移动与滚动后的高亮连续 | `PASS` | 本轮人工报告 |
| editing 状态固定操作区、底部装饰、无裁切/遮挡 | `PASS` | 本轮真实截图与人工报告 |
| generating 状态：插画、制作中、取消制作，无编辑/保存 | `NOT RUN` | 状态截图与操作记录 |
| failed 状态：错误、重新生成、返回修改 | `NOT RUN` | 状态截图与恢复记录 |
| generated 状态：预览、实际比例/尺寸、返回修改、确认保存 | `PASS` | 本轮真实比例截图与人工操作 |
| saved 状态：PNG、分辨率、本地下载、再做一张 | `PASS` | 本轮人工保存验证 |
| `9:16` 生成并确认保存 1080 × 1920 PNG | `PASS` | 本轮比例截图与人工报告 |
| `16:9` 生成并确认保存 1920 × 1080 PNG | `PASS` | 本轮横版截图与人工报告 |
| generated 前不下载，仅“确认保存”后下载一次 | `PASS` | 本轮人工报告 |
| Panel 关闭后页面评论点击、滚动、链接和右键恢复 | `PASS` | 本轮人工报告 |
| Escape、右键、空白处、入口 toggle、提示退出 | `PASS` | 原始报告与用户后续补充确认 |
| 125% Windows 缩放下 Panel 未越界且底部操作区可用 | `PASS` | 本轮真实截图与人工报告 |
| reduced-motion、扩展 console、权限和证据隐私 | `PASS`（组合证据） | reduced-motion/权限由 fresh 自动化与生产审计覆盖；真实 console 由人工报告覆盖；证据未入 Git |

## 页面与 Shadow DOM 操作

1. 用 Chrome MCP 选择现有标签页或打开脱敏后的真实视频页。
2. 获取 accessibility snapshot，定位“开启评论选择”。
3. 必要时 evaluate：

```javascript
const host = document.querySelector('[data-ccg-overlay-root]');
const root = host?.shadowRoot;
({
  hostPresent: Boolean(host),
  entryText: root?.querySelector('.ccg-entry')?.textContent?.trim(),
  promptText: root?.querySelector('.ccg-selection-prompt')?.textContent?.trim(),
});
```

4. 确认仅一个 `[data-ccg-overlay-root]`，随后逐项填写上表；无工具调用证据时不能改写为 `PASS`。

## 证据保存与隐私

所有新文件使用不覆盖名称，例如：

```powershell
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$screenshotName = "ChromeMCP主流程_执行命令说明_$stamp.png"
$consoleLogName = "ChromeMCP控制台_执行命令说明_$stamp.log"
```

保留入口 snapshot、五态中的实际执行状态、9:16/16:9 下载文件元数据、确认前后下载计数、五种退出路径、125% 缩放、reduced-motion computed style 和 console 摘要。不得保存 Cookie、登录凭据、完整个人主页 URL 或不必要的评论正文。
