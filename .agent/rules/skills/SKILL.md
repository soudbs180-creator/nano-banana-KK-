---
trigger: glob
description: KK Studio 完整设计系统 - 暗色主题、动效规范、代码标准
---

# KK Studio 设计系统 v2.2

本文档定义 KK Studio 的完整设计规范，所有 AI 代码助手在修改 UI 时必须严格遵循。

---

## 🚨 当前项目基线（强制）

- **当前项目版本**：`1.3.6`
- **版本源文件**：`package.json` + `src/config/appInfo.ts`
- **文档基线文件**：`README.md`、`docs/development/session-handoff.md`、`docs/development/progress.md`
- **规则基线文件**：`.agent/README.md` + 本文件

### 修改时必须遵守
- 不要在多个组件里手写版本号；展示版本统一读取常量。
- 不要在文档里写死 `KK-Studio-1.0.0` 这类目录名；统一改用 `<project-root>`。
- 涉及版本、功能说明、项目结构、部署方式变化时，必须同步 README 与开发文档。
- 涉及存储、计费、Supabase、支付、接口代理时，必须检查前后端两侧是否一起更新。
- 不允许为追求“好看”而大幅改动既有 UI 动线；优先稳定、兼容、专业、可维护。
- 修改完成后，默认执行：`npm run typecheck`、`npm run check:encoding`、`npm run build`。

---

## 🛰️ 多渠道 API 调用规范（新增）

目标：输入地址+密钥后自动获取模型、探测能力，并在 UI 里只展示可用参数，避免互相串扰。

### 渠道拆分
- 谷歌官方（无需填写地址）
  - baseUrl 固定 `https://generativelanguage.googleapis.com`
  - 鉴权：`?key=<API_KEY>`（或 header `x-goog-api-key`）
  - 列表：`GET /v1beta/models`
  - 调用：`/{v1|v1beta}/models/{model}:generateContent`；Imagen/Veo 用 `:predict`
  - 仅在此渠道发送：`responseModalities["TEXT","IMAGE"]`、`generationConfig.imageConfig`

- Gemini API CN（示例）
  - baseUrl `https://gemini-api.cn`
  - 鉴权：Header `Authorization: Bearer <KEY>`
  - 端点：`/v1/chat/completions`（图片走 image_url）；若有 `/v1/images/generations` 再补
  - 不发送谷歌专有字段

- 其他 OpenAI 兼容/代理（OpenRouter/NewAPI/自建等）
  - 统一用 header `Authorization: Bearer <KEY>`（如有特殊 header 放 extraHeaders）
  - 端点：`/v1/chat/completions` / `/v1/images/generations`
  - 模型名保持原样，不做跨渠道映射

### 能力探测流程
1) 选择渠道 + 填密钥（谷歌不用填地址）。
2) 拉取模型列表：谷歌用 `/v1beta/models`；其他尝试 `/v1/models`，失败则用内置清单+探针。
3) 轻量探针：
   - 文本：最小 prompt
   - 图片：小 prompt + 最小尺寸；尝试常见 aspectRatio/imageSize，失败即标记不支持
4) UI 动态表单：只显示模型支持的参数；不支持项隐藏/禁用；调用前做参数校验。
5) 缓存模型与探测结果（按渠道+key）；提供“重新探测”按钮。

### 路由规则
- 按 providerId 选择配置，模型映射仅在当前渠道生效。
- 只有谷歌渠道做 v1/v1beta 选择和 imageConfig/responseModalities；其他渠道不做版本猜测、不发谷歌专有字段。
- OpenRouter 额外头：`HTTP-Referer`、`X-Title`。
- 签名渠道（如 volc/aliyun）在 auth.signer 钩子里做签名，不影响其他渠道。

### 预设（代码侧已补）
- `keyManager` 已新增 `gemini-api-cn` 预设：
  - baseUrl `https://gemini-api.cn`
  - format `openai`
  - 默认模型示例：`gemini-2.5-flash-image`, `gemini-3-pro-image-preview`, `gemini-2.5-flash`, `gemini-3-flash-preview`

- `keyManager` 已新增 `antigravity` 预设（本地代理）：
  - baseUrl `http://127.0.0.1:8045`
  - format `openai`
  - 本地代理服务，支持 Gemini 和 OpenAI 协议
  - 默认模型：`gemini-3-pro-image`, `gemini-3-flash`, `gemini-2.5-flash-image`, `gemini-2.5-flash`
  - ⚠️ **推荐使用 Gemini 协议模式**（避免 OpenAI 模式的路径叠加 bug：/v1/chat/completions/responses）
  - 使用方法：填入 Base URL 后，在协议选择处选 Gemini

---

### 图片生成：Google Imagen 3（使用示例）
- 端点：`POST https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=API_KEY`
- Header：`Content-Type: application/json`
- 请求体示例：
  ```json
  {
    "instances": [{ "prompt": "a calm lake at sunrise" }],
    "parameters": {
      "sampleCount": 1,
      "aspectRatio": "16:9"
    }
  }
  ```
- 仅在 Google 官方渠道使用；其他代理走各自的 images/chat-completions 兼容端点，不发送 predict/imageConfig。参考开源实现: https://github.com/lbjlaq/Antigravity-Manager

---

### 供应商图片生成调用方法（4种方式）

#### 方式一：OpenAI Images API (推荐)
```python
import openai

client = openai.OpenAI(
    api_key="sk-antigravity",
    base_url="http://127.0.0.1:8045/v1"
)

# 生成图片
response = client.images.generate(
    model="gemini-3-pro-image",
    prompt="一座未来主义风格的城市，赛博朋克，霓虹灯",
    size="1920x1080",      # 支持任意 WIDTHxHEIGHT 格式，自动计算宽高比
    quality="hd",          # "standard" | "hd" | "medium"
    n=1,
    response_format="b64_json"
)

# 保存图片
import base64
image_data = base64.b64decode(response.data[0].b64_json)
with open("output.png", "wb") as f:
    f.write(image_data)
```

**支持的参数：**
- `size`: 任意 WIDTHxHEIGHT 格式（如 1280x720, 1024x1024, 1920x1080），自动计算并映射到标准宽高比（21:9, 16:9, 9:16, 4:3, 3:4, 1:1）
- `quality`:
  - `"hd"` → 4K 分辨率（高质量）
  - `"medium"` → 2K 分辨率（中等质量）
  - `"standard"` → 默认分辨率（标准质量）
- `n`: 生成图片数量（1-10）
- `response_format`: `"b64_json"` 或 `"url"`（Data URI）

---

#### 方式二：Chat API + 参数设置 (✨ 新增)
所有协议（OpenAI、Claude）的 Chat API 现在都支持直接传递 size 和 quality 参数：

```python
# OpenAI Chat API
response = client.chat.completions.create(
    model="gemini-3-pro-image",
    size="1920x1080",      # ✅ 支持任意 WIDTHxHEIGHT 格式
    quality="hd",          # ✅ "standard" | "hd" | "medium"
    messages=[{"role": "user", "content": "一座未来主义风格的城市"}]
)
```

```bash
# Claude Messages API
curl -X POST http://127.0.0.1:8045/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk-antigravity" \
  -d '{
    "model": "gemini-3-pro-image",
    "size": "1280x720",
    "quality": "hd",
    "messages": [{"role": "user", "content": "一只可爱的猫咪"}]
  }'
```

**参数优先级:** 请求体参数 > 模型后缀

---

#### 方式三：Chat 接口 + 模型后缀
```python
response = client.chat.completions.create(
    model="gemini-3-pro-image-16-9-4k",  # 格式：gemini-3-pro-image-[比例]-[质量]
    messages=[{"role": "user", "content": "一座未来主义风格的城市"}]
)
```

**模型后缀说明：**
- **宽高比**: `-16-9`, `-9-16`, `-4-3`, `-3-4`, `-21-9`, `-1-1`
- **质量**: `-4k` (4K), `-2k` (2K), 不加后缀（标准）
- **示例**: `gemini-3-pro-image-16-9-4k` → 16:9 比例 + 4K 分辨率

---

#### 方式四：Cherry Studio 等客户端设置
在支持 OpenAI 协议的客户端（如 Cherry Studio）中，可以通过模型设置页面配置图片生成参数：

1. **进入模型设置**：选择 gemini-3-pro-image 模型
2. **配置参数**：
   - **Size (尺寸)**: 输入任意 WIDTHxHEIGHT 格式（如 1920x1080, 1024x1024）
   - **Quality (质量)**: 选择 standard / hd / medium
   - **Number (数量)**: 设置生成图片数量（1-10）
3. **发送请求**：直接在对话框中输入图片描述即可

**参数映射规则：**
- `size`: "1920x1080" → 自动计算为 16:9 宽高比
- `quality`: "hd" → 映射为 4K 分辨率
- `quality`: "medium" → 映射为 2K 分辨率

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

### 5. 代码注释规范（中文强制）

```typescript
/**
 * 生成图片卡片组件
 * 
 * 功能说明：
 * - 显示生成的图片预览
 * - 支持点击查看原图
 * - 显示生成信息和操作按钮
 * 
 * @param imageUrl - 图片 URL
 * @param prompt - 生成提示词
 * @param model - 使用的模型名称
 * @param aspectRatio - 图片宽高比
 * @param onDelete - 删除回调
 * @param onDownload - 下载回调
 * 
 * @example
 * <ImageCard
 *   imageUrl="https://example.com/image.png"
 *   prompt="一只可爱的猫咪"
 *   model="gemini-2.5-flash-image"
 *   aspectRatio="1:1"
 *   onDelete={() => handleDelete(id)}
 * />
 */
export interface ImageCardProps {
  imageUrl: string;
  prompt: string;
  model: string;
  aspectRatio: AspectRatio;
  onDelete?: () => void;
  onDownload?: () => void;
}

// ✅ 复杂逻辑必须注释
export function calculateImageTokens(model: string, size: ImageSize): number {
  // 根据模型和尺寸计算 token 数量
  // 参考 Google 官方定价文档：https://ai.google.dev/pricing
  const baseTokens = MODEL_TOKEN_MAP[model] ?? 1000;
  const sizeMultiplier = SIZE_MULTIPLIER_MAP[size] ?? 1;
  
  return Math.round(baseTokens * sizeMultiplier);
}

// ❌ 避免无意义的注释
const x = 5; // 设置 x 为 5（冗余）

// ✅ 解释"为什么"而非"是什么"
// 使用防抖而非节流，因为用户可能连续快速输入
const debouncedSearch = useDebounce(searchQuery, 300);
```

### 6. 组件复用与组合规范

#### 原子设计原则

```
Atoms（原子） → Molecules（分子） → Organisms（有机体） → Templates（模板） → Pages（页面）
```

#### 组件拆分标准

| 场景 | 拆分方式 | 示例 |
|------|---------|------|
| 代码行数 > 200 | 拆分子组件 | ImageCard → ImageCardHeader/ImageCardBody |
| 条件渲染复杂 | 拆分为独立组件 | ConditionalPanel |
| 多处复用逻辑 | 提取为 Custom Hook | useImageLoader |
| 纯展示逻辑 | 提取为子组件 | ImageThumbnail |

#### Props 设计原则

```typescript
// ✅ 使用接口定义 Props，添加 JSDoc
interface ButtonProps {
  /** 按钮变体样式 */
  variant?: 'primary' | 'secondary' | 'danger';
  /** 按钮尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 是否禁用 */
  disabled?: boolean;
  /** 点击回调 */
  onClick?: () => void;
  /** 子元素 */
  children: React.ReactNode;
}

// ✅ 提供合理的默认值
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  children
}) => {
  // ...
};
```

### 7. 状态管理规范

#### 局部状态 vs 全局状态

| 类型 | 使用场景 | 技术方案 |
|------|---------|---------|
| 局部状态 | 组件内部 UI 状态 | useState/useReducer |
| 跨组件共享 | 多个组件共用 | Context + useReducer |
| 全局状态 | 应用级数据 | Zustand/Redux Toolkit |
| 服务端状态 | API 数据缓存 | React Query/SWR |

#### Context 使用规范

```typescript
// ✅ 一个 Context 一个文件，添加 Provider 组件
// contexts/ThemeContext.tsx

interface ThemeContextType {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  
  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);
  
  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

// ✅ 提供自定义 Hook
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
```

---

## 🛡️ 错误处理规范

### 防御性编程

```typescript
// ✅ 使用 Optional Chaining + Nullish Coalescing
const userName = user?.profile?.name ?? '匿名用户';
const itemCount = data?.items?.length ?? 0;

// ✅ 输入验证
function processImageUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    throw new Error('图片 URL 无效');
  }
  
  if (!url.startsWith('http') && !url.startsWith('data:')) {
    throw new Error('图片 URL 格式错误，必须以 http 或 data: 开头');
  }
  
  return url;
}

// ✅ API 响应安全检查
interface ApiResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

function handleApiResponse<T>(response: ApiResponse<T>): T {
  if (response.error) {
    throw new Error(response.error.message);
  }
  
  if (!response.data) {
    throw new Error('API 返回数据为空');
  }
  
  return response.data;
}
```

### 错误边界（Error Boundary）

```typescript
// components/ErrorBoundary.tsx
import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 记录到错误追踪服务
    console.error('组件错误:', error);
    console.error('错误详情:', errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-fallback">
          <h3>出错了</h3>
          <p>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false })}>
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
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

### 异步错误处理

```typescript
// ✅ 使用 try-catch 包裹异步操作
async function generateImage(params: GenerateParams): Promise<void> {
  try {
    setLoading(true);
    const result = await api.generateImage(params);
    setImages(prev => [...prev, result]);
  } catch (error) {
    if (error instanceof ApiError) {
      // 处理已知 API 错误
      notify('error', `生成失败: ${error.message} (错误码: ${error.code})`);
    } else {
      // 处理未知错误
      notify('error', '生成失败，请稍后重试');
      console.error('生成错误:', error);
    }
  } finally {
    setLoading(false);
  }
}

// ✅ 使用 AbortController 支持取消
const abortControllerRef = useRef<AbortController>();

const handleGenerate = async () => {
  // 取消之前的请求
  abortControllerRef.current?.abort();
  abortControllerRef.current = new AbortController();
  
  try {
    await api.generateImage(params, {
      signal: abortControllerRef.current.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('请求已取消');
      return;
    }
    throw error;
  }
};
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

## ⚡ 性能优化规范

### 1. 渲染优化

```typescript
// ✅ 使用 useMemo 缓存复杂计算
const expensiveValue = useMemo(() => {
  return data.map(item => complexTransform(item));
}, [data]);

// ✅ 使用 useCallback 缓存回调函数
const handleClick = useCallback(() => {
  onSelect(id);
}, [id, onSelect]);

// ✅ 使用 React.memo 避免不必要重渲染
export const ImageCard = React.memo<ImageCardProps>({
  imageUrl,
  prompt,
  onDelete
}) => {
  // 组件逻辑
});

// ✅ 虚拟列表处理大量数据
import { FixedSizeList } from 'react-window';

function ImageList({ images }: { images: Image[] }) {
  return (
    <FixedSizeList
      height={600}
      itemCount={images.length}
      itemSize={200}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <ImageCard {...images[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}
```

### 2. 图片优化

```typescript
// ✅ 使用懒加载
import { LazyLoadImage } from 'react-lazy-load-image-component';

<LazyLoadImage
  src={imageUrl}
  alt={prompt}
  effect="blur"
  threshold={100}
/>

// ✅ 响应式图片
<picture>
  <source
    srcSet={`${imageUrl}?w=400 400w, ${imageUrl}?w=800 800w`}
    sizes="(max-width: 600px) 400px, 800px"
  />
  <img src={imageUrl} alt={prompt} loading="lazy" />
</picture>

// ✅ 图片尺寸限制
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

async function compressImage(file: File): Promise<Blob> {
  if (file.size <= MAX_IMAGE_SIZE) return file;
  
  // 使用 canvas 压缩
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      // 计算压缩后尺寸...
      canvas.toBlob(resolve, 'image/jpeg', 0.8);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
```

### 3. 代码分割

```typescript
// ✅ 路由级别懒加载
const ImageGallery = lazy(() => import('./pages/ImageGallery'));
const Settings = lazy(() => import('./pages/Settings'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/gallery" element={<ImageGallery />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  );
}

// ✅ 组件级别懒加载（Modal等）
const ImagePreviewModal = lazy(() => import('./components/ImagePreviewModal'));

function ImageCard() {
  const [showModal, setShowModal] = useState(false);
  
  return (
    <>
      <div onClick={() => setShowModal(true)}>...</div>
      {showModal && (
        <Suspense fallback={null}>
          <ImagePreviewModal onClose={() => setShowModal(false)} />
        </Suspense>
      )}
    </>
  );
}
```

### 4. 状态更新优化

```typescript
// ✅ 批量更新状态
const [count, setCount] = useState(0);
const [items, setItems] = useState([]);

// ❌ 不要这样
setCount(c => c + 1);
setItems(prev => [...prev, newItem]);

// ✅ 使用函数式更新
setCount(c => c + 1);
setItems(prev => [...prev, newItem]);

// ✅ 使用 immer 处理复杂状态
import produce from 'immer';

setState(prev => produce(prev, draft => {
  draft.images[0].status = 'completed';
  draft.images[0].url = imageUrl;
}));
```

### 5. 内存管理

```typescript
// ✅ 清理副作用
useEffect(() => {
  const subscription = api.subscribe(data => {
    setData(data);
  });
  
  return () => {
    subscription.unsubscribe();
  };
}, []);

// ✅ 清理 URL 对象
useEffect(() => {
  const objectUrl = URL.createObjectURL(file);
  setPreviewUrl(objectUrl);
  
  return () => {
    URL.revokeObjectURL(objectUrl);
  };
}, [file]);

// ✅ 取消进行中的请求
useEffect(() => {
  const abortController = new AbortController();
  
  fetchData({ signal: abortController.signal });
  
  return () => {
    abortController.abort();
  };
}, [dependency]);
```

---

## 🧪 测试规范

### 1. 测试文件结构

```
src/
├── components/
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.test.tsx          # 组件测试
│   │   └── Button.stories.tsx       # Storybook 故事
│   └── ...
├── hooks/
│   ├── useImageLoader.ts
│   └── useImageLoader.test.ts       # Hook 测试
├── utils/
│   ├── formatDate.ts
│   └── formatDate.test.ts           # 工具函数测试
```

### 2. 组件测试规范

```typescript
// Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('应该正确渲染按钮文本', () => {
    render(<Button>点击我</Button>);
    expect(screen.getByText('点击我')).toBeInTheDocument();
  });

  it('点击时应该触发 onClick 回调', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>点击</Button>);
    
    fireEvent.click(screen.getByText('点击'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('禁用时应该无法点击', () => {
    const handleClick = jest.fn();
    render(<Button disabled onClick={handleClick}>禁用</Button>);
    
    fireEvent.click(screen.getByText('禁用'));
    expect(handleClick).not.toHaveBeenCalled();
  });
});
```

### 3. Hook 测试规范

```typescript
// useImageLoader.test.ts
import { renderHook, act } from '@testing-library/react-hooks';
import { useImageLoader } from './useImageLoader';

describe('useImageLoader', () => {
  it('应该返回加载状态和图片数据', async () => {
    const { result, waitForNextUpdate } = renderHook(() => 
      useImageLoader('https://example.com/image.png')
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();

    await waitForNextUpdate();

    expect(result.current.loading).toBe(false);
    expect(result.current.image).toBeDefined();
  });

  it('加载失败时应该返回错误', async () => {
    const { result, waitForNextUpdate } = renderHook(() => 
      useImageLoader('invalid-url')
    );

    await waitForNextUpdate();

    expect(result.current.error).toBeDefined();
    expect(result.current.loading).toBe(false);
  });
});
```

### 4. 测试覆盖率要求

- **组件**: 渲染测试 + 交互测试 + 边界测试
- **Hooks**: 状态变化测试 + 副作用测试
- **工具函数**: 输入输出测试 + 边界测试
- **最小覆盖率**: 80%（核心业务逻辑 100%）

---

## ✅ 代码审查清单

开始编码前确保：

### 基础规范
- [ ] 所有注释使用简体中文
- [ ] 使用 CSS Variables，不硬编码颜色
- [ ] 使用统一的圆角规范（rounded-lg）
- [ ] **字体统一使用系统字体族，只用字重和字号区分层级**：
  - 标题：`text-h1/h2/h3` + `font-semibold`
  - 正文：`text-body-lg/md/sm` + `font-normal`
  - 标注：`text-xs/2xs/3xs` + `font-normal`
- [ ] 同组图标统一 strokeWidth
- [ ] 选中状态有淡蓝色光晕
- [ ] 所有交互有动效
- [ ] 优先居中对齐，其次左对齐
- [ ] 错误处理有用户友好提示
- [ ] 文件长度不超过 500 行

### 性能与质量
- [ ] 使用 useMemo/useCallback 优化渲染
- [ ] 图片使用懒加载
- [ ] 组件添加 React.memo（必要时）
- [ ] 清理副作用（useEffect return）
- [ ] 异步操作支持取消（AbortController）
- [ ] 复杂状态使用 immer

### 可维护性
- [ ] 函数添加 JSDoc 注释
- [ ] Props 接口完整定义
- [ ] 提供组件使用示例
- [ ] 错误边界处理
- [ ] 单元测试覆盖核心逻辑

---

**KK Studio Design System v2.2**  
Last updated: 2026-03-09

## 📋 变更日志

### v2.2 (2026-03-09)
- 新增项目版本基线说明（当前版本 `1.3.6`）
- 新增版本同步源文件要求
- 新增 `<project-root>` 路径规范，避免目录名与版本耦合
- 新增文档同步与验证要求
- 明确“稳定优先、少改 UI 动线”的修改原则

### v2.1 (2026-02-09)
- 新增多渠道 API 调用规范（Google 官方、Gemini API CN、OpenAI 兼容）
- 新增 Imagen 3 图片生成调用示例
- 完善代码注释规范（JSDoc 强制）
- 新增组件复用与组合规范
- 新增状态管理规范（Context、Hook 设计）
- 完善错误处理规范（Error Boundary、AbortController）
- 新增性能优化规范（渲染优化、图片优化、代码分割）
- 新增测试规范（组件测试、Hook 测试、覆盖率要求）
- 更新代码审查清单（性能、可维护性检查项）

### v2.0 (2026-01-30)
- 初始版本，包含设计系统基础规范
