# MVP RC 下一轮推进前置交接

日期：2026-09-13
状态：暂停，等待下一轮最终分支审查

## 1. 暂停原因

MVP RC 收尾计划的 Task 1–4 均已完成、提交并通过各自的任务级审查。随后发起整条 `feat/pixel-perfect-panel-state-machine` 分支的最终只读审查，但 reviewer 在读取和审查前因调用额度耗尽失败：

```text
You've hit your usage limit.
```

这不是代码、测试、构建或运行时失败。最终 reviewer 没有返回任何技术结论，因此不能把这次失败记录为“最终审查通过”或“最终审查发现缺陷”。

按用户要求，本轮在此暂停，不继续派发 reviewer、不执行合并、不执行 push。

## 2. 当前仓库位置

| 字段 | 值 |
| --- | --- |
| Worktree | `E:\03-Projects\AiProjects\CommentCardGen-Codex\.worktrees\pixel-perfect-panel-state-machine` |
| 分支 | `feat/pixel-perfect-panel-state-machine` |
| 基线分支 | `master` |
| 分叉基点 | `0a018aae208186e3b59606b189fa41260f8ed22a` |
| 当前实现/RC 文档 HEAD | `02c6e68` |
| 当前 RC 判定 | `CONDITIONAL PASS` |
| Node | `v22.22.2` |
| PowerShell | Windows Native 7.6.6 |

本文档提交后，下一轮应以新的文档提交 HEAD 为最终审查终点，不要只审到 `02c6e68`。

## 3. 已完成任务

### Task 1：生产包审计

完成内容：

- 新增 production package audit；
- 审计 MV3、唯一 B站 video match、精确 permissions、无 `host_permissions`；
- 校验 manifest 声明的 JS/CSS 和所需像素素材存在且非空；
- 使用 TypeScript AST 审计源码网络 sink；
- 仅允许卡片渲染器中的图片 GET 路径；
- 拒绝 `sendBeacon`、XHR、WebSocket、未授权 fetch 和动态 computed global call；
- 审计接入 Vite 后、Playwright 前的 protected release gate；
- CLI、PowerShell 调用顺序和退出码绑定均有回归测试。

主要提交：

- `6021977 test: audit production extension package`
- `bd10293 fix: strengthen production package audit`
- `aea43b3 fix: audit source-level network calls`
- `565be03 fix: detect global fetch aliases`
- `4371c30 fix: reject computed global network calls`

任务级最终审查：`PASS`。

### Task 2：五状态 Panel 发布契约

完成内容：

- 表驱动覆盖 `editing`、`generating`、`failed`、`generated`、`saved`；
- 固定 336 × 570 shell；
- 共享 Header、StateViewport、ActionArea、BottomDecoration；
- 控件不得越界；
- 18px 全宽 ground、scene 使用 `contain`；
- generated preview 不使用 pixelated；
- 修复 determinate generating 状态只显示 `65%`、缺少“制作中”语义的问题。

提交：`a056206 fix: enforce release panel state contracts`

任务级最终审查：`PASS`。

### Task 3：三比例导出与恢复路径

完成内容：

- E2E 覆盖：
  - 3:4 → 1200 × 1600；
  - 9:16 → 1080 × 1920；
  - 16:9 → 1920 × 1080；
- 验证生成态元数据、确认前零下载、确认后单次非空 PNG、IHDR 精确尺寸和 saved 状态；
- 覆盖生成失败、retry、return-editing 和 busy 去重；
- 修复 Panel 缺失 9:16 选项；
- 修复 9:16 偏好在保存/重新加载时被错误降级到 3:4。

主要提交：

- `b657fb2 fix: verify release export matrix and recovery`
- `f6fac04 fix: persist approved 9:16 ratio`

任务级最终审查：`PASS`。

### Task 4：视觉证据与 RC 报告

完成内容：

- 采集并逐张查看五状态 fixture 截图；
- 五张截图均为 336 × 570、非空；
- 更新 Chrome MCP 与人工测试清单；
- 形成 Gate A/B/C/D RC 报告；
- 收紧历史真实站点证据边界：入口“可见/可用”不等于“唯一”，回复“可选择”不等于真实站点已证明内容归属；
- 未执行的真实站点项目均明确为 `NOT RUN`。

主要提交：

- `35dc21d docs: record MVP release candidate closure`
- `02c6e68 fix: tighten RC real-site evidence boundaries`

任务级最终审查：`PASS`。

## 4. 最新验证证据

Task 4 完成时的最终 protected release gate：

| 门禁 | 结果 |
| --- | --- |
| Vitest | 16 files / 183 tests passed |
| TypeScript | passed |
| Vite production build | passed |
| Production package audit | passed，findings 0 |
| Playwright | 13 passed / 1 explicit visual-only test skipped |
| Git diff check | passed |

最终门禁日志：

```text
.superpowers/logs/release-gates_执行命令说明_20260913_105954_142_82469583b0494d8bbc966f05137884e8.log
```

五状态视觉 artifact：

```text
.superpowers/visual-qa/round-mvp-rc-20260913_105656_186-bc892c77b93e4ba48bb61c9322c291fd/
```

以上日志和截图均为 Git ignored，不得移动进 tracked docs。

## 5. 当前 RC 结论

当前结论是 `CONDITIONAL PASS`：

- Gate A：PASS；
- Gate B：PASS；
- Gate C：PASS；
- Gate D：部分历史真实证据 PASS，剩余项目 NOT RUN；
- 开放 P0：0；
- 开放 P1：0。

`CONDITIONAL PASS` 的原因不是自动化失败，而是本轮没有可调用 Chrome MCP，无法完成同一轮真实 B站 Gate D。不得在未补证据前把结论升级为 `PASS`。

正式报告：

```text
docs/status/2026-09-12-mvp-rc-closure-report.md
```

## 6. 下一轮唯一正确起点

下一轮不得重新执行 Task 1–4，也不得重新实现已完成修复。按以下顺序继续：

### Step 1：恢复最终全分支审查

派发一个新的高能力只读 reviewer：

- Base：`0a018aae208186e3b59606b189fa41260f8ed22a`；
- Head：下一轮开始时的实际 `HEAD`；
- 必读：
  - `docs/superpowers/specs/2026-09-12-mvp-release-candidate-closure-design.md`；
  - `docs/superpowers/plans/2026-09-12-mvp-release-candidate-closure.md`；
  - `docs/status/2026-09-12-mvp-rc-closure-report.md`；
  - 本交接文档；
  - `.superpowers/sdd/2026-09-12-mvp-release-candidate-closure/progress.md`；
  - Task 1–4 reports。

审查范围：Panel state machine/geometry/assets、Bilibili adapter 与 selection continuity、render/export/preferences、production audit、release gate、manifest/privacy、测试与证据诚实性。

### Step 2：处理最终 reviewer 反馈

- 无 Critical/Important：进入 Step 3；
- 有 Critical/Important：只派发一轮统一修复，随后做一次 scoped re-review；
- Minor：写入 backlog，不自动扩大 RC 范围；
- 真实 B站 `NOT RUN` 是已知证据边界，不应误报为代码缺陷。

### Step 3：在最终 HEAD 上运行新鲜完整门禁

使用：

```powershell
& '.\scripts\run-release-gates.ps1'
```

由于沙箱内 esbuild 曾出现 `spawn EPERM`，若同一错误再次发生，应在获准的沙箱外运行完全相同的命令；不要把 sandbox EPERM 误判为产品失败。

### Step 4：补全真实 B站 Gate D

使用 production `dist` 和：

- `docs/testing/chrome-mcp-checklist.md`；
- `docs/manual-test-checklist.md`。

重点补齐：

- 入口唯一性；
- 回复卡片只包含回复自身内容；
- 五状态逐态；
- 正文修改/恢复原文；
- 样式/更多摘要一致；
- 9:16 与 16:9；
- 确认前不下载；
- 五种退出；
- 125% 缩放；
- Panel 关闭后页面交互恢复；
- reduced motion、console 和证据隐私。

全部通过且无 P0/P1 后，把正式 RC 报告升级为 `PASS`。

### Step 5：请求用户作出本地合并决定

只有满足以下条件才建议合并回 `master`：

- 最终全分支审查无开放 Critical/Important；
- 最终 HEAD 的 protected release gate 通过；
- Gate D 补齐，RC 为 `PASS`；
- 工作树干净；
- 用户明确选择本地合并。

不得 push。不得在 `CONDITIONAL PASS` 状态下自动合并。

## 7. 禁止事项

- 不安装 Node 24；
- 不修改 NVM 镜像或永久系统环境；
- 不删除 Node 22、分支、worktree 或 `C:\Users\001` 下文件；
- 不执行 `git push`；
- 不把 ignored 日志、截图、下载 PNG 或浏览器 profile 纳入 Git；
- 不把 fixture PASS 写成真实 B站 PASS；
- 不因 reviewer 额度失败重复实现已完成任务。
