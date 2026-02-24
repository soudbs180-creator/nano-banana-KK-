# KK Studio v1.3.1
A visual-first, node-based prompt engineering and generation IDE.

![Version](https://img.shields.io/badge/version-1.3.1-indigo.svg)
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

## 📦 项目结构

```
KK-Studio-1.0.0/
├── src/                    # 项目源代码
│   ├── components/         # React 组件
│   ├── context/            # Context 状态管理
│   ├── hooks/              # 自定义 Hooks
│   ├── services/           # API 服务
│   └── utils/              # 工具函数
├── docs/                   # 📚 文档中心
│   ├── development/        # 开发文档
│   │   ├── model-service.md      # 模型服务文档
│   │   ├── progress.md           # 开发进度
│   │   └── session-handoff.md    # 会话交接
│   └── reports/            # 报告文档
│       └── mobile-ui-optimization.md  # 移动端UI优化报告
├── scripts/                # 🔧 脚本工具
│   ├── health_check.js
│   ├── patch_canvas.py
│   ├── patch_canvas_v2.py
│   ├── verify_connection.js
│   └── 启动 KK Studio.bat
├── tests/                  # ✅ 测试文件
│   └── test-connection.html
├── .agent/                 # 🤖 AI代理规则
│   ├── rules/skills/SKILL.md     # 完整开发规范
│   └── README.md                 # 规则说明
├── config/                 # ⚙️ 配置文件
├── public/                 # 静态资源
└── netlify/                # Netlify 部署配置
```

---

## 🤖 AI 开发规范

本项目配置了 `.agent/rules/skills/SKILL.md` 开发规范文档，所有 AI 代码助手（Cursor、GitHub Copilot、Claude 等）会自动遵循：

- **UI 设计**: AnyGen Design Language，Glassmorphism 毛玻璃效果
- **代码规范**: 中文注释，Type Safety，函数组件
- **架构规则**: Service 层分离，Context 状态管理
- **性能优化**: useMemo/useCallback，懒加载，GPU 加速


---

## 📄 更新日志

### v1.2.9 (2026-02-07)

#### ✨ 新功能
- **GPU 渲染优化**：新增 GPU 加速工具类，提升画布拖拽/缩放流畅度
- **粒子背景特效**：新增 `GpuBackground` 组件，自动适配设备性能

#### 🐛 修复
- **主卡丢失修复**：修复代理生成失败时主卡（PromptNode）不显示的问题
- **错误状态显示**：确保生成失败时正确显示带错误信息的主卡

---

### v1.2.8 (2026-02-06)

### v1.2.7 (2026-02-05)

#### ✨ 新功能
- **API 渠道重构**：优化 API Key 管理逻辑，支持更灵活的渠道配置
- **性能优化**：改进缩略图服务和 LOD（Level of Detail）服务

#### 🛠️ 修复
- **API 崩溃修复**：解决 API 调用时的异常崩溃问题
- **稳定性提升**：修复多个边缘情况下的错误处理

---

### v1.2.6 (2026-02-04)

#### ✨ 新功能
- **副卡模型名称修复**：副卡现在显示用户选择的模型显示名称（如 "Nano Banana Pro"），而不是技术ID
- **modelLabel 字段**：新增 `modelLabel` 属性，完整保存用户选择时的模型标签

#### 🛠️ 界面优化
- **模型标签精确显示**：生成后的图片/视频卡片显示正确的模型名称
- **圆点颜色优化**：不同模型显示不同颜色的标识圆点

---

### v1.2.5 (2026-02-03)

#### ✨ 新功能
- **视频生成支持**：集成 Veo 3.1 视频生成 API，支持多图片模式（0/1/2/3张：文生视频/首帧/首尾帧/参考图）
- **副卡排列模式轮换**：单选卡组或框选纯副卡时，连续点击整理可轮换 **横向/宫格/竖向** 三种排列方式
- **模型参考图限制**：不同模型支持不同参考图数量（Gemini=10张，Imagen=0张，Veo=3张）

#### 🛠️ 界面优化
- **框选圆角**：框选区域添加圆角设计，视觉更柔和
- **通知层级**：Toast 通知始终保持最顶层显示
- **计费参考 UI**：丰富计费参考信息，新增 Veo 视频价格和 Token 计算说明

---

### v1.2.3 (2026-01-29)

#### ✨ 界面升级 (UI Polish)
- **Lightbox 元数据浮层**：
  - 图片放大查看时，底部新增精美浮层，展示 **模型版本**、**分辨率/比例**、**生成耗时** 及 **Token/成本**。
  - 采用深色毛玻璃风格，与应用整体设计语言保持一致。
- **生成卡片优化**：
  - **预览卡片 (Draft Node)**：调整为高斯模糊磨砂质感 (Frosted Glass)，提升文字可读性。
  - **信息排布**：生成耗时、Token、预估成本均调整为 **垂直排布**，节省空间并增强层级感。
  - **计时器重构**：将"正在生成"计时器改为垂直布局（标签在上，数字在下），避免与视频时长混淆。
- **视觉修复**：
  - 移除卡片 `backface-visibility` 属性，解决缩放后文字模糊的问题。

#### 🐛 修复与部署
- **部署修复**：清理过期的 `pnpm-lock.yaml`，解决 Vercel 部署时的依赖锁文件冲突 (`ERR_PNPM_OUTDATED_LOCKFILE`)。
- **交互优化**：将部分原生 `alert()` 弹窗替换为应用内 `notify` 通知，体验更流畅。
- **启动修复**：修复 `ImageCard2` 组件中的语法错误（嵌套 div 和标签不匹配）导致的模块加载失败问题。

---

### v1.2.2 (2026-01-28)
- 🚀 全新 Direct DOM 渲染引擎，120Hz 极致流畅
- 🎨 AnyGen 设计语言升级，深色/浅色模式完美适配
- 🔧 修复搜索栏、分组框在浅色模式下的显示问题
- 📝 README 文档全面重写

---

### v1.2.0 (2026-01-23)

#### ✨ 新功能
- **智能排版系统 (Strict Selection)**：
  - 严格选择模式：单选主卡/副卡时不干扰其他卡片。
  - 混合联动：仅在框选主副卡时启用联动。
  - 智能宫格：大于6张卡自动切为矩阵布局。
- **智能落位 (Smart Placement)**：
  - 新对话/卡片自动定位在画布**右上角空白处**，彻底告别堆叠覆盖。

#### 🔧 改进与修复
- **API 列表排序优化**：点击"按规则整理"时，现在会优先将 可用(Valid/Green) 密钥排在顶部，将 未知/无效/暂停 密钥沉底。
- **代理配置容错**：修复自定义代理未填写 Base URL 时的报错（自动补全 https）。
- **生成稳定性**：修复部分场景下 Invalid URL 导致的生成失败。

---

## 📚 相关文档

- [移动端UI优化报告](docs/reports/mobile-ui-optimization.md) - 详细的移动端UI/UX优化记录
- [模型服务文档](docs/development/model-service.md) - AI模型服务集成说明
- [开发进度](docs/development/progress.md) - 项目开发进度跟踪

---

**Made with ❤️ by KK Studio Team**
