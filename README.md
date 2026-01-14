# KK Studio - AI 图像创作工作室

> 基于 Google Gemini API 的无限画布图像生成工具

## 🚀 快速启动

**双击 `KK Studio.exe`** 即可启动（首次需要配置 API Key）

## ✨ 功能特性

### 🎨 图像生成
- 支持 **Gemini Pro** 和 **Flash** 两种模型
- 多种比例：1:1、16:9、9:16、4:3、3:4 等
- 分辨率选择：1K / 2K / 4K
- 支持参考图片引导生成

### 🖼️ 无限画布
- 自由拖拽、缩放画布
- 卡片自动居中定位
- 平滑拖拽，即时响应
- 定位按钮一键查看全部卡片

### 💬 对话式创作
- **点击图片**：以该图为基础继续创作
- **点击提示词**：复制到输入框开启新对话
- 可视化连接线展示创作关系

### 📁 画布管理
- 支持最多 **10 个画布**
- 重命名、删除画布
- 删除前确认，防止误操作
- 数据本地保存，持久化存储

### 🔑 多 API Key 管理
- 支持 **4 个 API Key**
- 自动验证并显示状态
- 优先使用有效的 Key
- 失败自动切换

## ⌨️ 快捷操作

| 操作 | 说明 |
|------|------|
| 拖拽画布 | 平移视图 |
| 滚轮 | 缩放画布 |
| 拖拽卡片 | 移动卡片位置 |
| 点击图片 | 继续该图创作 |
| 点击提示词 | 复制到输入框 |
| Enter | 开始生成 |

## 📝 首次使用

1. 双击 `KK Studio.exe` 启动
2. 点击右上角头像，输入 Google API Key
3. 在输入框输入提示词
4. 按 Enter 或点击生成按钮

## 🔧 获取 API Key

访问 [Google AI Studio](https://aistudio.google.com/app/apikey) 免费获取

## 📦 技术栈

- React + TypeScript
- Vite 开发服务器
- Tailwind CSS
- Lucide Icons
- Google Gemini API

---

**Made with ❤️ by KK Studio Team**
