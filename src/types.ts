export enum AspectRatio {
  AUTO = 'auto', // 鑷姩鍖归厤
  SQUARE = '1:1',
  PORTRAIT_1_8 = '1:8', // 馃殌 New: Nano Banana 2 & Pro
  PORTRAIT_1_4 = '1:4', // 馃殌 New: Nano Banana 2 & Pro
  PORTRAIT_3_4 = '3:4',
  PORTRAIT_4_5 = '4:5', // Gemini 3 Pro鏀寔
  PORTRAIT_9_16 = '9:16',
  PORTRAIT_9_21 = '9:21', // Flux Mobile
  PORTRAIT_2_3 = '2:3',
  LANDSCAPE_4_3 = '4:3',
  LANDSCAPE_5_4 = '5:4', // Gemini 3 Pro鏀寔
  LANDSCAPE_16_9 = '16:9',
  LANDSCAPE_21_9 = '21:9',
  LANDSCAPE_4_1 = '4:1', // 馃殌 New: Nano Banana 2 & Pro
  LANDSCAPE_8_1 = '8:1', // 馃殌 New: Nano Banana 2 & Pro
  LANDSCAPE_3_2 = '3:2',
  STANDARD_2_3 = '2:3', // Alias/Legacy
  STANDARD_3_2 = '3:2', // Alias/Legacy
}



export enum ImageSize {
  SIZE_05K = '0.5K', // 512px - Gemini 3.1 Flash Image 鏀寔
  SIZE_1K = '1K',
  SIZE_2K = '2K',
  SIZE_4K = '4K',
}

// Model IDs are now dynamic strings, but keeping this for legacy ref if needed
// or just deprecated it completely.
// For now, let's keep it as string union or just string to allow custom models.
export type ModelType = string;

export type AppSurface = 'workspace' | 'library' | 'chat' | 'settings' | 'profile';

export type WorkspacePanel = 'history' | 'details' | 'chat' | 'quick-settings' | null;

export type MobilePrimaryTab = 'create' | 'library' | 'chat' | 'me';

// ============================================
// 宸茬煡妯″瀷甯搁噺 - 鍥惧儚鍜岃棰戠敓鎴?
// 鍙傝€? https://ai.google.dev/gemini-api/docs/pricing?hl=zh-cn
// ============================================
export const KnownModel = {
  // Imagen 4 绯诲垪 (鏈€鏂?
  IMAGEN_4: 'imagen-4.0-generate-001',
  IMAGEN_4_ULTRA: 'imagen-4.0-ultra-generate-001',
  IMAGEN_4_FAST: 'imagen-4.0-fast-generate-001',

  // Imagen 3 绯诲垪
  IMAGEN_3: 'imagen-3.0-generate-001',
  IMAGEN_3_LEGACY: 'imagen-3.0-generate-002',

  // Gemini 鍘熺敓鍥惧儚鐢熸垚绯诲垪
  GEMINI_2_5_FLASH_IMAGE: 'gemini-2.5-flash-image',
  GEMINI_3_PRO_IMAGE: 'gemini-3-pro-image-preview',

  // Veo 瑙嗛鐢熸垚绯诲垪
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
  AUDIO = 'audio',  // 馃殌 Audio Generation Mode
  PPT = 'ppt',      // 馃殌 PPT Batch Image Mode
  EDIT = 'edit',    // 馃殌 General Edit Mode (Recraft style transfer, Ideogram text editing)
  INPAINT = 'inpaint' // 馃殌 Specific Mask-based Inpaint Mode
}

// ============================================
// 鑱婂ぉ妯″瀷绫诲瀷
// 鍙傝€? https://ai.google.dev/gemini-api/docs/pricing?hl=zh-cn
// ============================================
export enum ChatModelType {
  // Gemini 2.5 绯诲垪 - 鎬т环姣旀渶浣?
  GEMINI_2_5_PRO = 'gemini-2.5-pro',
  GEMINI_2_5_FLASH = 'gemini-2.5-flash',
  GEMINI_2_5_FLASH_LITE = 'gemini-2.5-flash-lite',

  // Gemini 3 绯诲垪 - 鏈€寮烘櫤鑳?
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
  modelLabel?: string; // Display label captured at generation time
  modelColorStart?: string;
  modelColorEnd?: string;
  modelColorSecondary?: string;
  modelTextColor?: 'white' | 'black';
  canvasId: string;
  parentPromptId: string;
  position: { x: number; y: number };
  generationTime?: number; // Duration in ms
  dimensions?: string; // e.g. "1024x1024"
  mode?: GenerationMode; // New: track creation mode
  tags?: string[]; // Search tags
  tokens?: number; // New: Token usage
  cost?: number; // New: Estimated cost
  orphaned?: boolean; // 瀛ょ嫭鍓崱锛堟棤鐖惰妭鐐癸級
  fileName?: string; // 鍘熷鏂囨。鍚?
  fileSize?: number; // 鏂囨。澶у皬锛堝瓧鑺傦級
  alias?: string; // 馃殌 [New] 鐢ㄦ埛鑷畾涔夊娉ㄥ悕
  isGenerating?: boolean; // 馃殌 [New] True when image is being generated
  error?: string; // 馃殌 [New] Error message for failed generation
  mimeType?: string; // 馃殌 [New] Image MIME type (e.g., 'image/png', 'image/jpeg')
  exactDimensions?: { width: number; height: number }; // 馃殌 [New] Exact dimensions for AUTO mode
  provider?: string; // 馃殌 [New] API Provider Name (e.g., Google, OpenAI)
  providerLabel?: string; // 馃殌 [New] User-defined Channel Name (e.g. 'Google Official')
  keySlotId?: string;
  sourceReferenceStorageIds?: string[];
  requestPath?: string;
  requestBodyPreview?: string;
  pythonSnippet?: string;
  optimizedPromptEn?: string; // 馃殌 [New] 瀛樺偍浼樺寲鍚庣殑鑻辨枃鎻愮ず璇?
  optimizedPromptZh?: string; // 馃殌 [New] 瀛樺偍浼樺寲鍚庣殑涓枃瑙ｉ噴
  // 馃殌 [New] 瀹屾暣鐨勬彁绀鸿瘝缂栬瘧鍣ㄧ粨鏋滃璞?
  promptOptimizerResult?: PromptOptimizerResult;

  // 馃殌 [Layering] Z-index for rendering order
  zIndex?: number;
}

export type Provider =
  | 'Google'
  | 'OpenAI'
  | 'Anthropic'
  | 'Volcengine' // 鐏北寮曟搸
  | 'Aliyun'     // 闃块噷浜?
  | 'Tencent'    // 鑵捐浜?
  | 'SiliconFlow'// 纭呭熀娴佸姩
  | '12AI'        // 12AI 涓撳睘
  | 'Custom'      // 鑷畾涔?
  | 'SystemProxy'; // 绯荤粺浠ｇ悊锛堢Н鍒嗘ā鍨嬶級

export interface PromptOptimizerResult {
  raw_prompt_original: string;
  optimized_prompt_en: string;
  optimized_prompt_zh_display: string;
  negative_constraints?: string[];
  assumptions?: string[];
  validation_checks?: string[];
  missing_inputs?: string[];
  confidence?: 'low' | 'medium' | 'high';
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
    optimization_mode?: PromptOptimizationMode;
    template_id?: string;
    template_title?: string;
    strategy?: 'reasoning-native' | 'structure-first';
    validation_status?: 'ready' | 'needs-review';
  };
}

export type PromptOptimizationMode = 'auto' | 'custom';

export type PptEditableLayerType = 'image' | 'text';

export type PptEditableLayerRole =
  | 'background'
  | 'title'
  | 'subtitle'
  | 'body'
  | 'caption'
  | 'custom';

export interface PptEditableLayerBase {
  id: string;
  name: string;
  type: PptEditableLayerType;
  role: PptEditableLayerRole;
  visible: boolean;
  locked?: boolean;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
}

export interface PptEditableImageLayer extends PptEditableLayerBase {
  type: 'image';
  imageNodeId?: string;
  sourceUrl?: string;
}

export interface PptEditableTextLayer extends PptEditableLayerBase {
  type: 'text';
  text: string;
  fontSize: number;
  fontWeight?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  backgroundColor?: string;
  backgroundOpacity?: number;
}

export type PptEditableLayer = PptEditableImageLayer | PptEditableTextLayer;

export interface PptEditablePage {
  id: string;
  pageIndex: number;
  name: string;
  outline: string;
  notes?: string;
  backgroundImageId?: string;
  layers: PptEditableLayer[];
}

export interface PromptNode {
  id: string;
  prompt: string;
  originalPrompt?: string;
  optimizedPromptEn?: string;
  optimizedPromptZh?: string;
  promptOptimizerResult?: PromptOptimizerResult; // 馃殌 [New] 瀹屾暣缂栬瘧鍣ㄧ粨鏋?
  promptOptimizationEnabled?: boolean;
  thinkingMode?: 'minimal' | 'high';
  enableGrounding?: boolean;
  enableImageSearch?: boolean;
  position: { x: number; y: number };
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  model: ModelType;
  modelLabel?: string; // 馃殌 妯″瀷鏄剧ず鍚嶇О锛堢敤鎴烽€夋嫨鏃剁湅鍒扮殑鍚嶅瓧锛?
  provider?: string; // 馃殌 鐢熸垚淇￠亾 provider锛堝唴閮ㄦ爣璇嗭級
  providerLabel?: string; // 馃殌 鐢熸垚淇￠亾鏄剧ず鍚嶇О锛堜緥濡傗€滃弽浠ｂ€濓級
  modelColorStart?: string;
  modelColorEnd?: string;
  modelColorSecondary?: string;
  modelTextColor?: 'white' | 'black';
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
  // 馃殌 [娣诲姞] 绉垎閫€鍥炵姸鎬侊紝鐢ㄤ簬鏄剧ず"鐢熸垚澶辫触锛岀Н鍒嗗凡閫€鍥?
  refundStatus?: 'pending' | 'success' | 'failed';

  mode?: GenerationMode; // New
  width?: number; // Dynamic width for layout calculation
  height?: number; // Dynamic height for connection line anchoring
  tags?: string[]; // Search tags
  isDraft?: boolean; // Preview/Draft state
  orphaned?: boolean; // 瀛ょ嫭涓诲崱锛堟嫋鍔╬ending鍗¤浆鎹㈣€屾潵锛?
  userMoved?: boolean; // 馃殌 [New] 鏄惁琚敤鎴锋墜鍔ㄧЩ鍔ㄨ繃锛堢敤浜庢櫤鑳藉綊浣嶉€昏緫锛?

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
  pptEditablePages?: PptEditablePage[];
  pptStyleLocked?: boolean;

  // 馃殌 Image Editing specific properties
  maskUrl?: string;

  // Analytics
  cost?: number; // Estimated or actual cost
  isPaymentProcessed?: boolean; // 馃殌 [New] 鏄惁宸叉垚鍔熸墽琛屾墸璐癸紝鐢ㄤ簬澶辫触閫€鍥炲垽瀹?

  // 馃殌 [Persistence Management]
  jobId?: string; // 浠诲姟 ID (鐢ㄤ簬寮傛杞鍜屽埛鏂版仮澶?
  isNew?: boolean; // 馃殌 [New] 鏄惁涓烘柊鐢熸垚鐨勮妭鐐癸紙鐢ㄤ簬瑙﹀彂椋炲嚭鍔ㄧ敾锛?
  generationMetadata?: any; // 鐢熸垚涓婁笅鏂囧厓鏁版嵁

  // 馃殌 [Layering] Z-index for rendering order
  zIndex?: number;
}

export interface CanvasGroup {
  id: string;
  nodeIds: string[]; // IDs of PromptNodes or ImageNodes
  bounds: { x: number; y: number; width: number; height: number };
  // 馃殌 [Layering] Z-index for rendering order
  zIndex?: number;
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
 * 瑙嗛鍒嗚鲸鐜囦笌鏀寔鏃堕暱鐨勬槧灏?
 * 鏍规嵁瀹樻柟鏂囨。: https://ai.google.dev/gemini-api/docs/video?hl=zh-cn
 * - 720p: 鏀寔 4s, 6s, 8s
 * - 1080p: 浠呮敮鎸?8s
 * - 4k: 浠呮敮鎸?8s
 */
export const VIDEO_RESOLUTION_DURATION_MAP = {
  '720p': ['4s', '6s', '8s'],
  '1080p': ['8s'],
  '4k': ['8s']
} as const;

export interface GenerationConfig {
  prompt: string;
  enablePromptOptimization?: boolean;
  promptOptimizationMode?: PromptOptimizationMode;
  promptOptimizationTemplateId?: string;
  promptOptimizationCustomPrompt?: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  referenceImages: ReferenceImage[];
  parallelCount: number;
  model: ModelType;
  enableGrounding: boolean;
  enableImageSearch?: boolean;
  thinkingMode?: 'minimal' | 'high';
  mode: GenerationMode;
  // 瑙嗛閰嶇疆瀛楁
  videoResolution?: string; // '720p' | '1080p' | '4k'
  videoDuration?: string;   // 鏍规嵁鍒嗚鲸鐜囧姩鎬佹敮鎸侊細720p鏀寔4s/6s/8s锛?080p鍜?k浠呮敮鎸?s
  videoAudio?: boolean;     //鐢熸垚闊抽
  // 鍥惧儚缂栬緫鎵╁睍
  maskUrl?: string;         // Base64 钂欑増鍥剧墖 (Inpaint)
  editMode?: 'inpaint' | 'outpaint' | 'vectorize' | 'reframe' | 'upscale' | 'replace-background' | 'edit';
  // 闊抽鎵╁睍
  audioDuration?: string;
  audioLyrics?: string;
  pptSlides?: string[];
  pptStyleLocked?: boolean;
}


