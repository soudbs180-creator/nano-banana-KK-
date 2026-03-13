import type {
  GeneratedImage,
  PptEditableImageLayer,
  PptEditableLayer,
  PptEditableLayerRole,
  PptEditablePage,
  PptEditableTextLayer,
  PromptNode,
} from '../types';
import { buildPptPageAlias, parsePptOutlineLine } from './pptUtils';

export const PPT_EDITABLE_CANVAS = {
  width: 1920,
  height: 1080,
} as const;

const PPT_IMAGE_SORT_RE = /(\d+)/;

const parseSortOrder = (value?: string) => {
  if (!value) return Number.POSITIVE_INFINITY;
  const match = value.match(PPT_IMAGE_SORT_RE);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
};

export const sortPptImageNodes = (images: GeneratedImage[]) => {
  return [...images].sort((a, b) => {
    const orderDiff = parseSortOrder(a.alias) - parseSortOrder(b.alias);
    if (Number.isFinite(orderDiff) && orderDiff !== 0) return orderDiff;
    return (a.timestamp || 0) - (b.timestamp || 0);
  });
};

const createBackgroundLayer = (image: GeneratedImage, pageIndex: number): PptEditableImageLayer => ({
  id: `page-${pageIndex + 1}-background`,
  name: 'Background',
  type: 'image',
  role: 'background',
  visible: true,
  locked: true,
  zIndex: 0,
  x: 0,
  y: 0,
  width: PPT_EDITABLE_CANVAS.width,
  height: PPT_EDITABLE_CANVAS.height,
  opacity: 1,
  imageNodeId: image.id,
  sourceUrl: image.originalUrl || image.url,
});

const createTextLayer = (
  pageIndex: number,
  role: Exclude<PptEditableLayerRole, 'background'>,
  name: string,
  text: string,
  zIndex: number,
  rect: { x: number; y: number; width: number; height: number },
  style: Partial<PptEditableTextLayer>,
): PptEditableTextLayer => ({
  id: `page-${pageIndex + 1}-${role}`,
  name,
  type: 'text',
  role,
  visible: role === 'body' ? Boolean(text.trim()) : true,
  locked: false,
  zIndex,
  x: rect.x,
  y: rect.y,
  width: rect.width,
  height: rect.height,
  opacity: 1,
  text,
  fontSize: style.fontSize ?? 24,
  fontWeight: style.fontWeight,
  color: style.color ?? '#ffffff',
  align: style.align ?? 'left',
  backgroundColor: style.backgroundColor,
  backgroundOpacity: style.backgroundOpacity,
});

const createDefaultPage = (
  image: GeneratedImage,
  rawOutline: string | undefined,
  pageIndex: number,
): PptEditablePage => {
  const parsed = parsePptOutlineLine(rawOutline);
  const title = parsed.title || buildPptPageAlias(rawOutline, pageIndex);
  const subtitle = parsed.subtitle || '';

  return {
    id: `ppt-page-${pageIndex + 1}`,
    pageIndex,
    name: buildPptPageAlias(rawOutline, pageIndex),
    outline: rawOutline || title,
    backgroundImageId: image.id,
    notes: '',
    layers: [
      createBackgroundLayer(image, pageIndex),
      createTextLayer(
        pageIndex,
        'title',
        'Title',
        title,
        10,
        { x: 72, y: 56, width: 1776, height: 128 },
        {
          fontSize: 44,
          fontWeight: 700,
          color: '#ffffff',
          backgroundColor: '#111827',
          backgroundOpacity: 0.44,
        },
      ),
      createTextLayer(
        pageIndex,
        'subtitle',
        'Subtitle',
        subtitle,
        20,
        { x: 72, y: 196, width: 1776, height: 108 },
        {
          fontSize: 28,
          color: '#e5e7eb',
          backgroundColor: '#0f172a',
          backgroundOpacity: 0.28,
        },
      ),
      createTextLayer(
        pageIndex,
        'body',
        'Body',
        '',
        30,
        { x: 96, y: 336, width: 1728, height: 420 },
        {
          fontSize: 22,
          color: '#f8fafc',
          backgroundColor: '#0f172a',
          backgroundOpacity: 0.18,
        },
      ),
    ],
  };
};

const isImageLayer = (layer: PptEditableLayer): layer is PptEditableImageLayer => layer.type === 'image';
const isTextLayer = (layer: PptEditableLayer): layer is PptEditableTextLayer => layer.type === 'text';

const mergePageLayers = (
  fallbackPage: PptEditablePage,
  existingPage: PptEditablePage | undefined,
  image: GeneratedImage,
): PptEditableLayer[] => {
  const existingLayers = existingPage?.layers || [];
  const fallbackByRole = new Map<string, PptEditableLayer>(
    fallbackPage.layers.map((layer) => [`${layer.type}:${layer.role}`, layer] as const),
  );

  const merged = fallbackPage.layers.map((fallbackLayer) => {
    const key = `${fallbackLayer.type}:${fallbackLayer.role}`;
    const existingLayer = existingLayers.find((layer) => `${layer.type}:${layer.role}` === key);
    if (!existingLayer) return fallbackLayer;

    if (fallbackLayer.type === 'image') {
      const imageLayer: PptEditableImageLayer = {
        ...fallbackLayer,
        ...(isImageLayer(existingLayer) ? existingLayer : {}),
        type: 'image',
        imageNodeId: image.id,
        sourceUrl: image.originalUrl || image.url,
      };
      return imageLayer;
    }

    const textLayer: PptEditableTextLayer = {
      ...fallbackLayer,
      ...(isTextLayer(existingLayer) ? existingLayer : {}),
      type: 'text',
      text: isTextLayer(existingLayer) ? existingLayer.text : fallbackLayer.text,
    };
    return textLayer;
  });

  const extras = existingLayers.filter((layer) => {
    const key = `${layer.type}:${layer.role}`;
    return !fallbackByRole.has(key);
  });

  return [...merged, ...extras].sort((a, b) => a.zIndex - b.zIndex);
};

export const buildPptEditablePages = (
  node: PromptNode,
  images: GeneratedImage[],
): PptEditablePage[] => {
  const orderedImages = sortPptImageNodes(images).slice(0, 20);
  const rawSlides = node.pptSlides || [];
  const existingPages = node.pptEditablePages || [];

  return orderedImages.map((image, index) => {
    const fallbackPage = createDefaultPage(image, rawSlides[index] || image.alias, index);
    const existingPage = existingPages[index];
    const layers = mergePageLayers(fallbackPage, existingPage, image);
    const outline = existingPage?.outline || rawSlides[index] || fallbackPage.outline;

    return {
      ...fallbackPage,
      ...existingPage,
      pageIndex: index,
      name: existingPage?.name || fallbackPage.name,
      outline,
      backgroundImageId: image.id,
      layers,
    };
  });
};

export const sortPptLayers = (layers: PptEditableLayer[]) => {
  return [...layers].sort((a, b) => a.zIndex - b.zIndex);
};

export const getPptTextLayer = (
  page: PptEditablePage,
  role: Exclude<PptEditableLayerRole, 'background'>,
) => {
  return page.layers.find(
    (layer): layer is PptEditableTextLayer => layer.type === 'text' && layer.role === role,
  );
};

export const syncPptSlidesFromEditablePages = (pages: PptEditablePage[]) => {
  return pages.map((page, index) => {
    const title = getPptTextLayer(page, 'title')?.text.trim() || buildPptPageAlias(page.name, index);
    const subtitle = getPptTextLayer(page, 'subtitle')?.text.trim() || '';
    if (!subtitle) return title;
    return `${title}: ${subtitle}`;
  });
};

export const clonePptEditablePages = (pages: PptEditablePage[]) => {
  return pages.map((page) => ({
    ...page,
    layers: page.layers.map((layer) => ({ ...layer })),
  }));
};

export const patchPptTextLayer = (
  page: PptEditablePage,
  role: Exclude<PptEditableLayerRole, 'background'>,
  text: string,
) => {
  const layers = page.layers.map((layer) => {
    if (layer.type === 'text' && layer.role === role) {
      return {
        ...layer,
        text,
        visible: role === 'body' ? Boolean(text.trim()) || layer.visible : layer.visible,
      };
    }
    return layer;
  });

  const nextPage = {
    ...page,
    layers,
  };

  const title = getPptTextLayer(nextPage, 'title')?.text.trim();
  nextPage.name = title || page.name;
  nextPage.outline = syncPptSlidesFromEditablePages([nextPage])[0];

  return nextPage;
};
