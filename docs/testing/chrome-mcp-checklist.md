# Chrome MCP 真实浏览器 RC 检查清单

本清单用于可调用 Chrome MCP 的控制器在真实 Bilibili 视频页复核 production `dist`。本轮（2026-09-13）没有可调用 Chrome MCP；**没有执行新的真实 B站会话**。因此这份清单的未执行项必须保持 `NOT RUN`，不得以 Playwright fixture、production audit 或历史截图替代。

## 当前证据状态

| 范围 | 状态 | 具名来源/限制 |
| --- | --- | --- |
| 历史真实主流程 | `PASS`（仅继承） | `docs/status/2026-08-15-mvp-acceptance-handoff.md`：入口可见/可用、顶层评论、默认已展示回复可识别/可选择、连续动画、滚动目标更新、生成和本地保存；不含唯一性或回复卡片内容边界 |
| 历史真实 editing Panel | `PASS`（仅继承） | `.superpowers/status/manual-acceptance_执行命令说明_20260912.md`：单一 editing 截图，固定操作区和底部装饰 |
| 本轮五态视觉 | `PASS`（fixture） | `.superpowers/visual-qa/round-mvp-rc-20260913_105656_186-bc892c77b93e4ba48bb61c9322c291fd/`；不能证明真实 B站 |
| 本轮真实 Chrome MCP | `NOT RUN` | 当前工具集无 callable Chrome MCP |

## 准备生产扩展

在 Windows Native PowerShell / Node 22.22.2 中执行：

```powershell
& '.\scripts\run-release-gates.ps1'
```

完成后确认 production `dist/manifest.json` 的 content-script match 只有 `https://www.bilibili.com/video/*`，permissions 恰为 `storage` 与 `downloads`，且无 `host_permissions`。在 `chrome://extensions/` 开启开发者模式并加载该 `dist`。真实页面与本地 fixture 独立；fixture 测试结束后 `dist` 会恢复为 production 构建。

## RC 实测登记（下一次 Chrome MCP 会话填写）

| 检查项 | 当前状态 | 所需真实页面证据 |
| --- | --- | --- |
| 页面刷新后右下角“开启评论选择”入口可见且可用 | `PASS`（仅继承） | 历史具名证据；新会话 snapshot 或脱敏截图 |
| 页面刷新后右下角入口唯一 | `NOT RUN` | 历史具名证据未单独覆盖唯一性；需要新会话 snapshot |
| 顶层评论 hover、选择并打开 editing | `PASS`（仅继承） | 新会话操作记录 |
| 默认展示回复可独立识别和选择 | `PASS`（仅继承） | 历史具名证据；新会话操作记录 |
| 默认展示回复的卡片只含其自身作者、正文和时间 | `NOT RUN`（真实站点） | fixture 自动化 `PASS`：`tests/e2e/selection-flow.spec.ts` 的真实结构回复断言；需要新会话脱敏证据 |
| 相邻移动与滚动后的高亮连续 | `PASS`（仅继承） | 新会话操作记录 |
| editing 状态固定操作区、底部装饰、无裁切/遮挡 | `PASS`（仅继承） | 新会话脱敏截图 |
| generating 状态：插画、制作中、取消制作，无编辑/保存 | `NOT RUN` | 状态截图与操作记录 |
| failed 状态：错误、重新生成、返回修改 | `NOT RUN` | 状态截图与恢复记录 |
| generated 状态：预览、实际比例/尺寸、返回修改、确认保存 | `NOT RUN` | 状态截图与下载前目录记录 |
| saved 状态：PNG、分辨率、本地下载、再做一张 | `NOT RUN` | 状态截图与下载文件元数据 |
| `9:16` 生成并确认保存 1080 × 1920 PNG | `NOT RUN` | 脱敏 IHDR/文件大小记录 |
| `16:9` 生成并确认保存 1920 × 1080 PNG | `NOT RUN` | 脱敏 IHDR/文件大小记录 |
| generated 前不下载，仅“确认保存”后下载一次 | `NOT RUN` | 生成前后下载目录计数与操作记录 |
| Panel 关闭后页面评论点击、滚动、链接和右键恢复 | `NOT RUN` | 操作记录 |
| Escape、右键、空白处、入口 toggle、提示退出 | `NOT RUN` | 五项操作记录 |
| 125% Windows 缩放下 Panel 未越界且底部操作区可用 | `NOT RUN` | 缩放值、脱敏截图与操作记录 |
| reduced-motion、扩展 console、权限和证据隐私 | `NOT RUN` | computed style、console 摘要、manifest 审查和脱敏核对 |

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
