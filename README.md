# KK Studio v1.2.1 - The AnyGen Engine

> **Next-Generation AI Creative Studio** | **Infinite Canvas** | **120Hz Performance**

![Version](https://img.shields.io/badge/version-1.2.1-indigo.svg) ![React](https://img.shields.io/badge/React-19-blue) ![Vite](https://img.shields.io/badge/Vite-6.0-purple)

KK Studio 是一个基于 Google Gemini API 构建的**无限画布（Infinite Canvas）**生成式 AI 创作平台。它不仅仅是一个工具，更是一种全新的非线性创作体验。

v1.2.1 版本带来了革命性的**Direct DOM 渲染引擎**，实现了 **120Hz** 的极致流畅拖拽体验，并引入了 **AnyGen Premium Design** 设计语言。

---

## 🌟 核心亮点 (Highlights)

### 🚀 120Hz 极致性能 (Direct DOM Engine)
- **零延迟拖拽**：全新重构的拖拽引擎，绕过 React 渲染周期，直接操作 DOM `transform`。
- **GPU 硬件加速**：全链路 `translate3d` 加速与智能 `will-change` 图层管理，彻底告别拖影与卡顿。
- **丝滑体验**：在 144Hz/120Hz 显示器上提供原生满帧的黄油般顺滑手感。

### 🎨 AnyGen Premium Design
- **沉浸式美学**：精心调教的 Zinc/Indigo 配色体系，支持**深色/浅色模式**完美切换。
- **微交互细节**：从卡片悬浮到连线动画，每一个交互都经过精心打磨。
- **智能排版**：一键 **Auto-Arrange**，算法自动梳理混乱的节点，让思维更清晰。

### 🔌 企业级 API 管理 (NewAPI Support)
- **NewAPI / One API 集成**：原生支持渠道（Channel）管理模式。
- **多路负载均衡**：自动轮询多个 API Key，智能处理限流与熔断。
- **成本可视化**：实时追踪每一笔 Token 消耗，精确到 USD $0.0001。

---

## ✨ 核心功能 (Features)

### 1. 无限画布创作流
- **非线性节点**：打破传统对话框限制，通过节点分支探索无限可能。
- **上下文感知**：智能连接（Context Lines）自动传递创作上下文。
- **高清原图**：支持 4K 原图预览与无损下载。

### 2. 智能卡片系统 (Smart Cards)
- **Prompt Node**：你的创作核心，支持 Markdown、代码高亮与即时编辑。
- **Image Card**：生成结果自动吸附，支持“父子”跟随拖拽与独立操作。
- **Canvas Group**：拖拽自动成组，支持批量操作与全选移动。

### 3. 本地化与隐私
- **Local First**：支持直接读写本地文件系统（File System Access API），数据完全掌控。
- **Supabase Sync**：可选的云端同步，保存你的偏好设置与 API 配置。

---

## 🚀 快速启动 (Quick Start)

### 环境要求
- Node.js 18+
- Modern Browser (Chrome 100+ / Edge)

### 安装与运行
```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 首次配置
1.  启动后点击左下角 **Settings** 图标。
2.  进入 **One API Dashboard**。
3.  添加您的 **Google Gemini API Key**。
4.  在底部输入框输入提示词，开始创作！

---

## 🛠️ 技术栈 (Tech Stack)

| 领域 | 技术方案 |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite 6 |
| **Styling** | Tailwind CSS 4, Lucide React, Framer Motion |
| **State** | React Context + Direct DOM Manipulation |
| **Backend** | Supabase (PostgreSQL, Auth) |
| **AI Cloud** | Google Gemini 1.5 Pro / Flash / Imagen 3 |

---

## ⚠️ 注意事项

- **GPU 性能**：为了获得最佳体验，请确保浏览器开启了硬件加速。
- **API 额度**：Gemini API 可能会产生费用，请关注 Dashboard 中的成本统计。
- **本地读写**：若使用“本地文件夹”模式，请在浏览器弹出询问时点击“允许编辑”。

---

**Made with ❤️ by KK Studio Team**
