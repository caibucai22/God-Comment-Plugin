# MVP RC 二阶段设计交接（2026-08-15）

## 当前状态

- 仓库：`E:\03-Projects\AiProjects\CommentCardGen-Codex`
- 分支：`master`
- 环境：Windows Native，PowerShell 7.6.4
- MVP 已完成实现、自动化验证和本轮评论目标动画人工验收。
- 下一阶段已完成 Spec 设计落盘，暂未开始实施。
- 禁止操作：不要 `git push`。

## 本轮已确认范围

- 保留 `3:4`，将 `9:16` 替换为横版 `16:9`。
- 趣味属性独立开关且默认关闭。
- 评论正文在卡片安全区纵向居中。
- 使用本地 `bilibili` 英文字标。
- 视频标题与字标同一行，单行省略。
- 制作面板改为可拖动非模态悬浮面板。
- 支持当前卡片正文修改和恢复原文。
- 增加制作动画以及默认关闭的简单声效。
- 制作完成先展示轻微旋转预览，用户确认后才下载。
- 只搭建 `background`、`border`、`decoration`、`effect` 样式资源目录结构。

## taste-skill 布局结论

- Design Read：轻量、可信、带少量收藏卡片质感的浏览器内制作工具。
- 参数：`DESIGN_VARIANCE 5 / MOTION_INTENSITY 5 / VISUAL_DENSITY 6`。
- 技术方向：沿用原生 CSS 和 Shadow DOM，不新增 UI 或动画依赖。
- 面板方向：克制暗色编辑台，单一电蓝强调色，不默认游戏化包装。
- 默认宽度 `360px`，标题栏和底部动作区固定，仅中部内容滚动。
- editing、generating、preview、error 在同一面板外壳内原位替换。
- 主要动作在每个状态中保持唯一，不以多个发光卡片竞争注意力。
- 动效只表达状态迁移、拖动反馈和制作等待，并完整支持 reduced-motion。

## 文档入口

- 二阶段功能和制作面板设计：`docs/superpowers/specs/2026-08-15-mvp-rc-two-stage-optimization-design.md`
- MVP 人工与自动化验收：`docs/status/2026-08-15-mvp-acceptance-handoff.md`
- 原 MVP 产品设计：`docs/superpowers/specs/2026-08-12-comment-card-extension-design.md`

## 后续实施建议

1. 先依据新 Spec 编写分任务实施计划，不直接一次性重写面板。
2. 按领域模型与偏好迁移、渲染布局、制作面板、artifact 预览下载、样式目录、RC 排查的顺序推进。
3. 每项功能先新增失败回归，再做最小实现。
4. 自动化通过后加载生产 `dist`，在真实 B站复核拖动、编辑、制作动画、预览和确认保存。
5. 不扩展折叠回复、回复分页、其他平台、模板市场或用户上传。

## 本轮边界

- 只新增和修改设计、状态交接文档。
- 未修改 `src/`、测试、依赖、Manifest 或构建配置。
- 未执行产品测试，因为没有运行时代码变化。
