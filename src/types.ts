export enum AspectRatio {
  AUTO = 'auto', // 自动匹配
  SQUARE = '1:1',
  PORTRAIT_1_8 = '1:8', // 🚀 New: Nano Banana 2 & Pro
  PORTRAIT_1_4 = '1:4', // 🚀 New: Nano Banana 2 & Pro
  PORTRAIT_3_4 = '3:4',
  PORTRAIT_4_5 = '4:5', // Gemini 3 Pro支持
  PORTRAIT_9_16 = '9:16',
  PORTRAIT_9_21 = '9:21', // Flux Mobile
  PORTRAIT_2_3 = '2:3',
  LANDSCAPE_4_3 = '4:3',
  LANDSCAPE_5_4 = '5:4', // Gemini 3 Pro支持
  LANDSCAPE_16_9 = '16:9',
  LANDSCAPE_21_9 = '21:9',
  LANDSCAPE_4_1 = '4:1', // 🚀 New: Nano Banana 2 & Pro
  LANDSCAPE_8_1 = '8:1', // 🚀 New: Nano Banana 2 & Pro
  LANDSCAPE_3_2 = '3:2',
  STANDARD_2_3 = '2:3', // Alias/Legacy
  STANDARD_3_2 = '3:2', // Alias/Legacy
}



export enum ImageSize {
  SIZE_05K = '0.5K', // 512px - Gemini 3.1 Flash Image 支持
  SIZE_1K = '1K',
  SIZE_2K = '2K',
  SIZE_4K = '4K',
}

// Model IDs are now dynamic strings, but keeping this for legacy ref if needed
// or just deprecated it completely.
// For now, let's keep it as string union or just string to allow custom models.
export type ModelType = string;

// ============================================
// 已知模型常量 - 图像和视频生成
// 参考: https://ai.google.dev/gemini-api/docs/pricing?hl=zh-cn
// ============================================
export const KnownModel = {
  // Imagen 4 系列 (最新)
  IMAGEN_4: 'imagen-4.0-generate-001',
  IMAGEN_4_ULTRA: 'imagen-4.0-ultra-generate-001',
  IMAGEN_4_FAST: 'imagen-4.0-fast-generate-001',

  // Imagen 3 系列
  IMAGEN_3: 'imagen-3.0-generate-001',
  IMAGEN_3_LEGACY: 'imagen-3.0-generate-002',

  // Gemini 原生图像生成系列
  GEMINI_2_5_FLASH_IMAGE: 'gemini-2.5-flash-image',
  GEMINI_3_PRO_IMAGE: 'gemini-3-pro-image-preview',

  // Veo 视频生成系列
  VEO_3_1: 'veo-3.1-generate-preview',
  VEO_3_1_FAST: 'veo-3.1-fast-generate-preview',
  VEO_3: 'veo-3.0-generate-001',
  VEO_3_FAST: 'veo-3.0-fast-generate-001',
  VEO_2: 'veo-2.0-generate-001',

  // Third Party Fallback
  DALLE_3: 'dall-e-3',
  MIDJOURNEY: 'midjourney',
}

export enum GenerationMode {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',  // 🚀 Audio Generation Mode
  PPT = 'ppt',      // 🚀 PPT Batch Image Mode
  EDIT = 'edit',    // 🚀 General Edit Mode (Recraft style transfer, Ideogram text editing)
  INPAINT = 'inpaint' // 🚀 Specific Mask-based Inpaint Mode
}

// ============================================
// 聊天模型类型
// 参考: https://ai.google.dev/gemini-api/docs/pricing?hl=zh-cn
// ============================================
export enum ChatModelType {
  // Gemini 2.5 系列 - 性价比最佳
  GEMINI_2_5_PRO = 'gemini-2.5-pro',
  GEMINI_2_5_FLASH = 'gemini-2.5-flash',
  GEMINI_2_5_FLASH_LITE = 'gemini-2.5-flash-lite',

  // Gemini 3 系列 - 最强智能
  GEMINI_3_PRO = 'gemini-3-pro-preview',
  GEMINI_3_FLASH = 'gemini-3-flash-preview',
}

export interface ReferenceImage {
  id: string;
  storageId?: string; // Content-based Hash ID for storage deduplication
  data: string; // Base64 or URL
  mimeType: string;
  url?: string; // Optional URL for thumbnail/reference
}

export interface GeneratedImage {
  id: string;
  storageId?: string; // Content-based Hash ID for storage deduplication
  url: string;
  originalUrl?: string; // High-res original (if different from url)
  prompt: string;
  aspectRatio: AspectRatio;
  imageSize?: ImageSize; // Image size/quality setting
  timestamp: number;
  model: ModelType;
  modelLabel?: string; // 🚀 模型显示名称（用户选择时看到的名字）
  canvasId: string;
  parentPromptId: string;
  position: { x: number; y: number };
  generationTime?: number; // Duration in ms
  dimensions?: string; // e.g. "1024x1024"
  mode?: GenerationMode; // New: track creation mode
  tags?: string[]; // Search tags
  tokens?: number; // New: Token usage
  cost?: number; // New: Estimated cost
  orphaned?: boolean; // 孤独副卡（无父节点）
  fileName?: string; // 原始文档名
  fileSize?: number; // 文档大小（字节）
  alias?: string; // 🚀 [New] 用户自定义备注名
  isGenerating?: boolean; // 🚀 [New] True when image is being generated
  error?: string; // 🚀 [New] Error message for failed generation
  mimeType?: string; // 🚀 [New] Image MIME type (e.g., 'image/png', 'image/jpeg')
  exactDimensions?: { width: number; height: number }; // 🚀 [New] Exact dimensions for AUTO mode
  provider?: string; // 🚀 [New] API Provider Name (e.g., Google, OpenAI)
  providerLabel?: string; // 🚀 [New] User-defined Channel Name (e.g. 'Google Official')
  keySlotId?: string;
  sourceReferenceStorageIds?: string[];
  requestPath?: string;
  requestBodyPreview?: string;
  pythonSnippet?: string;
  optimizedPromptEn?: string; // 🚀 [New] 存储优化后的英文提示词
  optimizedPromptZh?: string; // 🚀 [New] 存储优化后的中文解释
  // 🚀 [New] 完整的提示词编译器结果对象
  promptOptimizerResult?: PromptOptimizerResult;
}

export type Provider =
  | 'Google'
  | 'OpenAI'
  | 'Anthropic'
  | 'Volcengine' // 火山引擎
  | 'Aliyun'     // 阿里云
  | 'Tencent'    // 腾讯云
  | 'SiliconFlow'// 硅基流动
  | '12AI'        // 12AI 专属
  | 'Custom'      // 自定义
  | 'SystemProxy'; // 系统代理（积分模型）

export interface PromptOptimizerResult {
  raw_prompt_original: string;
  optimized_prompt_en: string;
  optimized_prompt_zh_display: string;
  negative_constraints?: string[];
  assumptions?: string[];
  params: {
    task_type: 'icon_set' | 'ecommerce_hero' | 'lifestyle_photo' | 'infographic' | 'logo' | 'ui' | 'other';
    subject: string;
    style?: string;
    composition?: string;
    lighting?: string;
    background?: string;
    materials?: string[];
    color_palette?: string[];
    aspect_ratio?: string;
  };
  ui_payload: {
    tabs: { id: string; label_zh: string; label_en: string }[];
    default_tab: string;
  };
  meta: {
    version: string;
    timestamp: string;
  };
}

export interface PromptNode {
  id: string;
  prompt: string;
  originalPrompt?: string;
  optimizedPromptEn?: string;
  optimizedPromptZh?: string;
  promptOptimizerResult?: PromptOptimizerResult; // 🚀 [New] 完整编译器结果
  promptOptimizationEnabled?: boolean;
  thinkingMode?: 'minimal' | 'high';
  enableGrounding?: boolean;
  enableImageSearch?: boolean;
  position: { x: number; y: number };
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  model: ModelType;
  modelLabel?: string; // 🚀 模型显示名称（用户选择时看到的名字）
  provider?: string; // 🚀 生成信道 provider（内部标识）
  providerLabel?: string; // 🚀 生成信道显示名称（例如“反代”）
  keySlotId?: string;
  childImageIds: string[];
  lastGenerationSuccessCount?: number;
  lastGenerationFailCount?: number;
  lastGenerationTotalCount?: number;
  referenceImages?: ReferenceImage[];
  timestamp: number;
  sourceImageId?: string;
  isGenerating?: boolean;
  parallelCount?: number; // Number of images being generated
  error?: string;
  errorDetails?: {
    code?: string;
    status?: number;
    requestPath?: string;
    requestBody?: string;
    responseBody?: string;
    provider?: string;
    model?: string;
    timestamp?: number;
  };
  // 🚀 [添加] 积分退回状态，用于显示"生成失败，积分已退回"
  refundStatus?: 'pending' | 'success' | 'failed';

  mode?: GenerationMode; // New
  width?: number; // Dynamic width for layout calculation
  height?: number; // Dynamic height for connection line anchoring
  tags?: string[]; // Search tags
  isDraft?: boolean; // Preview/Draft state
  orphaned?: boolean; // 孤独主卡（拖动pending卡转换而来）
  userMoved?: boolean; // 🚀 [New] 是否被用户手动移动过（用于智能归位逻辑）

  // Video specific
  videoResolution?: string;
  videoDuration?: string;
  videoFirstFrameUrl?: string; // Optional image to use as start frame
  videoLastFrameUrl?: string;  // Optional image to use as end frame
  videoAudio?: boolean; // Whether to generate audio for the video

  // Audio specific
  audioDuration?: string; // e.g. '120s' or 'auto'
  audioLyrics?: string;     // custom lyrics for music generation
  pptSlides?: string[];
  pptStyleLocked?: boolean;

  // 🚀 Image Editing specific properties
  maskUrl?: string;

  // Analytics
  cost?: number; // Estimated or actual cost
  isPaymentProcessed?: boolean; // 🚀 [New] 是否已成功执行扣费，用于失败退回判定

  // 🚀 [Persistence Management]
  jobId?: string; // 任务 ID (用于异步轮询和刷新恢复)
  isNew?: boolean; // 🚀 [New] 是否为新生成的节点（用于触发飞出动画）
  generationMetadata?: any; // 生成上下文元数据
}

export interface CanvasGroup {
  id: string;
  nodeIds: string[]; // IDs of PromptNodes or ImageNodes
  bounds: { x: number; y: number; width: number; height: number };
  label?: string;
  color?: string; // Border color
  type: 'custom';
}

export interface CanvasDrawing {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
  type: 'pen' | 'marker';
}

export interface Canvas {
  id: string;
  name: string;
  folderName?: string;
  promptNodes: PromptNode[];
  imageNodes: GeneratedImage[];
  groups: CanvasGroup[];
  drawings: CanvasDrawing[];
  lastModified: number;
}

/**
 * 视频分辨率与支持时长的映射
 * 根据官方文档: https://ai.google.dev/gemini-api/docs/video?hl=zh-cn
 * - 720p: 支持 4s, 6s, 8s
 * - 1080p: 仅支持 8s
 * - 4k: 仅支持 8s
 */
export const VIDEO_RESOLUTION_DURATION_MAP = {
  '720p': ['4s', '6s', '8s'],
  '1080p': ['8s'],
  '4k': ['8s']
} as const;

export interface GenerationConfig {
  prompt: string;
  enablePromptOptimization?: boolean;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  referenceImages: ReferenceImage[];
  parallelCount: number;
  model: ModelType;
  enableGrounding: boolean;
  enableImageSearch?: boolean;
  thinkingMode?: 'minimal' | 'high';
  mode: GenerationMode;
  // 视频配置字段
  videoResolution?: string; // '720p' | '1080p' | '4k'
  videoDuration?: string;   // 根据分辨率动态支持：720p支持4s/6s/8s，1080p和4k仅支持8s
  videoAudio?: boolean;     //生成音频
  // 图像编辑扩展
  maskUrl?: string;         // Base64 蒙版图片 (Inpaint)
  editMode?: 'inpaint' | 'outpaint' | 'vectorize' | 'reframe' | 'upscale' | 'replace-background' | 'edit';
  // 音频扩展
  audioDuration?: string;
  audioLyrics?: string;
  pptSlides?: string[];
  pptStyleLocked?: boolean;
}
