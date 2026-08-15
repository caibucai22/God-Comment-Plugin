# B站评论与回复选择修复设计

日期：2026-08-15  
状态：用户已确认，进入实施

## 目标

- 顶层 `bili-comment-renderer` 可独立高亮、选择和生成卡片。
- 当前页面已渲染的任意数量 `bili-comment-reply-renderer` 可分别高亮、选择和生成自身卡片。
- 顶层评论、回复和下一条顶层评论之间连续移动时，高亮层不闪断、不重建、不重启动画。
- 滚动使新评论移动到静止光标下时，主动刷新高亮目标。
- 保持有限监听，不扫描或缓存全部评论。

## 真实 DOM 模型

```text
bili-comment-thread-renderer
└─ shadowRoot
   ├─ bili-comment-renderer#comment
   │  └─ shadowRoot > #body
   └─ #replies
      └─ bili-comment-replies-renderer
         └─ shadowRoot
            └─ #expander > #expander-contents
               ├─ bili-comment-reply-renderer
               ├─ bili-comment-reply-renderer
               └─ ...0..N
```

可选宿主仅包括顶层 `bili-comment-renderer`、回复 `bili-comment-reply-renderer` 及保留的旧版兼容选择器。thread、replies renderer、expander 与其他容器不可选。

## 修复前后

| 关注点 | 修复前 | 修复后 |
| --- | --- | --- |
| 新版回复 | 未匹配 `bili-comment-reply-renderer` | 当前已渲染的每条回复均是独立目标 |
| 悬停来源 | 依赖 document `pointerover` | pointer 坐标 + 开放 Shadow DOM 深层命中 |
| Shadow DOM 切换 | 可能被重定向为同一外层 host | 从坐标命中的最深元素解析最近评论宿主 |
| 滚动 | 只移动旧高亮框 | 用最后光标坐标重新解析当前目标 |
| 高亮切换 | 曾删除并重建高亮层 | 复用同一层，仅更新锚点与几何 |
| 锚点 | 递归查找任意后代第一个 `#body` | 当前评论 host 自身 `shadowRoot #body` |
| 回复提取 | 无法解析或可能错误回退 | 只从当前回复 host 内提取正文、昵称和时间 |
| 自动化 | 错用普通 renderer 模拟回复 | 使用真实 sibling 结构与 reply renderer |

## 解析架构

平台适配器返回统一目标：

```ts
interface ResolvedCommentTarget {
  host: Element;
  anchor: Element;
  kind: "top-level" | "reply" | "legacy";
}
```

- `host` 用于选择与内容提取。
- `anchor` 是当前 host 自己的可见 `#body`。
- `kind` 仅用于诊断和测试。
- B站组件名称只存在于 `BilibiliAdapter`。

事件路径从最内层向外解析，最近的回复优先；回复解析失败时不得回退到同一 thread 的顶层兄弟评论。

## 深层坐标命中

`deepElementFromPoint(document, x, y)` 从 `document.elementFromPoint` 开始。如果命中元素存在 open ShadowRoot，则继续调用该 ShadowRoot 的 `elementFromPoint`，直到没有更深结果、结果重复或达到 16 层安全上限。它只沿一个坐标路径深入，不枚举页面节点。

`pointermove` 保存最后的 `clientX/clientY`，并通过单个 `requestAnimationFrame` 合并同帧事件。滚动和 resize 复用该坐标重新命中；没有有效坐标时只重新定位当前锚点。

## 高亮状态机与动画

每帧协调结果只有三种：

- 同一目标：保持现有节点与动画时间线。
- 新目标：复用现有高亮层，更新 anchor 与几何。
- 无目标：清除高亮。

近距离目标中心距离不超过 240px 时，位置与尺寸使用约 140ms `ease-out`；超过阈值时直接定位，避免跨屏飞行。`prefers-reduced-motion: reduce` 下关闭流光、水雾和位置过渡，但选择功能保持可用。

## 点击与提取

点击优先通过 `composedPath()` 解析；必要时使用点击坐标深层命中。回复正文、昵称、发布时间只能从该回复 host 内部读取。正文缺失时保持选择模式并拒绝生成；昵称或时间缺失允许生成。顶层评论提取不得包含回复正文。

## 有限监听

选择模式仅允许 document 捕获级 pointer/click/contextmenu/keydown/scroll、window resize、单个 RAF 调度器和既有的评论根节点有限观察。禁止逐评论监听、全量 ShadowRoot 注册、定时轮询、评论列表扫描、矩形缓存以及 subtree MutationObserver。

## 范围外

- 自动点击“点击查看”。
- 折叠回复的主动展开。
- 回复分页与翻页。
- 未渲染回复。
- 回复合集卡片、上下文、点赞数与层级标识。
- B站以外平台。

用户手动展开后若产生相同 open Shadow DOM reply renderer，可能自然兼容，但不作为本次验收保证。

## 测试与验收

脱敏 fixture 必须忠实包含 thread、顶层 renderer、replies renderer 和至少两个 reply renderer；两条回复仅是最小切换样本，不是数量限制。

自动化必须证明：顶层和每条回复分别解析；回复不回退父评论；自身字段正确提取；顶层→回复1→回复2连续切换时高亮节点不变；同一回复内部移动不重启动画；滚动后静止光标下的新目标被识别；动态插入的相同 renderer 无需重新绑定；五种退出、reduced motion、PNG生成链路不回归。

真实页面最终按“顶层→默认回复→另一默认回复→下一条顶层→滚动换目标→选择回复生成”复测。只有动画连续、回复卡片内容正确、非评论区域正常清理且控制台无扩展异常，才能标记完成。
