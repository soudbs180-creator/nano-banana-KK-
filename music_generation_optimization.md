# 音乐生成功能优化报告

## 1. 模型能力系统扩展

### 1.1 新增 AudioCapability 接口
**文件**: `src/services/model/modelCapabilities.ts`

```typescript
export interface AudioCapability {
    supportedDurations: number[];      // 支持的时长选项
    maxDuration: number;               // 最大时长（秒）
    formats: ('mp3' | 'wav' | 'ogg' | 'm4a')[];  // 输出格式
    supportsCustomLyrics: boolean;     // 是否支持自定义歌词
    supportsInstrumental: boolean;     // 是否支持纯音乐
    supportsContinuation: boolean;     // 是否支持续写/延长
    supportsStyleTags: boolean;        // 是否支持风格标签
    supportsVoiceSelection: boolean;   // 是否支持选择声音(TTS)
    supportsSpeedControl: boolean;     // 是否支持语速控制
}
```

### 1.2 新增/完善的音频模型

| 模型 | 最大时长 | 自定义歌词 | 续写 | 风格标签 | 纯音乐 |
|------|---------|-----------|------|---------|--------|
| Suno V4 | 240s | ✅ | ✅ | ✅ | ✅ |
| Suno V3.5 | 180s | ✅ | ✅ | ✅ | ✅ |
| Suno V3 | 120s | ✅ | ✅ | ✅ | ✅ |
| Udio V1 | 120s | ✅ | ✅ | ✅ | ✅ |
| Riffusion | 30s | ❌ | ❌ | ✅ | ✅ |
| MiniMax TTS | 600s | ❌ | ❌ | ❌ | ❌ |
| MiniMax Music | 120s | ✅ | ❌ | ✅ | ✅ |

## 2. 辅助函数

### 2.1 新增工具函数
**文件**: `src/services/model/modelCapabilities.ts`

```typescript
// 获取音频能力配置
getAudioCapability(modelId: string): AudioCapability | undefined

// 检查是否为音频模型
isAudioModel(modelId: string): boolean

// 获取支持的时长选项
getAvailableAudioDurations(modelId: string): number[]

// 获取最大时长限制
getMaxAudioDuration(modelId: string): number

// 检查是否支持自定义歌词
supportsCustomLyrics(modelId: string): boolean

// 检查是否支持纯音乐模式
supportsInstrumental(modelId: string): boolean

// 检查是否支持续写/延长
supportsAudioContinuation(modelId: string): boolean
```

## 3. AudioCompatibleAdapter 优化

### 3.1 增强的请求体构建
**文件**: `src/services/llm/AudioCompatibleAdapter.ts`

新增支持的参数：
- `duration` - 自动限制在模型最大值内
- `lyrics` / `custom_lyrics` / `prompt_lyrics` - 多字段兼容
- `style` / `tags` / `genre` - 风格标签多字段
- `title` - 歌曲标题
- `instrumental` / `make_instrumental` - 纯音乐模式
- `mode` - 'inspiration' | 'custom'
- `extend_from` / `continue_from` / `task_id` - 续写参数
- `voice_id` / `voice` - 声音选择
- `speed` / `speed_ratio` - 语速控制
- `language` - 语言设置
- `quality` - 音质选择
- `callback_url` - 异步回调
- `reference_audio` - 参考音频

### 3.2 智能参数验证
根据模型能力自动：
- 限制 duration 不超过模型支持的最大值
- 仅在模型支持时才添加 lyrics 参数
- 根据模型类型选择正确的参数字段

## 4. 模型注册表更新

### 4.1 modelPresets.ts
新增预设：
- Suno V4 / V3.5 / V3
- Udio V1
- Riffusion
- MiniMax TTS / Music

### 4.2 modelRegistry.ts
新增模型注册：
```typescript
'suno-v4': { type: 'audio', ... }
'suno-v3.5': { type: 'audio', ... }
'suno-v3': { type: 'audio', ... }
'udio-v1': { type: 'audio', ... }
'riffusion': { type: 'audio', ... }
'minimax-tts': { type: 'audio', ... }
'minimax-music': { type: 'audio', ... }
```

### 4.3 MODEL_DESCRIPTIONS
新增模型描述：
- Suno V3 / Udio V1 / Riffusion
- MiniMax Music
- Gemini 2.0 Flash Audio
- Lyria Music

## 5. 类型定义扩展

### 5.1 AudioGenerationOptions
**文件**: `src/services/llm/LLMAdapter.ts`

```typescript
export interface AudioGenerationOptions {
    // ... 原有参数 ...
    audioDuration?: string | number;  // 支持数字和字符串
    audioMode?: 'inspiration' | 'custom';  // 严格类型
    
    // 新增 providerConfig.audio 扩展
    providerConfig?: ProviderConfig & {
        audio?: {
            instrumental?: boolean;
            language?: string;
            quality?: 'standard' | 'high';
            callbackUrl?: string;
            referenceAudioUrl?: string;
        };
    };
}
```

## 6. 使用示例

### 6.1 Suno 音乐生成
```typescript
import { AudioCompatibleAdapter } from './services/llm/AudioCompatibleAdapter';

const adapter = new AudioCompatibleAdapter();
const result = await adapter.generateAudio({
    modelId: 'suno-v4',
    prompt: 'A happy pop song about summer',
    audioTitle: 'Summer Vibes',
    audioStyle: 'pop, upbeat, cheerful',
    audioLyrics: 'Verse 1: Sun is shining...',
    audioDuration: 180,  // 3分钟
    providerConfig: {
        audio: {
            instrumental: false,
            language: 'en',
            quality: 'high'
        }
    }
}, keySlot);
```

### 6.2 续写已有歌曲
```typescript
const result = await adapter.generateAudio({
    modelId: 'suno-v4',
    prompt: 'Continue the song with a chorus',
    audioExtendFrom: 'previous-task-id-123',
    audioDuration: 120
}, keySlot);
```

### 6.3 MiniMax TTS
```typescript
const result = await adapter.generateAudio({
    modelId: 'minimax-tts',
    prompt: '你好，这是中文语音合成测试',
    voiceId: 'zh_female_1',
    speed: 1.0,
    audioDuration: 60
}, keySlot);
```

### 6.4 获取模型能力
```typescript
import { 
    getAudioCapability, 
    getMaxAudioDuration,
    supportsCustomLyrics 
} from './services/model/modelCapabilities';

// 获取完整能力配置
const caps = getAudioCapability('suno-v4');
console.log(caps.maxDuration);  // 240

// 获取最大时长
const maxDur = getMaxAudioDuration('suno-v3.5');  // 180

// 检查是否支持歌词
const hasLyrics = supportsCustomLyrics('riffusion');  // false
```

## 7. 兼容性

- 所有现有音频生成功能保持向后兼容
- 新增参数均为可选，不影响现有代码
- 支持多种 API 格式（OpenAI 兼容、Suno、MiniMax 等）

## 8. 构建状态

✅ **构建成功** - 所有 TypeScript 类型检查通过
