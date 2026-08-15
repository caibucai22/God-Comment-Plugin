# 神评卡片

神评卡片是一个 Manifest V3 Chrome 扩展。它在哔哩哔哩视频页中选择评论，在浏览器本地生成 PNG 评论卡片并下载，不上传评论、封面或生成结果。

## 已验证环境与验证

推荐 Windows 11、PowerShell 7、Node.js 22 与 npm。首次安装依赖和 Playwright 自带 Chromium：

```powershell
npm install
npx playwright install chromium
```

本工作树最近一次环境采集为 Windows 11（运行时标识 `Microsoft Windows NT 10.0.26200.0`）、PowerShell Core 7.6.4、Node.js v22.22.2、npm 10.9.7 和 Playwright 1.62.1。每次准备发布仍应在目标机器重新运行以下完整验证矩阵；具体命令、日志与真实浏览器状态见 [MVP 验收交接](docs/status/2026-08-15-mvp-acceptance-handoff.md)。

常用验证命令：

```powershell
npm test -- --run
npx tsc --noEmit
npm run build
npm run test:e2e
git diff --check
```

`npm run test:e2e` 会先正常构建并核对生产 manifest，再生成只匹配 `http://127.0.0.1/*` 的临时 E2E 构建，将 `dist/` 作为 unpacked extension 加载进 persistent Chromium context。测试结束后会再次正常构建，使 `dist/manifest.json` 恢复为生产范围。E2E 使用 Playwright 的 `channel: "chromium"`（完整 bundled Chromium），不静默跳过缺失浏览器；如果浏览器未安装，命令会明确失败并提示执行上面的安装命令。

自动化只访问动态端口上的本机 fixture，不依赖公网或真实哔哩哔哩页面。persistent profile、fixture server 与下载文件在每条测试后清理；共享扩展构建以单 worker 运行。E2E fixture 通过不等于真实 Bilibili 页面通过；实机验收必须用已加载 unpacked `dist` 的 Chrome，按 [Chrome MCP 真实浏览器检查清单](docs/testing/chrome-mcp-checklist.md) 留存脱敏证据。

## 在 Chrome 中加载

先生成生产构建：

```powershell
npm run build
```

然后：

1. 在 Chrome 地址栏打开 `chrome://extensions/`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择当前项目的 `dist` 目录。
5. 若目标视频页已经打开，请刷新该标签页；首次加载或点击扩展“重新加载”后，旧页面必须刷新才能重新注入 content script。
6. 打开 `https://www.bilibili.com/video/...` 视频页并确认右下角出现“流光卡片核”入口。

生产 content script 仅匹配 `https://www.bilibili.com/video/*`。动态评论 DOM、站点改版、跨域封面策略或浏览器下载策略变化可能影响选择、封面加载或保存；本项目不声明支持其他平台、哔哩哔哩非视频页面或移动端页面。

## 使用与选项

点击右下角入口进入评论选择，悬停并点击合法评论后确认生成选项。默认比例为 `3:4`，也可选 `9:16`；提供温暖、历史、讽刺、SSS 四种样式。存在视频封面时默认包含封面，游戏化装饰默认关闭，两项都可以在确认面板中切换。

选择模式支持 Escape、右键、点击非评论区域、再次点击入口或点击“退出”来退出；滚轮不会退出。

## 权限与隐私

- `storage`：仅保存样式、比例、是否包含封面和是否启用游戏化装饰四项偏好。
- `downloads`：把浏览器本地 Canvas 生成的 PNG 保存到下载目录；若 API 拒绝请求，会退回浏览器原生链接下载。

卡片解析、属性生成、Canvas 渲染和 PNG 导出都在浏览器本地完成。扩展不包含后端、远程 AI 调用或遥测；除页面本身已有的封面资源加载外，不主动把评论内容或生成结果发送到网络。

## 真实浏览器复核

Playwright 提供可重复自动化基线。使用已安装 `chrome-mcp-tools` 做人工真实 Chrome 复核时，按 `docs/testing/chrome-mcp-checklist.md` 执行；该检查需要独立保留 snapshot、console、截图和操作日志证据。
