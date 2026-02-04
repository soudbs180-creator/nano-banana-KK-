export enum AspectRatio {
  AUTO = 'auto', // 自动匹配
  SQUARE = '1:1',
  PORTRAIT_3_4 = '3:4',
  PORTRAIT_4_5 = '4:5', // Gemini 3 Pro支持
  PORTRAIT_9_16 = '9:16',
  PORTRAIT_9_21 = '9:21', // Flux Mobile
  PORTRAIT_2_3 = '2:3',
  LANDSCAPE_4_3 = '4:3',
  LANDSCAPE_5_4 = '5:4', // Gemini 3 Pro支持
  LANDSCAPE_16_9 = '16:9',
  LANDSCAPE_21_9 = '21:9',
  LANDSCAPE_3_2 = '3:2',
  STANDARD_2_3 = '2:3', // Alias/Legacy
  STANDARD_3_2 = '3:2', // Alias/Legacy
}



export enum ImageSize {
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
  data: string; // Base64
  mimeType: string;
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
  fileName?: string; // 原始文件名
  fileSize?: number; // 文件大小（字节）
}

export interface PromptNode {
  id: string;
  prompt: string;
  position: { x: number; y: number };
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  model: ModelType;
  modelLabel?: string; // 🚀 模型显示名称（用户选择时看到的名字）
  childImageIds: string[];
  referenceImages?: ReferenceImage[];
  timestamp: number;
  sourceImageId?: string;
  isGenerating?: boolean;
  parallelCount?: number; // Number of images being generated
  error?: string;
  mode?: GenerationMode; // New
  height?: number; // Dynamic height for connection line anchoring
  tags?: string[]; // Search tags
  isDraft?: boolean; // Preview/Draft state
  orphaned?: boolean; // 孤独主卡（拖动pending卡转换而来）
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
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  referenceImages: ReferenceImage[];
  parallelCount: number;
  model: ModelType;
  enableGrounding: boolean;
  mode: GenerationMode;
  // 视频配置字段
  videoResolution?: string; // '720p' | '1080p' | '4k'
  videoDuration?: string;   // 根据分辨率动态支持：720p支持4s/6s/8s，1080p和4k仅支持8s
  videoAudio?: boolean;     //生成音频
}
