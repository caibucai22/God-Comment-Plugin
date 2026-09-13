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

在 Windows/Codex 环境中，发布前请优先使用项目提供的完整验证入口：

```powershell
& .\scripts\run-release-gates.ps1
```

该入口会先初始化当前 PowerShell 进程所需的 Windows 环境变量，再直接运行本地 Vitest、TypeScript、Vite、最终 production-package audit、Playwright 与 Git 差异检查。production-package audit 在 Vite 生产构建后、Playwright 临时 E2E 构建前执行，验证最终 `dist/manifest.json` 的 MV3、最小权限、B站视频页 match、无 `host_permissions`、content script 与必要像素素材非空，并拒绝项目自有的遥测或上传端点标记、常见网络 API alias 以及非 renderer 白名单路径的 Image beacon。每次都会在 `.superpowers/logs/` 创建唯一的运行日志，其中包含每一步的开始/通过/失败状态，以及各 native 子进程实时输出的 stdout 与 stderr。不能以 `npm` 作为这一步的替代：`npm` 也是由 Node 启动的包装器，若 Node 启动前缺少 `SystemRoot`、`WINDIR` 或 `ComSpec`，npm 无法先恢复这些 Windows 变量。

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

点击右下角入口进入评论选择，悬停并点击合法评论后确认生成选项。比例可选 `3:4`（默认）、`9:16` 与 `16:9`；样式可选哔哩哔哩（默认）、温暖、历史、讽刺与 SSS。存在视频封面时默认包含封面；游戏化装饰和评论属性默认关闭，也都可以在确认面板中切换。

生成提示音默认关闭；启用后只在用户触发生成时用本地 WebAudio 播放一次不足 500ms 的简短反馈，不加载外部音频，音频能力不可用或播放失败不会阻断生成。`prefers-reduced-motion` 只减少视觉动效，不会代替静音设置。Panel 皮肤默认为 `pixel`，也可切换到 `classic-dark`；切换即时生效并随其他偏好一起保存。

选择模式支持 Escape、右键、点击非评论区域、再次点击入口或点击“退出”来退出；滚轮不会退出。

## 权限与隐私

- `storage`：只保存 `style`、`ratio`、`includeCover`、`gameDecoration`、`includeAttributes`、`soundEnabled` 与 `panelSkin` 七项显示/生成偏好；不会保存评论正文草稿或视频标题。
- `downloads`：把浏览器本地 Canvas 生成的 PNG 保存到下载目录；若 API 拒绝请求，会退回浏览器原生链接下载。

卡片解析、属性生成、Canvas 渲染和 PNG 导出都在浏览器本地完成。扩展不包含后端、远程 AI 调用或遥测；除页面本身已有的封面资源加载外，不主动把评论内容或生成结果发送到网络。

## 真实浏览器复核

Playwright 提供可重复自动化基线。使用已安装 `chrome-mcp-tools` 做人工真实 Chrome 复核时，按 `docs/testing/chrome-mcp-checklist.md` 执行；该检查需要独立保留 snapshot、console、截图和操作日志证据。
