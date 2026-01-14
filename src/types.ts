export enum AspectRatio {
  SQUARE = '1:1',
  PORTRAIT_3_4 = '3:4',
  PORTRAIT_9_16 = '9:16',
  LANDSCAPE_4_3 = '4:3',
  LANDSCAPE_16_9 = '16:9',
  LANDSCAPE_21_9 = '21:9',
  STANDARD_2_3 = '2:3',
  STANDARD_3_2 = '3:2',
}

export enum ImageSize {
  SIZE_1K = '1K',
  SIZE_2K = '2K',
  SIZE_4K = '4K',
}

export enum ModelType {
  NANO_BANANA = 'gemini-2.0-flash-preview-image-generation',
  PRO_QUALITY = 'imagen-3.0-generate-001',
}

export interface ReferenceImage {
  id: string;
  data: string; // Base64
  mimeType: string;
}

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  aspectRatio: AspectRatio;
  timestamp: number;
  model: ModelType;
  canvasId: string;
  parentPromptId: string;
  position: { x: number; y: number };
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
}

export interface Canvas {
  id: string;
  name: string;
  promptNodes: PromptNode[];
  imageNodes: GeneratedImage[];
  lastModified: number;
}

export interface GenerationConfig {
  prompt: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  referenceImages: ReferenceImage[];
  parallelCount: number;
  model: ModelType;
}
