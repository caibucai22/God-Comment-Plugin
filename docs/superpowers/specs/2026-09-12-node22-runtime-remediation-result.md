# Windows Node 22 运行时问题与修复结论

日期：2026-09-12  
状态：项目级修复已生效；宿主裸进程环境仍需后续处理  
适用环境：Windows 11、PowerShell 7、NVM for Windows、Node.js 22.22.2

## 1. 问题摘要

在 Codex 启动的 Windows PowerShell 子进程中，Node.js 22.22.2 曾在启动阶段失败：

```text
Assertion failed: ncrypto::CSPRNG(nullptr, 0)
```

同期还观察到：

- PowerShell 偶发 `CreateProcessAsUserW` 失败；
- NVM 查询出现 Winsock provider 或 DNS 初始化错误；
- Vite/Vitest 启动 esbuild 时可能出现 `spawn EPERM`；
- 本地代理已监听，但部分域名仍发生选择性 DNS 或上游超时。

这些现象不能简单归因于 Node 22 二进制损坏或代理端口未启动。

## 2. 根因证据

异常 Codex 子进程中缺少以下关键 Windows 环境变量：

- `SystemRoot`
- `WINDIR`
- `ComSpec`

同时，`PSModulePath` 中存在未展开的 `%SystemRoot%`。这会影响 Windows 系统组件定位、网络 provider、进程创建以及 Node/OpenSSL 对系统随机源的初始化。

在同一个 PowerShell 进程内临时补齐：

```powershell
$env:SystemRoot = 'C:\Windows'
$env:WINDIR = 'C:\Windows'
$env:ComSpec = 'C:\Windows\System32\cmd.exe'
```

之后，同一份 Node 22.22.2 可以完成 CSPRNG 初始化并运行项目工具。因此当前证据支持：

> 主根因是 Codex 子进程环境缺失关键 Windows 变量，而不是 Node 22.22.2 本身损坏。

## 3. 已实施修复

### 3.1 进程级环境初始化器

项目新增：

```text
scripts/windows-node-env.ps1
```

它提供 `Initialize-WindowsNodeEnvironment`，其行为为：

1. 仅在 Windows 环境工作；
2. 只补齐当前进程中缺失的变量；
3. 不写入用户级或机器级永久环境；
4. 不覆盖已存在且有效的值；
5. 已存在但非法的路径会明确报错；
6. Windows 根目录按以下顺序解析：
   - 机器级 `SystemRoot`；
   - Windows special-folder API；
   - 经验证的 `C:\Windows` fallback；
7. Windows 根目录必须包含有效的 `System32\cmd.exe`。

### 3.2 受保护的完整门禁入口

项目新增：

```text
scripts/run-release-gates.ps1
```

该入口会在解析和启动 Node 前调用环境初始化器，然后直接通过 Node 执行本地工具：

- Vitest；
- TypeScript；
- Vite production build；
- Playwright E2E；
- `git diff --check master...HEAD`。

每个外部程序的退出码都会被即时检查。运行过程同时输出到终端和唯一日志：

```text
.superpowers/logs/release-gates_执行命令说明_<日期>_<唯一标识>.log
```

日志和交接文件不进入 Git。

## 4. Node 22 新鲜复测结果

复测环境：

- Windows Native PowerShell：7.6.6；
- Node.js：v22.22.2；
- 分支：`feat/pixel-perfect-panel-state-machine`；
- 验证提交：`e95223b`。

通过受保护入口执行：

```powershell
& '.\scripts\run-release-gates.ps1'
```

结果：

| 门禁 | 结果 |
| --- | --- |
| Vitest | 15 个测试文件、149/149 tests passed |
| TypeScript | passed |
| Vite production build | passed |
| Playwright | 10 passed、1 个显式视觉截图用例 skipped |
| Git diff check | passed |

本轮证据日志：

```text
.superpowers/logs/release-gates_执行命令说明_20260912_212648_589_70196e303a3b435fabe1d059ebdfaea0.log
```

## 5. 当前边界

直接执行未经项目初始化器保护的 Node 22 CSPRNG 探针，仍可能触发同一断言：

```powershell
& 'D:\03-env\nodejs\node.exe' -e "require('node:crypto').randomBytes(16)"
```

这说明：

- 项目级保护已经生效；
- 项目测试、构建和 E2E 可以继续使用 Node 22；
- Codex 宿主创建的裸子进程环境尚未被证明彻底修复；
- 不应把“受保护入口通过”误写成“机器级环境已经完全正常”。

另外，沙箱内运行完整门禁时曾在 esbuild 子进程处得到 `spawn EPERM`；同一命令在获准的沙箱外环境中完整通过，因此该次 `EPERM` 属于执行隔离边界，而不是项目测试失败。

## 6. 当前决策

1. 暂不安装或切换 Node 24；
2. 保留 Node 22.22.2；
3. 项目测试、构建和 E2E 统一使用受保护入口；
4. 不修改系统永久环境变量；
5. 不修改 NVM 镜像；
6. 不删除任何 Node 版本；
7. 若后续继续修复宿主环境，以“裸 Node CSPRNG 连续成功”为机器级验收条件。

## 7. 推荐操作

完整验证：

```powershell
& '.\scripts\run-release-gates.ps1'
```

只检查当前 Node 版本：

```powershell
& 'D:\03-env\nodejs\node.exe' --version
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

不要直接使用 `npm` 作为 Codex 异常子进程中的第一层入口，因为 npm 本身需要先启动 Node，无法在 Node 初始化之前补齐缺失的 Windows 环境变量。

## 8. 相关文件

- 调研依据：`docs/superpowers/specs/2026-09-12-windows-network-node-runtime-investigation.md`
- 实施计划：`docs/superpowers/plans/2026-09-12-windows-node-runtime-remediation.md`
- 环境初始化器：`scripts/windows-node-env.ps1`
- 发布门禁入口：`scripts/run-release-gates.ps1`
- 自动化测试：`tests/scripts/windows-node-env.test.ps1`
- 忽略的复测交接：`.superpowers/status/node22-retest-handoff_执行命令说明_20260912_2127.md`
