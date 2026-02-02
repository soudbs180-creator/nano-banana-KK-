# 模型服务与计费优化说明

本文档说明 KK Studio 的模型服务接入方式、请求参数示例与计费估算的可配置入口。

## 接口格式

当前图像生成支持 3 种接口格式：

1) Gemini 原生格式
- 端点: `/v1beta/models/{model}:generateContent`
- 鉴权: `?key=API_KEY` 或 `x-goog-api-key` 头

2) OpenAI 图片生成格式
- 端点: `/v1/images/generations`
- 鉴权: `Authorization: Bearer API_KEY`

3) Chat 兼容格式 (用于中转站图生图)
- 端点: `/v1/chat/completions`
- 鉴权: `Authorization: Bearer API_KEY`
- content 采用 OpenAI Vision 格式数组

## Base URL 规则

建议只填写域名或根路径，例如:
- `https://future-api.vodeshop.com`
- `https://your-newapi-domain`

系统会自动裁剪尾部的 `/v1`、`/v1beta`、`/api`、`/v1/chat/completions`、`/v1/images/generations`。

## 请求参数示例

### Gemini 原生格式
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        { "text": "A futuristic studio interior, clean lighting" },
        { "inlineData": { "mimeType": "image/png", "data": "<BASE64>" } }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"],
    "imageConfig": { "aspectRatio": "1:1", "imageSize": "1K" }
  }
}
```

### OpenAI 图片生成格式
```json
{
  "model": "dall-e-3",
  "prompt": "A calm coastal illustration, flat style",
  "n": 1,
  "size": "1024x1024",
  "response_format": "b64_json"
}
```

### Chat 兼容格式 (参考 apifox 文档)
```json
{
  "model": "gemini-2.5-flash-image",
  "stream": false,
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "Generate a 1:1 portrait with soft lighting" },
        { "type": "image_url", "image_url": { "url": "data:image/png;base64,<BASE64>" } }
      ]
    }
  ]
}
```

## 中转站连通性排查

1) 确认 Base URL 不含 `/v1`、`/chat/completions` 等尾缀。
2) 确认鉴权方式: OpenAI 兼容一般使用 `Authorization: Bearer`。
3) 如果需要分组路由，设置 `X-Group`。
4) 若 `response_format` 报错，会自动回退为 URL 输出。

## 计费估算配置 (模型数据)

成本估算支持读取 Cherry Studio 模型数据结构，覆盖内置价格表。
支持的格式:

1) Map 结构:
```json
{
  "gemini-2.5-flash-image": {
    "input_per_million_tokens": 0.075,
    "output_per_million_tokens": 30,
    "tokens_per_image": { "standard": 1290 },
    "ref_image_tokens": 560,
    "currencySymbol": "USD"
  }
}
```

2) Array 结构 (Cherry Studio 模型数据子集):
```json
[
  {
    "id": "gemini-3-pro-image-preview",
    "pricing": {
      "input_per_million_tokens": 3.5,
      "output_per_million_tokens": 120,
      "tokens_per_image": { "standard": 1120, "hd": 2000 },
      "ref_image_tokens": 560,
      "currencySymbol": "USD"
    }
  }
]
```

写入方式 (浏览器控制台):
```js
localStorage.setItem('kk_model_pricing_overrides', JSON.stringify({...}))
```

完成后刷新页面即可生效。
