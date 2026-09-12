# Windows 网络与 Node 运行时异常调研 Spec

日期：2026-09-12
状态：调研完成，修复方案待确认
范围：当前 Codex PowerShell 子进程、NVM、Node.js 与本机代理 `127.0.0.1:7897`

## 1. 调研目标

确认以下现象是否来自同一根因：

- PowerShell 偶发 `CreateProcessAsUserW` 失败；
- Node.js 启动时报 `Assertion failed: ncrypto::CSPRNG(nullptr, 0)`；
- NVM 查询镜像时报 Winsock provider 或 DNS 初始化错误；
- 已启动的本地代理 `127.0.0.1:7897` 被误判为不可用。

本阶段只采集证据和验证假设，不修改系统级环境变量、不安装 Node、不修改代理配置。

## 2. 调研矩阵

| 层级 | 检查项 | 判定标准 |
| --- | --- | --- |
| 本地监听 | `127.0.0.1:7897` 是否处于 LISTENING | 存在监听 PID |
| 本地传输 | TCP 是否可连接 7897 | `.NET TcpClient` 返回 true |
| 代理出口 | 显式代理访问 Node 发布源 | HTTPS 返回 2xx |
| DNS | `.NET DNS` 解析多个域名 | 区分全局 DNS 与域名选择性异常 |
| 系统环境 | `SystemRoot/WINDIR/ComSpec` 是否存在 | 三项均应有合法 Windows 路径 |
| 系统随机源 | `.NET RandomNumberGenerator` | 可生成随机字节 |
| Node 随机源 | `node:crypto.randomBytes` | 进程正常退出 |
| NVM | `nvm list available` | 可返回版本列表 |

## 3. 证据结果

### 3.1 代理端口正常

- `127.0.0.1:7897` 存在一个监听实例；
- 监听 PID：`27084`；
- `.NET TcpClient` 到 `127.0.0.1:7897` 连接成功。

结论：本地代理端口已经启动，先前故障不能归因于“7897 未监听”。

### 3.2 代理出口部分正常

- 显式通过 `http://127.0.0.1:7897` 访问 `https://nodejs.org/dist/index.json`：HTTP 200；
- 显式访问 `https://npmmirror.com/mirrors/node/index.json`：15 秒超时。

结论：代理链路本身可用；`npmmirror.com` 存在独立的上游、路由或域名解析问题，不代表整个代理失效。

### 3.3 DNS 呈域名选择性异常

- `www.bilibili.com`：解析成功；
- `npmmirror.com`：解析失败；
- `nodejs.org`：系统 DNS 解析失败，但经代理访问成功。

结论：本机直连 DNS 并非完全不可用，更接近域名选择性失败或代理 DNS 与系统 DNS 路径不同。

### 3.4 Codex 子进程缺少关键 Windows 环境变量

异常会话中：

- `SystemRoot` 缺失；
- `WINDIR` 缺失；
- `ComSpec` 缺失；
- `PSModulePath` 中保留未展开的 `%SystemRoot%`；
- `Get-NetTCPConnection` 无法加载；
- `$env:SystemRoot\System32\netstat.exe` 被解析为 `\System32\netstat.exe`。

这组环境缺失可以同时影响：

- Windows 系统 DLL、网络 provider 与系统命令定位；
- Windows PowerShell 模块发现；
- Node/OpenSSL 初始化 Windows 加密随机源；
- 子进程创建和命令包装器行为。

### 3.5 单变量实验确认根因

仅在诊断 PowerShell 子进程中临时设置：

```powershell
$env:SystemRoot = 'C:\Windows'
$env:WINDIR = 'C:\Windows'
$env:ComSpec = 'C:\Windows\System32\cmd.exe'
```

设置前：

- Node `node:crypto.randomBytes(16)` 触发 CSPRNG 断言并退出；
- NVM 查询报网络 provider/DNS 错误。

设置后：

- Node 输出 `NODE_CSPRNG_OK`，退出码 0；
- NVM 成功返回版本列表；
- 当前最新可见 LTS 为 `24.21.0`；
- 显式代理访问 Node 发布源返回 HTTP 200。

结论：当前证据支持以下根因：**Codex 启动的 PowerShell 子进程缺失关键 Windows 环境变量，是 Node CSPRNG、部分网络 provider 以及进程创建异常的主要共同原因。**

Node 22.22.2 二进制本身暂不应判定为损坏，因为补齐环境变量后同一二进制可以正常完成 CSPRNG 初始化。

## 4. 根因与次要问题

### 4.1 主根因

Codex 子进程环境构造阶段遗漏：

- `SystemRoot=C:\Windows`
- `WINDIR=C:\Windows`
- `ComSpec=C:\Windows\System32\cmd.exe`

### 4.2 次要独立问题

`npmmirror.com` 经显式代理请求超时，而 `nodejs.org` 经代理正常。Node 安装流程不应只依赖 npmmirror；需要为 NVM 配置可回退的官方 Node 发布源。

## 5. 建议实施方案

### 5.1 第一阶段：项目级进程环境保护

在项目测试/构建 PowerShell 入口脚本中增加非覆盖式保护：

```powershell
if (-not $env:SystemRoot) { $env:SystemRoot = 'C:\Windows' }
if (-not $env:WINDIR) { $env:WINDIR = $env:SystemRoot }
if (-not $env:ComSpec) { $env:ComSpec = Join-Path $env:SystemRoot 'System32\cmd.exe' }
```

约束：

- 只影响当前测试/构建进程及其子进程；
- 已存在的合法变量不得覆盖；
- 不写入用户或系统永久环境；
- 日志仅记录变量是否存在，不记录敏感值。

### 5.2 第二阶段：Node LTS 交叉验证

在完成环境保护后：

1. 保留 Node 22.22.2；
2. 安装 Node LTS 24.21.0；
3. 切换后验证 `node --version` 与 `node:crypto.randomBytes`；
4. 运行项目完整测试、TypeScript、构建和 E2E；
5. 如 Node 22 与 Node 24 均通过，确认问题与版本无关；
6. 最终项目版本选择另行决策，不在调研阶段修改 `package.json` 或 CI。

### 5.3 第三阶段：NVM 镜像容错

若安装阶段 `npmmirror.com` 继续超时，临时将 NVM `node_mirror` 指向官方 `https://nodejs.org/dist/`。该操作会修改 `D:\03-env\nvm\settings.txt`，实施前需要单独确认并保留原配置备份。

## 6. 验收标准

- 未设置关键变量时，保护脚本可以补齐当前进程环境；
- 已设置关键变量时，保护脚本保持原值；
- `node:crypto.randomBytes(16)` 连续执行三次均成功；
- `nvm list available` 成功；
- Node 24 LTS 安装与切换成功，同时 Node 22.22.2 仍保留；
- Vitest 全量通过；
- `tsc --noEmit` 通过；
- production build 通过；
- Panel Playwright E2E 通过；
- 不执行 `git push`，不删除任何 Node 版本。

## 7. 风险与边界

- 本 spec 不建议立即修改系统永久环境变量；应先确认问题是否仅存在于 Codex 子进程环境注入。
- 不建议把 Node 22.22.2 直接认定为坏版本或删除。
- 不建议同时修改代理、DNS、NVM 镜像和 Node 版本，否则无法确定哪一个变量真正生效。
- `npmmirror.com` 超时需要独立处理，不能与 7897 端口状态混为一谈。

## 8. 证据文件

- `.superpowers/logs/network-investigation_执行命令说明_20260912_1700.log`
- `.superpowers/logs/network-investigation_执行命令说明_20260912_1705.log`
- `.superpowers/logs/network-hypothesis-systemroot_执行命令说明_20260912_1710.log`

日志与交接文件不纳入 Git；本调研 spec 可在确认后进入版本管理。
