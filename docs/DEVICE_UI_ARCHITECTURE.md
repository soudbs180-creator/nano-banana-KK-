# 多设备 UI 分层规范

本文档用于规范 `KK-Studio` 的手机端与桌面端界面拆分方式，目标是：

- 手机端与桌面端布局文件分开，避免修改互相串联。
- 业务逻辑仍然共用，避免同一功能维护两套逻辑。
- 新功能上线时，同时支持两端，但允许采用不同的交互布局和视觉密度。

## 核心原则

### 1. 共享逻辑，分离布局

- 状态、请求、校验、数据转换、事件逻辑统一放在共享层。
- 手机端和桌面端只分离“界面布局”和“交互摆放方式”。
- 不允许把同一份复杂逻辑复制到 `mobile` 和 `desktop` 两份文件里。

### 2. 设备文件独立

推荐结构：

```text
src/components/feature-name/
  FeatureRoot.tsx              # 共享逻辑入口
  feature-name/
    FeatureMobile.tsx          # 手机端布局
    FeatureDesktop.tsx         # 桌面端布局
    FeatureRouter.tsx          # 根据 isMobile 选择布局
```

### 3. 新功能必须双端一起设计

- 新功能上线时，必须同时考虑手机端和桌面端。
- 但两端不要求完全同构：
  - 手机端优先单列、可折叠、可滚动、适合手指操作
  - 桌面端优先横向展开、信息密度更高、支持悬浮和快捷操作

## 当前已落地示例

`PromptBar` 已开始采用该结构：

- `src/components/layout/PromptBar.tsx`
  - 保留共享逻辑和状态管理
- `src/components/layout/prompt-bar/PromptBarTopRowMobile.tsx`
- `src/components/layout/prompt-bar/PromptBarTopRowDesktop.tsx`
- `src/components/layout/prompt-bar/PromptBarTopRow.tsx`
- `src/components/layout/prompt-bar/PromptBarFooterMobile.tsx`
- `src/components/layout/prompt-bar/PromptBarFooterDesktop.tsx`
- `src/components/layout/prompt-bar/PromptBarFooter.tsx`

这表示：

- 手机端顶部布局和桌面端顶部布局在不同文件维护
- 手机端底部布局和桌面端底部布局在不同文件维护
- `PromptBar.tsx` 只负责把共享功能接入到不同设备布局壳中

## 后续开发要求

### 适合优先拆分的组件

后续新增或重构时，优先按同样方式拆分这些混合设备组件：

- `PromptNodeComponent`
- `ImageCard`
- `SettingsPanel` 内部高密度面板
- 充值、搜索、资料页等弹层

### 手机端要求

- 默认单列或双行，不允许关键按钮被挤出屏幕
- 弹层宽度必须受 `100vw` 约束
- 文字允许截断或换行，但不允许撑爆容器
- 横向滚动区域必须启用触摸平滑滚动

### 桌面端要求

- 保持信息密度和效率
- 支持悬浮、下拉、快捷操作
- 不要因为手机端适配而牺牲桌面端的使用效率

## 改动建议

以后如果要新增一个复杂功能，推荐步骤：

1. 先写共享状态和事件逻辑
2. 再写 `Mobile` 布局文件
3. 再写 `Desktop` 布局文件
4. 最后通过 `Router` 统一接入

这样可以保证：

- 逻辑统一
- 布局独立
- 后续修改更专业、更稳定
