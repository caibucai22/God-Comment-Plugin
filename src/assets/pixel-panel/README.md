# Pixel Panel Assets

本目录存放「流光卡片核」像素风制作面板的生成素材。本批素材以参考图
`C:\Users\001\Pictures\caima\comment-card\像素风.png` 为视觉基准，使用内置 GPT Image
生成，并通过绿色色键转为透明 PNG。

## 目录

- `generated/`：可直接接入 UI 的透明 PNG。
- `source-chroma/`：GPT Image 原始绿色背景图，用于后续重新抠图或调整。

## 素材清单

| 文件 | 用途 |
| --- | --- |
| `mascot-master.png` | 卡片核默认形象与身份锚点 |
| `state-generating.png` | 生成中插画：闭眼卡片核与闪光 |
| `state-failed.png` | 失败插画：X 眼卡片核与警告牌 |
| `state-saved.png` | 保存成功插画：卡片核、确认徽章与闪光 |
| `companion-dog.png` | 生成态小狗 |
| `companion-cat.png` | 失败态小猫 |
| `bottom-editing.png` | 编辑态底部：樱花树、草地、卡片核 |
| `bottom-generating.png` | 生成态底部：樱花、花丛、草地、小狗 |
| `bottom-failed.png` | 失败态底部：樱花、花丛、草地、小猫 |
| `bottom-generated.png` | 生成成功态底部：樱花树、草地、爱心卡片核 |
| `bottom-saved.png` | 保存成功态底部：樱花、草地、饮料卡片核 |

## 视觉约束

- 统一白灰 CRT 机身、粉色耳机、短 V 形天线和深棕黑像素描边。
- 底部装饰统一采用左侧樱花、低矮横向地景、右侧状态角色和中央内容留白。
- 保持透明背景；角色及装饰素材可使用 `image-rendering: pixelated`，生成后的卡片预览图不可使用该规则。
- 优先整数倍或接近整数倍缩放，避免像素边缘模糊。
- 本批素材只建立视觉资产，不包含 UI 接线与状态机修改。

## 已知差异

- GPT Image 生成的逐像素细节不可能与参考图原始美术完全同源；当前重点对齐角色轮廓、配色、状态语义与底部构图。
- `state-saved.png` 的确认徽章比参考图更偏灰绿，接入阶段可通过局部色彩校正进一步贴近参考图。
- 底部条已保留较宽透明内容区，最终位置与裁切应在 Panel 固定尺寸中通过 CSS 做像素级校准。
