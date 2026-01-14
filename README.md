# KK Studio - AI 图像生成工作室

## 便携版使用说明

这是一个完全便携的版本，无需安装任何软件！

### 快速开始

1. **解压所有文件**到任意位置
2. **双击** `启动 KK Studio.bat` 或 `KK Studio.exe`
3. 等待浏览器自动打开
4. 首次使用需要输入 **Gemini API Key**

### 获取 API Key

1. 访问 [Google AI Studio](https://aistudio.google.com/app/apikey)
2. 登录 Google 账号
3. 创建新的 API Key
4. 复制并粘贴到 KK Studio

### 文件说明

| 文件/文件夹 | 说明 |
|------------|------|
| `启动 KK Studio.bat` | 启动程序 |
| `stop.bat` | 停止后台服务 |
| `node-portable/` | 内置 Node.js 环境 |
| `node_modules/` | 依赖包（首次运行自动安装）|

### 功能特点

- 🎨 AI 图像生成（支持 Gemini 2.5 Flash / Pro）
- 🖼️ 无限画布自由布局
- 📐 多种尺寸比例选择
- 💾 本地自动保存
- 🔗 参考图片功能

### 注意事项

- API Key 保存在浏览器本地，不会上传
- 生成的图片保存在浏览器中
- 关闭程序请运行 `stop.bat`

---

**版本**: 1.0.0  
**兼容系统**: Windows 10/11 (64位)
