# KK Studio v1.2.2

**下一代 AI 图像创作工作室 | 无限画布 | 120Hz 极致性能**

![Version](https://img.shields.io/badge/version-1.2.2-indigo.svg)
![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)
![Vite](https://img.shields.io/badge/Vite-6.0-purple)

---

## 🌟 项目简介

KK Studio 是一款基于 **Google Gemini API** 的专业级 AI 图像生成平台。采用**无限画布（Infinite Canvas）**设计理念，为创作者提供自由、直观、高效的非线性创作体验。

无论是概念设计、灵感探索还是批量生成，KK Studio 都能以极致流畅的交互和精美的视觉呈现，让你的创意无限延展。

---

## ✨ 核心优势

### 🚀 120Hz 极致性能
- **Direct DOM 渲染引擎**：绕过 React 虚拟 DOM，直接操控原生 DOM，实现零延迟拖拽
- **GPU 硬件加速**：全链路 `translate3d` + 智能 `will-change` 图层管理
- **满帧体验**：在 144Hz/120Hz 高刷屏上依然丝滑流畅，无拖影、无卡顿

### 🎨 AnyGen 高级设计语言
- **深色/浅色双模式**：精心调校的 Zinc/Indigo 配色体系，护眼又专业
- **微交互动效**：卡片悬浮、连线动画、选中高亮，每个细节都经过打磨
- **响应式布局**：完美适配桌面端与移动端

### 🔌 企业级 API 管理
- **NewAPI / One API 原生支持**：渠道（Channel）管理模式，兼容主流中转站
- **多 Key 负载均衡**：自动轮询、智能限流、故障熔断
- **实时成本追踪**：精确到 $0.0001 的 Token 消耗统计

### 🧠 智能创作系统
- **上下文感知**：智能连线自动传递创作上下文
- **参考图控制**：支持上传参考图进行风格/构图引导
- **多模型切换**：Gemini Pro、Flash、Imagen 3/4 一键切换

---

## 🛠️ 功能介绍

### 无限画布 (Infinite Canvas)
| 功能 | 说明 |
|------|------|
| **无限平移/缩放** | 空格+拖拽 或 鼠标中键，滚轮缩放 |
| **多选操作** | 框选多个节点，批量拖拽/删除 |
| **智能分组** | 自动识别关联节点，支持打组与取消打组 |
| **一键整理** | Auto-Arrange 算法自动排版，告别杂乱 |

### 卡片系统 (Smart Cards)
| 卡片类型 | 功能 |
|----------|------|
| **Prompt Node** | 创作核心，支持 Markdown、代码高亮、即时编辑 |
| **Image Card** | 生成结果，支持 4K 预览、无损下载、批量管理 |
| **Canvas Group** | 节点分组，支持重命名、批量移动 |

### AI 聊天助手
- **悬浮球设计**：随时呼出，不遮挡画布
- **上下文对话**：连续对话，理解创作意图
- **多模型支持**：Pro/Flash/Lite 按需切换
- **Token 统计**：聊天消耗实时计入成本

### 图像查看器
- **沉浸式预览**：双击放大，滚轮缩放
- **自由拖拽**：放大状态下按住拖动
- **快速退出**：双击或点击背景关闭

### 存储与同步
- **本地优先**：支持直接读写本地文件夹（File System Access API）
- **浏览器存储**：IndexedDB 自动保存
- **云端同步**：Supabase 可选同步配置与偏好

---

## 🚀 快速开始

### 环境要求
- Node.js 18+
- Chrome 100+ / Edge（推荐启用硬件加速）

### 安装运行
```bash
# 克隆项目
git clone https://github.com/your-repo/kk-studio.git

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 配置 API
1. 点击左下角 **Settings** 图标
2. 进入 **One API Dashboard**
3. 添加 Google Gemini API Key
4. 开始创作！

---

## ⌨️ 快捷键

| 操作 | 快捷键 |
|------|--------|
| 画布平移 | `空格 + 拖拽` / `鼠标中键` |
| 画布缩放 | `滚轮` |
| 查看原图 | `双击图片` |
| 关闭原图 | `双击` / `点击背景` |
| 删除节点 | `Delete` / `Backspace` |
| 全选 | `Ctrl + A` |
| 搜索 | `Ctrl + K` |

---

## 📦 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | React 19, TypeScript, Vite 6 |
| 样式系统 | Tailwind CSS 4, Lucide Icons |
| 状态管理 | React Context + Direct DOM |
| 后端服务 | Supabase (PostgreSQL, Auth) |
| AI 接口 | Google Gemini API |
| 部署平台 | Netlify, Vercel |

---

## ⚠️ 注意事项

- **浏览器要求**：推荐使用 Chrome 100+ 或 Edge，并开启硬件加速
- **API 费用**：Gemini API 会产生费用，请关注成本统计
- **本地权限**：使用本地文件夹模式需授权文件系统访问

---

## 📄 更新日志

### v1.2.2 (2026-01-28)
- 🚀 全新 Direct DOM 渲染引擎，120Hz 极致流畅
- 🎨 AnyGen 设计语言升级，深色/浅色模式完美适配
- 🔧 修复搜索栏、分组框在浅色模式下的显示问题
- 📝 README 文档全面重写

---

**Made with ❤️ by KK Studio Team**
