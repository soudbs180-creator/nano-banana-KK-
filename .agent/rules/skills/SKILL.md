---
name: kk-studio-design-system
description: KK Studio 完整设计系统 - 暗色主题、动效规范、代码标准
version: 2.0.0
---

# KK Studio 设计系统 v2.0

本文档定义 KK Studio 的完整设计规范，所有 AI 代码助手在修改 UI 时必须严格遵循。

---

## 🎨 颜色系统 (Color System)

### 暗色模式 (Dark Mode) - 主要

```css
/* ===== 背景层级 ===== */
--bg-base: #000000;           /* 纯黑 - 画布背景 */
--bg-elevated: #0a0a0a;       /* 一级抬升 - 页面背景 */
--bg-surface: #141414;        /* 卡片表面 */
--bg-overlay: #1a1a1a;        /* 模态框/下拉/悬浮层 */
--bg-input: #1f1f1f;          /* 输入框背景 */
--bg-hover: #242424;          /* 悬停背景 */

/* ===== 边框 ===== */
--border-subtle: rgba(255, 255, 255, 0.06);   /* 微妙边框 */
--border-default: rgba(255, 255, 255, 0.1);   /* 默认边框 */
--border-strong: rgba(255, 255, 255, 0.2);    /* 强调边框 */
--border-focus: rgba(59, 130, 246, 0.5);      /* 聚焦边框 - 蓝色 */

/* ===== 文字 ===== */
--text-primary: #ffffff;                       /* 主文字 - 纯白 */
--text-secondary: rgba(255, 255, 255, 0.7);   /* 次要文字 */
--text-tertiary: rgba(255, 255, 255, 0.5);    /* 第三级文字 */
--text-muted: rgba(255, 255, 255, 0.35);      /* 弱化文字 */
--text-disabled: rgba(255, 255, 255, 0.2);    /* 禁用文字 */

/* ===== 强调色 ===== */
--accent-blue: #3b82f6;       /* 主强调 - 选中/链接/主按钮 */
--accent-green: #22c55e;      /* 成功/可用/确认 */
--accent-red: #ef4444;        /* 危险/删除/退出/错误 */
--accent-gold: #f59e0b;       /* 高级/VIP/付费/警告 */
--accent-purple: #a855f7;     /* 特殊/创意 */
--accent-cyan: #06b6d4;       /* 信息/提示 */

/* ===== 选中高亮 - 淡蓝色扩散光 ===== */
--glow-blue: 0 0 20px rgba(59, 130, 246, 0.4);
--glow-blue-strong: 0 0 30px rgba(59, 130, 246, 0.6);
--glow-green: 0 0 20px rgba(34, 197, 94, 0.4);
--glow-gold: 0 0 20px rgba(245, 158, 11, 0.4);
--glow-red: 0 0 20px rgba(239, 68, 68, 0.4);

--selected-bg: rgba(59, 130, 246, 0.15);      /* 选中背景 */
--selected-border: rgba(59, 130, 246, 0.5);   /* 选中边框 */
```

### 亮色模式 (Light Mode) - 自动反推

```css
/* ===== 背景层级 ===== */
--bg-base: #f5f5f5;           /* 浅灰画布 */
--bg-elevated: #fafafa;       /* 一级抬升 */
--bg-surface: #ffffff;        /* 卡片表面 - 纯白 */
--bg-overlay: #ffffff;        /* 模态框/下拉 */
--bg-input: #f0f0f0;          /* 输入框背景 */
--bg-hover: #e5e5e5;          /* 悬停背景 */

/* ===== 边框 ===== */
--border-subtle: rgba(0, 0, 0, 0.04);
--border-default: rgba(0, 0, 0, 0.08);
--border-strong: rgba(0, 0, 0, 0.15);
--border-focus: rgba(59, 130, 246, 0.5);

/* ===== 文字 ===== */
--text-primary: #0a0a0a;                      /* 主文字 - 近黑 */
--text-secondary: rgba(0, 0, 0, 0.7);
--text-tertiary: rgba(0, 0, 0, 0.5);
--text-muted: rgba(0, 0, 0, 0.35);
--text-disabled: rgba(0, 0, 0, 0.2);

/* ===== 强调色 - 略微调暗确保对比度 ===== */
--accent-blue: #2563eb;
--accent-green: #16a34a;
--accent-red: #dc2626;
--accent-gold: #d97706;
```

---

## 📐 圆角规范 (Border Radius)

**统一圆角阶梯，禁止自定义值**

```css
--radius-none: 0;
--radius-sm: 4px;       /* 小元素：标签、徽章、小按钮 */
--radius-md: 8px;       /* 中等：按钮、输入框、下拉项 */
--radius-lg: 12px;      /* 大：卡片、模态框、下拉菜单 */
--radius-xl: 16px;      /* 超大：主容器、面板 */
--radius-2xl: 24px;     /* 特大：底部抽屉、Sheet */
--radius-full: 9999px;  /* 圆形：头像、FAB、圆形按钮 */
```

### 使用规则

| 元素类型 | 圆角值 | 示例 |
|---------|--------|------|
| 按钮 | `--radius-md` (8px) | Primary Button, Secondary Button |
| 输入框 | `--radius-md` (8px) | Text Input, Textarea |
| 卡片 | `--radius-lg` (12px) | ImageCard, PromptCard |
| 模态框 | `--radius-xl` (16px) | Modal, Dialog |
| 下拉菜单 | `--radius-lg` (12px) | Dropdown, Select Menu |
| 标签/徽章 | `--radius-sm` (4px) | Tag, Badge |
| 头像/FAB | `--radius-full` | Avatar, Floating Action Button |
| Tooltip | `--radius-md` (8px) | Tooltip, Popover |

---

## 🔤 字体规范 (Typography)

### 字体族

```css
--font-sans: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'SF Mono', 'Consolas', monospace;
```

### 字体大小 - 每类3档

```css
/* ===== 标题 (Heading) - 3档 ===== */
--text-h1: 28px;        /* 大标题：页面标题、Hero区 */
--text-h2: 22px;        /* 中标题：区块标题、Section */
--text-h3: 18px;        /* 小标题：卡片标题、列表头 */

/* ===== 正文 (Body) - 3档 ===== */
--text-body-lg: 16px;   /* 大正文：重要内容、强调段落 */
--text-body-md: 14px;   /* 中正文：默认内容（最常用） */
--text-body-sm: 13px;   /* 小正文：紧凑内容、列表项 */

/* ===== 标注 (Caption) - 3档 ===== */
--text-caption-lg: 12px;   /* 大标注：次要信息、时间戳 */
--text-caption-md: 11px;   /* 中标注：辅助文字、提示 */
--text-caption-sm: 10px;   /* 小标注：最小文字、版权 */
```

### Tailwind 映射

```
text-h1      → 28px (1.75rem)
text-h2      → 22px (1.375rem)
text-h3      → 18px (1.125rem)
text-body-lg → 16px (1rem)
text-body-md → 14px (0.875rem)
text-body-sm → 13px (0.8125rem)
text-xs      → 12px (0.75rem)
text-2xs     → 11px (0.6875rem)
text-3xs     → 10px (0.625rem)
```

### 字重

```css
--font-normal: 400;     /* 正文 */
--font-medium: 500;     /* 强调正文、按钮 */
--font-semibold: 600;   /* 标题、重要文字 */
--font-bold: 700;       /* 特别强调 */
```

### 行高

```css
--leading-tight: 1.25;    /* 标题 */
--leading-normal: 1.5;    /* 正文 */
--leading-relaxed: 1.75;  /* 长文阅读 */
```

---

## 🎯 图标规范 (Iconography)

### 图标尺寸

```css
--icon-xs: 14px;    /* 极小：内联图标、标签内 */
--icon-sm: 16px;    /* 小：按钮内图标 */
--icon-md: 20px;    /* 中：默认图标（最常用） */
--icon-lg: 24px;    /* 大：侧边栏图标、主导航 */
--icon-xl: 32px;    /* 超大：空状态图标、大按钮 */
--icon-2xl: 48px;   /* 特大：Hero图标、引导页 */
```

### 线条粗细

```css
--icon-stroke: 1.5;      /* 默认线条（20px及以上图标） */
--icon-stroke-thin: 1;   /* 细线（装饰性图标） */
--icon-stroke-bold: 2;   /* 粗线（小图标16px及以下） */
```

### 规则

> **同一区域的图标必须使用相同的 strokeWidth**

- 侧边栏所有图标: `strokeWidth: 1.5`, `size: 20`
- 顶部工具栏: `strokeWidth: 1.5`, `size: 18`
- 按钮内图标: `strokeWidth: 2`, `size: 16`
- 推荐图标库: **Lucide React**

---

## 📏 间距规范 (Spacing)

### 间距阶梯

```css
--space-0: 0;
--space-0.5: 2px;
--space-1: 4px;
--space-1.5: 6px;
--space-2: 8px;
--space-2.5: 10px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
--space-20: 80px;
```

### 组件内间距

| 组件 | 内边距 (padding) |
|------|-----------------|
| 小按钮 | `8px 12px` |
| 默认按钮 | `10px 16px` |
| 大按钮 | `12px 24px` |
| 输入框 | `10px 14px` |
| 卡片 | `16px` 或 `20px` |
| 模态框 | `24px` |
| 下拉菜单项 | `10px 12px` |
| 侧边栏项 | `10px 12px` |

### 对齐规则

1. **优先居中对齐** - 模态框内容、空状态、主要CTA按钮、Toast
2. **其次左对齐** - 列表、表单、文字段落、侧边栏
3. **右对齐** - 数字、金额、时间、操作按钮组

---

## 🌑 阴影规范 (Shadows)

### 暗色模式阴影

```css
--shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.3);
--shadow-md: 0 8px 24px rgba(0, 0, 0, 0.4);
--shadow-lg: 0 16px 48px rgba(0, 0, 0, 0.5);
--shadow-xl: 0 24px 64px rgba(0, 0, 0, 0.6);
```

### 亮色模式阴影

```css
--shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.08);
--shadow-md: 0 8px 24px rgba(0, 0, 0, 0.12);
--shadow-lg: 0 16px 48px rgba(0, 0, 0, 0.16);
--shadow-xl: 0 24px 64px rgba(0, 0, 0, 0.2);
```

### 选中/聚焦光晕

```css
/* 蓝色光晕 - 选中状态 */
--shadow-glow-blue: 0 0 20px rgba(59, 130, 246, 0.4);
--shadow-glow-blue-strong: 0 0 30px rgba(59, 130, 246, 0.6);

/* 绿色光晕 - 成功状态 */
--shadow-glow-green: 0 0 20px rgba(34, 197, 94, 0.4);

/* 金色光晕 - VIP/高级 */
--shadow-glow-gold: 0 0 20px rgba(245, 158, 11, 0.4);

/* 红色光晕 - 错误/警告 */
--shadow-glow-red: 0 0 20px rgba(239, 68, 68, 0.4);
```

---

## ✨ 动效规范 (Animation)

**所有交互必须有动效，重要的明显，次要的轻微**

### 缓动函数

```css
--ease-default: cubic-bezier(0.4, 0, 0.2, 1);     /* 标准 */
--ease-in: cubic-bezier(0.4, 0, 1, 1);            /* 加速（退出） */
--ease-out: cubic-bezier(0, 0, 0.2, 1);           /* 减速（进入） */
--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1); /* 弹性 */
--ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275); /* 弹簧 */
```

### 时长规范

```css
--duration-instant: 50ms;   /* 即时反馈 - 点击态 */
--duration-fast: 150ms;     /* 快速过渡 - 悬停 */
--duration-normal: 250ms;   /* 标准过渡 - 大多数动画 */
--duration-slow: 400ms;     /* 慢速过渡 - 复杂动画 */
--duration-slower: 600ms;   /* 更慢过渡 - 强调动画 */
```

### 交互动效规范表

| 交互类型 | 动效描述 | 时长 | 重要程度 |
|---------|---------|------|---------|
| **Hover 悬停** | 背景变亮 `bg-hover`，轻微上移 `translateY(-2px)` | 150ms | ⚪ 轻度 |
| **Click 点击** | 缩放至 `scale(0.97)`，颜色加深 | 100ms | 🔵 明显 |
| **Focus 聚焦** | 蓝色边框 + 淡蓝光晕 `--shadow-glow-blue` | 200ms | 🔵 明显 |
| **Selected 选中** | 淡蓝背景 + 蓝边框 + 持续光晕脉冲 | 250ms | 🔵 明显 |
| **Loading 加载** | 骨架屏闪烁 `pulse` 或旋转图标 | 持续 | 🔵 明显 |
| **Generating 生成** | 渐变流光 `shimmer` + 边框脉冲 | 持续 | 🔴 重要 |
| **Number 数字变化** | 数字滚动 `countUp` | 400ms | 🔵 明显 |
| **Card Drag 拖动** | 微抬起 `translateY(-4px)` + 阴影加深 | 200ms | 🔵 明显 |
| **Modal Open 弹窗开** | 淡入 + 缩放 `0.95→1` | 250ms | 🔵 明显 |
| **Modal Close 弹窗关** | 淡出 + 缩放 `1→0.95` | 200ms | 🔵 明显 |
| **Slide Down 滑入** | 从上方滑入 `translateY(-10px)→0` | 300ms | 🔵 明显 |
| **Toast 通知** | 从右侧滑入 + 淡入 | 300ms | 🔵 明显 |
| **Collapse 折叠** | 高度收缩 + 淡出 | 250ms | ⚪ 轻度 |
| **Tab Switch 切换** | 淡入淡出 + 轻微位移 | 200ms | ⚪ 轻度 |

### 关键帧定义

```css
/* 淡入 */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 淡出 */
@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

/* 缩放入场 */
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

/* 缩放退场 */
@keyframes scaleOut {
  from { opacity: 1; transform: scale(1); }
  to { opacity: 0; transform: scale(0.95); }
}

/* 弹窗入场 */
@keyframes modalIn {
  from { opacity: 0; transform: scale(0.95) translateY(-10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

/* 弹窗退场 */
@keyframes modalOut {
  from { opacity: 1; transform: scale(1) translateY(0); }
  to { opacity: 0; transform: scale(0.95) translateY(-10px); }
}

/* 从上滑入 */
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 向上滑出 */
@keyframes slideUp {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-10px); }
}

/* 从右滑入 (Toast) */
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(100%); }
  to { opacity: 1; transform: translateX(0); }
}

/* 加载脉冲 */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* 生成中流光 */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* 数字滚动 */
@keyframes countUp {
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* 选中光晕脉冲 */
@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.4); }
  50% { box-shadow: 0 0 30px rgba(59, 130, 246, 0.6); }
}

/* 卡片抬起 */
@keyframes cardLift {
  from { transform: translateY(0); box-shadow: var(--shadow-md); }
  to { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
}

/* 旋转加载 */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 边框流光 (生成中) */
@keyframes borderGlow {
  0%, 100% { 
    border-color: rgba(59, 130, 246, 0.3);
    box-shadow: 0 0 15px rgba(59, 130, 246, 0.2);
  }
  50% { 
    border-color: rgba(59, 130, 246, 0.6);
    box-shadow: 0 0 25px rgba(59, 130, 246, 0.4);
  }
}
```

### Tailwind 动画类

```javascript
// tailwind.config.js
animation: {
  'fade-in': 'fadeIn 250ms ease-out',
  'fade-out': 'fadeOut 200ms ease-in',
  'scale-in': 'scaleIn 250ms ease-out',
  'scale-out': 'scaleOut 200ms ease-in',
  'modal-in': 'modalIn 250ms ease-out',
  'modal-out': 'modalOut 200ms ease-in',
  'slide-down': 'slideDown 300ms ease-out',
  'slide-up': 'slideUp 250ms ease-in',
  'slide-in-right': 'slideInRight 300ms ease-out',
  'pulse': 'pulse 2s ease-in-out infinite',
  'shimmer': 'shimmer 2s linear infinite',
  'glow-pulse': 'glowPulse 2s ease-in-out infinite',
  'spin': 'spin 1s linear infinite',
  'border-glow': 'borderGlow 2s ease-in-out infinite',
}
```

---

## 🏷️ 标签颜色系统 (Tag Colors)

标签使用固定的8种颜色，相同名称的标签颜色一致

```tsx
const TAG_COLORS = [
  { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },   // 红
  { bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316', border: 'rgba(249, 115, 22, 0.3)' }, // 橙
  { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308', border: 'rgba(234, 179, 8, 0.3)' },   // 黄
  { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', border: 'rgba(34, 197, 94, 0.3)' },   // 绿
  { bg: 'rgba(6, 182, 212, 0.15)', text: '#06b6d4', border: 'rgba(6, 182, 212, 0.3)' },   // 青
  { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' }, // 蓝
  { bg: 'rgba(139, 92, 246, 0.15)', text: '#8b5cf6', border: 'rgba(139, 92, 246, 0.3)' }, // 紫
  { bg: 'rgba(236, 72, 153, 0.15)', text: '#ec4899', border: 'rgba(236, 72, 153, 0.3)' }, // 粉
];

/**
 * 根据标签名生成稳定颜色
 * 相同名称永远返回相同颜色
 */
function getTagColor(tagName: string): TagColor {
  const hash = tagName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return TAG_COLORS[hash % TAG_COLORS.length];
}
```

---

## 📱 移动端响应式设计 (Mobile Responsive Design)

**基于 iOS HIG 和 Material Design 3 标准**

### 1. 响应式断点 (Breakpoints)

采用 **Window Size Classes** 而非固定设备尺寸

```css
/* 断点定义 */
--breakpoint-xs: 0px;         /* Extra Small: < 480px (小屏手机) */
--breakpoint-sm: 480px;       /* Small: 480px - 767px (手机横屏) */
--breakpoint-md: 768px;       /* Medium: 768px - 1023px (平板竖屏) */
--breakpoint-lg: 1024px;      /* Large: 1024px - 1439px (平板横屏/小桌面) */
--breakpoint-xl: 1440px;      /* Extra Large: ≥ 1440px (桌面) */
```

| Window Size Class | 屏幕宽度 | 布局特征 | 典型设备 |
|------------------|---------|---------|---------|
| **Compact (紧凑)** | 0 - 599px | 4列网格，底部导航 | 手机竖屏 |
| **Medium (中等)** | 600 - 839px | 8列网格，侧边导航 | 大屏手机、平板竖屏 |
| **Regular (常规)** | 840 - 1023px | 12列网格，固定侧边栏 | 平板横屏 |
| **Expanded (扩展)** | 1024px+ | 12列网格，完整 UI | 桌面 |

### 2. 触摸目标 (Touch Targets)

确保所有可交互元素足够大，避免误触

```css
/* iOS HIG 标准: 最小 44x44pt */
--touch-target-min: 44px;      /* 最小触摸区域 */
--touch-target-comfortable: 48px; /* 舒适触摸区域 (Material Design 3) */
--touch-target-spacious: 56px;   /* 宽松触摸区域 */
```

#### 触摸目标规则

| 元素类型 | 最小尺寸 | 推荐尺寸 | 应用场景 |
|---------|---------|---------|---------|
| 按钮 | 44x44px | 48x48px | 所有可点击按钮 |
| 图标按钮 | 44x44px | 48x48px | 工具栏图标、操作图标 |
| 列表项 | 高度 ≥ 44px | 高度 ≥ 56px | 可点击列表项 |
| 复选框/单选框 | 24x24px 可见 + 20px padding | 44x44px 总面积 | 表单控件 |
| 滑块 Thumb | 28x28px | 32x32px | 滑块把手 |
| Tab 标签 | 高度 ≥ 48px | 高度 ≥ 56px | 底部导航、Tab Bar |

**重要**: 触摸目标之间至少保持 **8px** 间距，避免误触

### 3. 移动端间距系统 (Mobile Spacing)

#### 页面边距 (Margins)

```css
/* 移动端页面边距 */
--mobile-margin-xs: 12px;   /* 极窄屏 (< 375px) */
--mobile-margin-sm: 16px;   /* 标准手机 (375px - 599px) */
--mobile-margin-md: 20px;   /* 大屏手机 (600px - 767px) */
--mobile-margin-lg: 24px;   /* 平板 (768px+) */
```

| 设备尺寸 | 左右边距 | 顶部边距 | 底部边距 |
|---------|---------|---------|---------|
| iPhone SE (375px) | 16px | 16px | 16px |
| iPhone 14 Pro (393px) | 16px | 20px | 20px |
| iPhone 14 Pro Max (430px) | 20px | 20px | 20px |
| iPad (768px+) | 24px | 24px | 24px |

#### 组件间距 (Component Spacing)

```css
/* 移动端组件间距 */
--mobile-gap-tight: 8px;     /* 紧凑间距：表单字段 */
--mobile-gap-normal: 12px;   /* 标准间距：卡片内元素 */
--mobile-gap-relaxed: 16px;  /* 宽松间距：列表项、卡片之间 */
--mobile-gap-loose: 24px;    /* 松散间距：区块之间 */
```

### 4. 安全区域 (Safe Area)

确保内容不被系统 UI 遮挡

```css
/* iOS Safe Area - 使用 env() 环境变量 */
.mobile-container {
  padding-top: max(16px, env(safe-area-inset-top));
  padding-right: max(16px, env(safe-area-inset-right));
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  padding-left: max(16px, env(safe-area-inset-left));
}
```

**关键区域**:
- **顶部**: 避开刘海/Dynamic Island (iPhone 14 Pro: ~59px)
- **底部**: 避开 Home Indicator (iPhone: ~34px)
- **侧边**: 避开圆角和边缘手势区

### 5. 移动端字体调整 (Mobile Typography)

移动端字体需略微放大以提高可读性

```css
/* 桌面端基准 */
--text-body-md-desktop: 14px;
--text-body-lg-desktop: 16px;

/* 移动端放大 */
--text-body-md-mobile: 15px;    /* +1px */
--text-body-lg-mobile: 17px;    /* +1px */
--text-h3-mobile: 20px;          /* 18px → 20px */
```

#### Responsive Typography 映射

```css
@media (max-width: 767px) {
  /* 移动端字体调整 */
  :root {
    --text-h1: 24px;        /* 桌面 28px → 移动 24px */
    --text-h2: 20px;        /* 桌面 22px → 移动 20px */
    --text-h3: 18px;        /* 保持 18px */
    --text-body-lg: 17px;   /* 桌面 16px → 移动 17px */
    --text-body-md: 15px;   /* 桌面 14px → 移动 15px */
    --text-caption-lg: 13px; /* 桌面 12px → 移动 13px */
  }
}
```

### 6. 移动端圆角调整

移动端倾向使用更大的圆角以增强现代感

```css
@media (max-width: 767px) {
  :root {
    --radius-md: 10px;     /* 桌面 8px → 移动 10px */
    --radius-lg: 14px;     /* 桌面 12px → 移动 14px */
    --radius-xl: 20px;     /* 桌面 16px → 移动 20px */
    --radius-2xl: 28px;    /* 桌面 24px → 移动 28px (Material Design 3 FAB) */
  }
}
```

### 7. 移动端按钮规范

```css
/* 移动端按钮尺寸 */
.button-mobile-sm {
  min-height: 36px;
  padding: 8px 16px;
  font-size: 14px;
}

.button-mobile-md {
  min-height: 44px;       /* 满足 iOS 触摸目标 */
  padding: 12px 20px;
  font-size: 15px;
}

.button-mobile-lg {
  min-height: 52px;
  padding: 14px 24px;
  font-size: 17px;
}

/* 全宽按钮 (移动端常见) */
.button-mobile-full {
  width: 100%;
  min-height: 48px;
}
```

### 8. 移动端导航模式

#### Bottom Navigation (底部导航) - 推荐

```css
.mobile-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 56px;          /* Material Design 3 标准 */
  padding-bottom: env(safe-area-inset-bottom); /* iOS Safe Area */
  background: var(--bg-surface);
  border-top: 1px solid var(--border-default);
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: space-around;
}

.mobile-bottom-nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 64px;       /* 保证触摸目标 */
  min-height: 56px;
  gap: 4px;
}
```

#### Hamburger Menu (汉堡菜单)

```css
.mobile-hamburger {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 侧边抽屉 */
.mobile-drawer {
  position: fixed;
  top: 0;
  left: -280px;          /* 隐藏在左侧 */
  width: 280px;
  height: 100%;
  background: var(--bg-surface);
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.2);
  transition: transform var(--duration-normal) var(--ease-default);
  z-index: 1000;
}

.mobile-drawer.open {
  transform: translateX(280px);
}
```

### 9. 移动端卡片设计

```css
.card-mobile {
  border-radius: var(--radius-lg);
  padding: 16px;
  margin: 12px 16px;      /* 左右边距 16px */
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
}

/* 全宽卡片 (无左右边距) */
.card-mobile-full {
  border-radius: 0;       /* 边缘无圆角 */
  padding: 16px;
  margin: 0;
  border-bottom: 1px solid var(--border-default);
}
```

### 10. 移动端表单规范

```css
/* 输入框 */
.input-mobile {
  min-height: 48px;       /* 满足触摸目标 */
  padding: 12px 16px;
  font-size: 16px;        /* ≥16px 防止 iOS 自动缩放 */
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
}

/* 文本域 */
.textarea-mobile {
  min-height: 120px;
  padding: 12px 16px;
  font-size: 16px;
  line-height: 1.5;
}

/* 选择框 */
.select-mobile {
  min-height: 48px;
  padding: 12px 16px;
  font-size: 16px;
  appearance: none;       /* 移除浏览器默认样式 */
}
```

### 11. 移动端模态框 (Modal/Sheet)

```css
/* 底部弹出 Sheet (移动端推荐) */
.mobile-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 90vh;
  background: var(--bg-surface);
  border-radius: var(--radius-2xl) var(--radius-2xl) 0 0;
  padding: 24px 16px;
  padding-bottom: max(24px, env(safe-area-inset-bottom));
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.2);
  transform: translateY(100%);
  transition: transform var(--duration-normal) var(--ease-default);
}

.mobile-sheet.open {
  transform: translateY(0);
}

/* Sheet 顶部拖拽把手 */
.mobile-sheet-handle {
  width: 40px;
  height: 4px;
  background: var(--text-muted);
  border-radius: var(--radius-full);
  margin: 0 auto 16px;
}
```

### 12. 移动端网格系统

```css
/* 4列网格 (手机) */
@media (max-width: 599px) {
  .grid-mobile {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    padding: 16px;
  }
}

/* 8列网格 (大屏手机/平板竖屏) */
@media (min-width: 600px) and (max-width: 839px) {
  .grid-mobile {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 16px;
    padding: 20px;
  }
}

/* 12列网格 (平板横屏/桌面) */
@media (min-width: 840px) {
  .grid-mobile {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 24px;
    padding: 24px;
  }
}
```

### 13. 移动端性能优化

#### 减少动画开销

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

#### 移动端禁用 Hover 效果

```css
/* 仅桌面端显示 Hover 效果 */
@media (hover: hover) and (pointer: fine) {
  .button:hover {
    background: var(--bg-hover);
    transform: translateY(-2px);
  }
}
```

### 14. 移动端特定 UI 模式

#### Loading Skeleton (骨架屏)

```css
.skeleton-mobile {
  background: linear-gradient(
    90deg,
    var(--bg-surface) 0%,
    var(--bg-hover) 50%,
    var(--bg-surface) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius-md);
}
```

#### Pull-to-Refresh (下拉刷新)

```typescript
// 使用原生滚动容器，避免冲突
<div style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
  {/* 内容 */}
</div>
```

### 15. 响应式媒体查询示例

```css
/* Extra Small (小屏手机) */
@media (max-width: 479px) {
  :root {
    --mobile-margin: 12px;
  }
}

/* Small (手机) */
@media (min-width: 480px) and (max-width: 767px) {
  :root {
    --mobile-margin: 16px;
  }
}

/* Medium (平板竖屏) */
@media (min-width: 768px) and (max-width: 1023px) {
  :root {
    --mobile-margin: 20px;
  }
  /* 显示侧边栏 */
  .sidebar {
    display: block;
  }
}

/* Large+ (桌面) */
@media (min-width: 1024px) {
  :root {
    --mobile-margin: 24px;
  }
  /* 完整桌面布局 */
  .mobile-bottom-nav {
    display: none;
  }
}
```

### 16. 移动端代码审查清单

开始移动端开发前确保：

- [ ] 所有触摸目标 ≥ 44x44px
- [ ] 输入框字体 ≥ 16px (防止 iOS 自动缩放)
- [ ] 使用 Safe Area insets 避开系统 UI
- [ ] 底部导航高度至少 56px + safe-area-inset-bottom
- [ ] 使用响应式断点而非固定设备尺寸
- [ ] 使用 `@media (hover: hover)` 区分桌面/移动
- [ ] 模态框在移动端使用底部 Sheet
- [ ] 左右页边距至少 16px
- [ ] 测试横竖屏切换
- [ ] 测试小屏设备 (iPhone SE: 375px)

---

## 💻 代码规范 (Code Standards)

### 1. 中文优先

```typescript
/**
 * 计算画布自适应缩放比例
 * 根据当前窗口大小和节点边界，自动计算最佳 Scale 值
 * @param bounds 所有节点的边界矩形
 * @returns 推荐的缩放级别
 */
export function calculateFitZoom(bounds: BoundingBox): number {
  // 获取画布可视区域尺寸（减去侧边栏宽度）
  const canvasWidth = window.innerWidth - 280;
  // ...
}
```

### 2. TypeScript 规范

- **禁止 `any`** - 使用具体类型或 `unknown`
- **显式返回类型** - 函数必须声明返回类型
- **接口优于类型别名** - 优先使用 `interface`

### 3. React 组件规范

- **仅函数组件** - 禁止 Class Component
- **Custom Hooks 封装** - 复杂逻辑提取到 Hook
- **useMemo/useCallback** - 优化传递给子组件的值和函数

### 4. 文件长度

- **限制 500 行** - 单个组件/Service
- **最大 800 行** - 超过必须重构拆分

---

## 🛡️ 错误处理规范

### 防御性编程

```typescript
// ✅ 使用 Optional Chaining + Nullish Coalescing
const userName = user?.profile?.name ?? '匿名用户';
const itemCount = data?.items?.length ?? 0;
```

### 用户提示

```typescript
try {
  await apiCall();
  notify('success', '操作成功');
} catch (error) {
  const message = error instanceof Error ? error.message : '未知错误';
  notify('error', `操作失败: ${message}`);
}
```

---

## 📁 目录结构

```
src/
├── components/           # UI 组件
│   ├── common/          # 通用原子组件
│   └── ...
├── context/             # 全局状态 Context
├── hooks/               # 自定义 Hooks
├── services/            # 业务逻辑层
├── types/               # TypeScript 类型
├── utils/               # 纯函数工具
├── index.css            # 全局样式 + Design Tokens
└── App.tsx              # 应用入口
```

---

## 📝 Git Commit 规范

```
feat: 新增 API 管理面板
fix: 修复图片下载失败的问题
style: 优化移动端底部导航样式
refactor: 重构 CanvasContext 自动整理逻辑
perf: 优化大量节点时的渲染性能
docs: 更新 README 项目结构说明
chore: 更新依赖版本
```

---

## 🚫 禁止事项

1. ❌ 硬编码颜色 `color: #ff0000` → ✅ `var(--accent-red)`
2. ❌ 魔法数字 `width: 300` → ✅ `var(--space-X)` 或语义变量
3. ❌ 直接操作 DOM → ✅ 使用 React ref
4. ❌ 没有动效的交互 → ✅ 添加过渡动画
5. ❌ 不统一的圆角 → ✅ 使用 `--radius-X`
6. ❌ 不统一的字号 → ✅ 使用字体层级变量

---

## ✅ 代码审查清单

开始编码前确保：

- [ ] 所有注释使用简体中文
- [ ] 使用 CSS Variables，不硬编码颜色
- [ ] 使用统一的圆角规范
- [ ] 使用字体层级，不随意设置字号
- [ ] 同组图标统一 strokeWidth
- [ ] 选中状态有淡蓝色光晕
- [ ] 所有交互有动效
- [ ] 优先居中对齐，其次左对齐
- [ ] 错误处理有用户友好提示
- [ ] 文件长度不超过 500 行

---

**KK Studio Design System v2.0**  
Last updated: 2026-01-30
