export enum AspectRatio {
  SQUARE = '1:1',
  PORTRAIT_3_4 = '3:4',
  PORTRAIT_9_16 = '9:16',
  PORTRAIT_9_21 = '9:21', // Flux Mobile
  PORTRAIT_2_3 = '2:3',
  LANDSCAPE_4_3 = '4:3',
  LANDSCAPE_16_9 = '16:9',
  LANDSCAPE_21_9 = '21:9',
  LANDSCAPE_3_2 = '3:2',
  STANDARD_2_3 = '2:3', // Alias/Legacy
  STANDARD_3_2 = '3:2', // Alias/Legacy
}

/**
 * API Line Mode - determines which API endpoint to use
 * - google_direct: Use Google official API (default, blue color)
 * - proxy: Use third-party proxy API with OpenAI-compatible format (purple color)
 */
export type ApiLineMode = 'google_direct' | 'proxy';

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
  IMAGEN_3: 'imagen-3.0-generate-002',
  IMAGEN_3_LEGACY: 'imagen-3.0-generate-001',

  // Gemini Image 系列 (原生图像生成)
  GEMINI_2_5_FLASH_IMAGE: 'gemini-2.5-flash-image',
  GEMINI_3_PRO_IMAGE: 'gemini-3-pro-image-preview',

  // Gemini 多模态 (兼容图像生成)
  GEMINI_2_FLASH: 'gemini-2.0-flash-exp',

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
  // Flash Lite - 最快速、最轻量
  GEMINI_LITE = 'gemini-flash-lite-latest',

  // Flash 系列 - 速度优先
  GEMINI_FLASH = 'gemini-flash-latest',
  GEMINI_2_5_FLASH = 'gemini-2.5-flash',
  GEMINI_2_5_FLASH_LITE = 'gemini-2.5-flash-lite',

  // Gemini 3 系列 (预览版)
  GEMINI_3_FLASH = 'gemini-3-flash-preview',
  GEMINI_3_PRO = 'gemini-3-pro-preview',
}

export interface ReferenceImage {
  id: string;
  data: string; // Base64
  mimeType: string;
}

export interface GeneratedImage {
  id: string;
  url: string;
  originalUrl?: string; // High-res original (if different from url)
  prompt: string;
  aspectRatio: AspectRatio;
  timestamp: number;
  model: ModelType;
  canvasId: string;
  parentPromptId: string;
  position: { x: number; y: number };
  generationTime?: number; // Duration in ms
  dimensions?: string; // e.g. "1024x1024"
  mode?: GenerationMode; // New: track creation mode
}

export interface PromptNode {
  id: string;
  prompt: string;
  position: { x: number; y: number };
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  model: ModelType;
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

export interface GenerationConfig {
  prompt: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  referenceImages: ReferenceImage[];
  parallelCount: number;
  model: ModelType;
  enableGrounding: boolean;
  mode: GenerationMode;
  /** API line mode: google_direct (default) or proxy */
  lineMode: ApiLineMode;
}
