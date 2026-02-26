# GPT-Best API 适配文档

## 概述

KK-Studio 已全面适配 [gpt-best.apifox.cn](https://gpt-best.apifox.cn) 的 API 平台。    
该平台是 OpenAI 兼容的 API 聚合服务，支持聊天、绘图、视频、音频等多种模型。

## 配置方式

| 参数 | 说明 |
|------|------|
| Base URL | 站点域名（也可在工作台页面查看） |
| API Key | 在令牌页面获取 |

## 支持的 API 端点

### 聊天 (Chat)
- **端点**: `POST /v1/chat/completions`
- **格式**: 标准 OpenAI 格式
- **支持**: 流式、函数调用、视觉、结构化输出

### 图像生成 (Image Generation)

#### 文生图 / 图生图
- **端点**: `POST /v1/images/generations`
- **格式**: JSON
- **参数**: `model`, `prompt`, `size`, `aspect_ratio`, `image[]`

#### 图像编辑 (Inpaint/Edit)
- **端点**: `POST /v1/images/edits`
- **格式**: multipart/form-data
- **参数**: `image` (file), `mask` (file), `prompt`, `model`

#### 支持的模型
| 模型 ID | 说明 |
|---------|------|
| `gpt-image-1` | OpenAI 图像编辑，支持 mask |
| `gpt-4o-image` | GPT-4o 图像生成 |
| `nano-banana` | Gemini 2.5 Flash Image (快速) |
| `nano-banana-hd` | Nano Banana 高清版 |
| `dall-e-3` | DALL-E 3 |
| `flux-kontext-pro` | Flux Kontext Pro (参考图 prompt 内嵌) |
| `flux-kontext-max` | Flux Kontext Max (旗舰) |
| `recraftv3` | Recraft V3 (矢量/图标) |
| `qwen-image` | 通义千问文生图 |
| `qwen-image-edit` | 通义千问图生图 |
| `qwen-image-edit-2509` | 通义千问图编辑 v2 (多图) |
| `doubao-seedream-4-0-250828` | 豆包即梦 4.0 |
| `doubao-seededit-3-0-i2i-250628` | 豆包 SeedEdit 3.0 |

### 视频生成 (Video Generation)

#### v2 统一格式 (推荐)
- **提交**: `POST /v2/videos/generations`
- **查询**: `GET /v2/videos/generations/:task_id`

#### 请求参数
```json
{
    "prompt": "描述",
    "model": "veo3",
    "duration": 5,
    "aspect_ratio": "16:9",
    "resolution": "720P",
    "images": ["url_or_b64"],
    "videos": ["url"],
    "watermark": false
}
```

#### 任务状态码
| 状态 | 含义 |
|------|------|
| `NOT_START` | 未开始 |
| `SUBMITTED` | 已提交 |
| `QUEUED` | 排队中 |
| `IN_PROGRESS` | 进行中 |
| `SUCCESS` | 完成 |
| `FAILURE` | 失败 |

#### 支持的模型
| 模型 | 说明 |
|------|------|
| `veo3` | Google Veo 3 |
| `wan-*` | 阿里万相系列 |
| `seedance-*` | 即梦视频 |
| `kling-*` | 快手可灵 |
| `runway-*` | Runway Gen |
| `pika-*` | Pika |
| `minimax-*` / `hailuo-*` | MiniMax 海螺 |
| `luma-*` | Luma (Ray) |
| `sora` / `sora2` | Sora 系列 |
| `vidu-*` | Vidu |
| `higgsfield` | Higgsfield |
| `cogvideo` / `zhipu` | 智谱清影 |
| `pixverse-*` | PixVerse |
| `qwen-video` | 通义视频 |

### 音频生成 (Audio Generation)

#### v2 统一格式
- **提交**: `POST /v2/audio/generations`
- **查询**: `GET /v2/audio/generations/:task_id`

#### 请求参数 (Suno 示例)
```json
{
    "model": "suno-v4",
    "prompt": "一首关于夏天的歌",
    "lyrics": "歌词内容",
    "title": "歌曲名",
    "tags": "pop,happy,summer",
    "mode": "custom"
}
```

#### 支持的模型
| 模型 | 说明 |
|------|------|
| `suno-v4` | Suno V4 作曲 |
| `suno-v3.5` | Suno V3.5 |
| `minimax-tts` | MiniMax 语音合成 |

## 特殊行为说明

1. **gpt-best 自动检测**: 当 Base URL 包含 `gpt-best` 时，适配器自动切换到 v2 格式
2. **aspect_ratio 直通**: gpt-best 支持直接传递 `aspect_ratio: "16:9"` 等标准比例
3. **图生图参考**: Flux Kontext 模型参考图 URL 自动拼接到 prompt 末尾
4. **异步轮询**: 视频/音频使用指数退避轮询 (3s→6s→10s→15s)，最长 30 / 20 分钟
5. **Inpaint**: 已通过 JSON body 的 `mask` + `editMode: 'inpaint'` 字段支持

## 相关文件

- [OpenAICompatibleAdapter.ts](../src/services/llm/OpenAICompatibleAdapter.ts) - 图像生成
- [VideoCompatibleAdapter.ts](../src/services/llm/VideoCompatibleAdapter.ts) - 视频生成
- [AudioCompatibleAdapter.ts](../src/services/llm/AudioCompatibleAdapter.ts) - 音频生成
- [LLMAdapter.ts](../src/services/llm/LLMAdapter.ts) - 类型定义
- [modelCapabilities.ts](../src/services/modelCapabilities.ts) - 模型能力注册
