# API 适配器路由说明

## 适配器分类

### 1. GoogleAdapter (官方 Google API)
**用途**: 直连 Google 官方 API (googleapis.com)
**协议**: Gemini Native Protocol (`:generateContent`, `:predict`)
**端点**:
- Chat: `/v1beta/models/{model}:generateContent`
- Imagen: `/v1beta/models/{model}:predict`
- Veo: `/v1beta/models/{model}:predictLongRunning`

**适用场景**:
- Provider = "Google" 且 BaseUrl 包含 "googleapis.com"
- 使用官方 Google API Key

**支持的模型**:
- gemini-* (所有 Gemini 系列)
- imagen-* (Imagen 3/4)
- veo-* (Veo 2/3)

---

### 2. OpenAICompatibleAdapter (OpenAI 兼容协议)
**用途**: 所有 OpenAI 兼容的第三方服务
**协议**: OpenAI REST API (`/v1/chat/completions`, `/v1/images/generations`)
**端点**:
- Chat: `/v1/chat/completions`
- Image: `/v1/images/generations`

**适用场景**:
- Provider = "OpenAI", "Anthropic", "Custom", "SiliconFlow"
- **Antigravity 本地代理** (127.0.0.1:8045)
- 任何自定义 OpenAI 兼容端点

**特殊处理**:
- **Antigravity**: 通过 `127.0.0.1:8045` 识别，使用 `images/generations` 端点
- **Gemini via Antigravity**: 模型名 `gemini-3-pro-image` 等映射到正确的 size/quality 参数

---

### 3. 国内云厂商适配器 (特定协议)
**AliyunAdapter** - 阿里云百炼/灵积
**TencentAdapter** - 腾讯云 TI-ONE
**VolcengineAdapter** - 火山引擎方舟

这些适配器处理国内厂商特定的鉴权和请求格式。

---

## 路由决策流程

```
用户选择模型 + KeySlot
    ↓
LLMService.getAdapter(KeySlot.provider)
    ↓
根据 Provider 选择适配器:
    - "Google" → GoogleAdapter
    - "OpenAI"/"Anthropic"/"Custom"/"SiliconFlow" → OpenAICompatibleAdapter
    - "Aliyun" → AliyunAdapter
    - "Tencent" → TencentAdapter
    - "Volcengine" → VolcengineAdapter
    ↓
适配器内部根据模型类型选择具体方法:
    - gemini-* → generateGeminiImage (Google) / generateImageStandard (OpenAI)
    - imagen-* → generateImagenImage
    - veo-* → generateVeoVideo
```

---

## Antigravity 特定配置

### 图片生成
**必须使用的参数** (根据官方文档):
```json
{
  "model": "gemini-3-pro-image",
  "size": "1920x1080",      // WIDTHxHEIGHT 格式
  "quality": "hd"           // "hd"=4K, "medium"=2K, "standard"=1K
}
```

**重要限制**:
- ❌ 不支持参考图片 (referenceImages)
- ✅ 支持任意尺寸 (自动映射宽高比)
- ✅ 支持 quality 参数控制分辨率

### 模型映射
Antigravity 内部将 OpenAI 格式转换为 Gemini 格式:
- `gemini-3-pro-image` → Nano Banana Pro
- `gemini-2.5-flash-image` → Nano Banana

---

## 常见问题

### Q: 为什么 Antigravity 不能用 GoogleAdapter?
A: Antigravity 是一个 OpenAI 兼容代理，它内部将 OpenAI 格式的请求转换为 Gemini 格式。所以即使最终调用的是 Gemini 模型，也要用 OpenAICompatibleAdapter。

### Q: 如何区分使用哪个适配器?
A: 看 KeySlot 的 provider 字段:
- 官方 Google → Provider = "Google"
- Antigravity/第三方代理 → Provider = "Custom" 或 "OpenAI"

### Q: 图片生成应该用 Chat API 还是 Images API?
A: 
- Antigravity: **必须用 Images API** (`/v1/images/generations`)
- OpenAI DALL-E: Images API
- 某些代理可能支持 Chat API 生成图片 (通过特定参数)
