import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { ChevronRight, Download, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { GeneratedImage, GenerationMode, PromptNode } from '../types';
import { getModelDisplayName } from '../services/model/modelCapabilities';
import { getModelCredits, isCreditBasedModel } from '../services/model/modelPricing';
import { notify } from '../services/system/notificationService';
import { generateTagColor } from '../utils/colorUtils';

interface MobileCardGroup {
  id: string;
  prompt: PromptNode | null;
  images: GeneratedImage[];
  timestamp: number;
  label: string;
}

interface MobileChatFeedProps {
  promptNodes: PromptNode[];
  imageNodes: GeneratedImage[];
  onPromptPositionChange: (id: string, pos: { x: number; y: number }) => void;
  onPromptSelect: (nodeId: string) => void;
  onPromptClick: (node: PromptNode, isOptimizedView?: boolean) => void | Promise<void>;
  onPromptCancel: (nodeId: string) => void;
  onPromptRetry: (node: PromptNode) => void | Promise<void>;
  onPromptDelete: (nodeId: string) => void;
  onPromptDisconnect: (imageId: string) => void;
  onPromptUpdate: (node: PromptNode) => void;
  onPromptHeightChange: (id: string, height: number) => void;
  onPromptPin: (id: string, mode: 'button' | 'drag') => void;
  onPromptRemoveTag: (id: string, tag: string) => void;
  onPromptEditPptDeck?: (node: PromptNode) => void | Promise<void>;
  onPromptExportPpt?: (node: PromptNode) => void | Promise<void>;
  onPromptExportPptx?: (node: PromptNode) => void | Promise<void>;
  onPromptRetryPptPage?: (node: PromptNode, pageIndex: number) => void | Promise<void>;
  onPromptExportPptPage?: (node: PromptNode, pageIndex: number) => void | Promise<void>;
  onOpenStorageSettings: () => void;
  selectedNodeIds: string[];
  actualChildImagesByPromptId: Map<string, GeneratedImage[]>;
  getNodeIoTrace?: (id: string) => any;
  onImagePositionChange: (id: string, pos: { x: number; y: number }) => void;
  onImageDelete: (id: string) => void;
  onImageClick: (id: string) => void;
  onImageSelect: (id: string) => void;
  onImageUpdate: (id: string, updates: Partial<GeneratedImage>) => void;
  onImageDimensionsUpdate: (id: string, dims: string) => void;
  onImagePreview: (id: string) => void;
  activeSourceImage: string | null;
  highlightedId?: string | null;
  nowTimestamp: number;
}

const COPY = {
  headerEyebrow: 'AI Studio',
  headerTitle: '\u521b\u4f5c\u5361\u7ec4',
  headerOrder: '\u6309\u65f6\u95f4\u6392\u5e8f',
  groupUnit: '\u7ec4',
  ready: 'Ready',
  emptyTitle: '\u4ece\u5e95\u90e8\u8f93\u5165\u63d0\u793a\u8bcd\u5f00\u59cb\u521b\u4f5c',
  emptyBody: '\u624b\u673a\u7aef\u53ea\u4fdd\u7559\u4e3b\u5361\u548c\u526f\u5361\u5361\u7ec4\uff0c\u6d4f\u89c8\u3001\u5220\u9664\u3001\u4e0b\u8f7d\u90fd\u66f4\u76f4\u63a5\u3002',
  untitledGroup: '\u672a\u547d\u540d\u5361\u7ec4',
  standaloneSubCard: '\u72ec\u7acb\u526f\u5361',
  generating: '\u751f\u6210\u4e2d',
  failed: '\u751f\u6210\u5931\u8d25',
  completed: '\u5df2\u5b8c\u6210',
  pending: '\u5f85\u751f\u6210',
  subCardSuffix: '\u5f20\u526f\u5361',
  tagSuffix: '\u4e2a\u6807\u7b7e',
  continueEditing: '\u70b9\u51fb\u4e3b\u5361\u7ee7\u7eed\u7f16\u8f91',
  standaloneGroup: '\u72ec\u7acb\u7ed3\u679c\u5361\u7ec4',
  retry: '\u91cd\u8bd5',
  cancel: '\u505c\u6b62',
  generatingSubcards: '\u6b63\u5728\u751f\u6210\u526f\u5361\uff0c\u8bf7\u7a0d\u5019...',
  noSubcards: '\u8fd9\u4e2a\u5361\u7ec4\u8fd8\u6ca1\u6709\u526f\u5361\u7ed3\u679c\u3002',
  subCardAlt: '\u526f\u5361',
  audioResult: '\u97f3\u9891\u7ed3\u679c',
  previewUnavailable: '\u9884\u89c8\u4e0d\u53ef\u7528',
  justUpdated: '\u521a\u521a\u66f4\u65b0',
  durationPrefix: '\u8017\u65f6',
  amountPrefix: '\u91d1\u989d',
  pointsPrefix: '\u79ef\u5206',
  audioLabel: '\u97f3\u9891',
  download: '\u4e0b\u8f7d',
  delete: '\u5220\u9664',
  noDownloadTitle: '\u6682\u65e0\u53ef\u4e0b\u8f7d\u5185\u5bb9',
  noDownloadBody: '\u8fd9\u4e2a\u5361\u7ec4\u8fd8\u6ca1\u6709\u751f\u6210\u526f\u5361\u3002',
  downloadFailedTitle: '\u4e0b\u8f7d\u5931\u8d25',
  downloadFailedBody: '\u5f53\u524d\u5361\u7ec4\u4e0b\u8f7d\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002',
  downloadSuccessTitle: '\u4e0b\u8f7d\u5b8c\u6210',
  downloadSuccessBody: '\u5361\u7ec4\u6587\u4ef6\u5df2\u5f00\u59cb\u4e0b\u8f7d\u3002',
  downloadUnavailable: '\u627e\u4e0d\u5230\u53ef\u4e0b\u8f7d\u7684\u6587\u4ef6\u5730\u5740',
};

const sanitizeFileName = (value: string): string =>
  value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 48) || 'card-group';

const truncateText = (value: string, maxLength: number): string =>
  value.length > maxLength ? `${value.slice(0, Math.max(1, maxLength - 3))}...` : value;

const formatTimestamp = (timestamp: number): string => {
  if (!timestamp) {
    return COPY.justUpdated;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
};

const formatDuration = (duration?: number): string => {
  if (!duration || !Number.isFinite(duration)) {
    return `${COPY.durationPrefix} --`;
  }

  if (duration < 1000) {
    return `${COPY.durationPrefix} ${Math.round(duration)}ms`;
  }

  const seconds = duration / 1000;
  return `${COPY.durationPrefix} ${seconds >= 10 ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
};

const resolveMediaSource = (image: GeneratedImage): string | null => {
  const source = image.originalUrl || image.url;
  if (!source) {
    return null;
  }

  if (
    source.startsWith('data:') ||
    source.startsWith('blob:') ||
    source.startsWith('http://') ||
    source.startsWith('https://')
  ) {
    return source;
  }

  return `data:${image.mimeType || 'image/png'};base64,${source.replace(/[\r\n\s]+/g, '')}`;
};

const isVideoAsset = (image: GeneratedImage, source: string | null): boolean =>
  image.mode === GenerationMode.VIDEO || Boolean(source && (source.includes('.mp4') || source.startsWith('data:video')));

const isAudioAsset = (image: GeneratedImage, source: string | null): boolean =>
  image.mode === GenerationMode.AUDIO || Boolean(source && (source.includes('.mp3') || source.includes('.wav') || source.startsWith('data:audio')));

const getMediaExtension = (image: GeneratedImage, source: string | null, blobType?: string): string => {
  const fallback = isVideoAsset(image, source) ? 'mp4' : isAudioAsset(image, source) ? 'mp3' : 'png';
  const type = blobType || image.mimeType || '';
  const extension = type.includes('/') ? type.split('/')[1] : '';

  return (extension || fallback)
    .replace('jpeg', 'jpg')
    .replace('mpeg', 'mp3')
    .replace('quicktime', 'mov');
};

const getImageAmountLabel = (image: GeneratedImage): string => {
  if (isCreditBasedModel(image.model || '', image.provider)) {
    return `${COPY.pointsPrefix} ${getModelCredits(image.model || '', image.imageSize)}`;
  }

  return `${COPY.amountPrefix} $${(image.cost || 0).toFixed(4)}`;
};

const getImageParameterLabel = (image: GeneratedImage): string => {
  const parts: string[] = [];

  if (image.aspectRatio) {
    parts.push(image.aspectRatio);
  }

  if (image.mode === GenerationMode.VIDEO) {
    parts.push(image.imageSize || '720p');
  } else if (image.mode === GenerationMode.AUDIO) {
    parts.push(image.imageSize || COPY.audioLabel);
  } else {
    parts.push(image.imageSize || '1K');
  }

  return parts.join(' / ');
};

const getImageModelLabel = (image: GeneratedImage): string =>
  truncateText(image.model || image.modelLabel || getModelDisplayName(image.model || '') || image.id, 24);

const getPromptStatus = (prompt: PromptNode | null, imageCount: number): string => {
  if (prompt?.isGenerating) {
    return COPY.generating;
  }

  if (prompt?.error) {
    return COPY.failed;
  }

  if (imageCount > 0) {
    return COPY.completed;
  }

  return COPY.pending;
};

const MobileChatFeed: React.FC<MobileChatFeedProps> = ({
  promptNodes,
  imageNodes,
  onPromptSelect,
  onPromptClick,
  onPromptCancel,
  onPromptRetry,
  onPromptDelete,
  onPromptEditPptDeck,
  onPromptExportPpt,
  onPromptExportPptx,
  selectedNodeIds,
  actualChildImagesByPromptId,
  onImageDelete,
  onImageSelect,
  onImagePreview,
  activeSourceImage,
  highlightedId,
  nowTimestamp,
}) => {
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const gestureRef = useRef<{ id: string; startX: number; startY: number; locked?: 'horizontal' | 'vertical' } | null>(null);
  const [swipedGroupId, setSwipedGroupId] = useState<string | null>(null);
  const [downloadingGroupId, setDownloadingGroupId] = useState<string | null>(null);

  const cardGroups = useMemo<MobileCardGroup[]>(() => {
    const groups: MobileCardGroup[] = [];
    const usedImageIds = new Set<string>();

    promptNodes
      .filter((promptNode) => !promptNode.isDraft)
      .forEach((promptNode) => {
        const childImages = [
          ...(actualChildImagesByPromptId.get(promptNode.id) ||
            imageNodes.filter((imageNode) => imageNode.parentPromptId === promptNode.id)),
        ].sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0));

        childImages.forEach((imageNode) => usedImageIds.add(imageNode.id));

        groups.push({
          id: `prompt-${promptNode.id}`,
          prompt: promptNode,
          images: childImages,
          timestamp: Math.max(promptNode.timestamp || 0, ...childImages.map((imageNode) => imageNode.timestamp || 0)),
          label:
            promptNode.originalPrompt ||
            promptNode.prompt ||
            promptNode.optimizedPromptZh ||
            promptNode.optimizedPromptEn ||
            COPY.untitledGroup,
        });
      });

    imageNodes.forEach((imageNode) => {
      if (usedImageIds.has(imageNode.id)) {
        return;
      }

      groups.push({
        id: `image-${imageNode.id}`,
        prompt: null,
        images: [imageNode],
        timestamp: imageNode.timestamp || 0,
        label: imageNode.alias || imageNode.prompt || imageNode.fileName || COPY.standaloneSubCard,
      });
    });

    groups.sort((left, right) => {
      const timeDelta = (right.timestamp || 0) - (left.timestamp || 0);
      if (timeDelta !== 0) {
        return timeDelta;
      }

      return left.id.localeCompare(right.id);
    });

    return groups;
  }, [actualChildImagesByPromptId, imageNodes, promptNodes]);

  const handleDeleteGroup = useCallback((group: MobileCardGroup) => {
    if (group.prompt) {
      onPromptDelete(group.prompt.id);
    }

    group.images.forEach((image) => onImageDelete(image.id));
    setSwipedGroupId(null);
  }, [onImageDelete, onPromptDelete]);

  const handleDownloadGroup = useCallback(async (group: MobileCardGroup) => {
    if (group.images.length === 0) {
      notify.warning(COPY.noDownloadTitle, COPY.noDownloadBody);
      return;
    }

    setDownloadingGroupId(group.id);

    try {
      const bundleName = sanitizeFileName(group.label);

      if (group.images.length === 1) {
        const image = group.images[0];
        const source = resolveMediaSource(image);

        if (!source) {
          throw new Error(COPY.downloadUnavailable);
        }

        const response = await fetch(source);
        const blob = await response.blob();
        const extension = getMediaExtension(image, source, blob.type);

        saveAs(blob, `${bundleName}.${extension}`);
      } else {
        const zip = new JSZip();

        await Promise.all(
          group.images.map(async (image, index) => {
            const source = resolveMediaSource(image);
            if (!source) {
              return;
            }

            const response = await fetch(source);
            const blob = await response.blob();
            const extension = getMediaExtension(image, source, blob.type);
            const fileName = sanitizeFileName(image.alias || image.prompt || image.id);

            zip.file(`${String(index + 1).padStart(2, '0')}-${fileName}.${extension}`, blob);
          }),
        );

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        saveAs(zipBlob, `${bundleName}.zip`);
      }

      notify.success(COPY.downloadSuccessTitle, COPY.downloadSuccessBody);
    } catch (error) {
      console.error('[MobileChatFeed] Download group failed:', error);
      notify.error(COPY.downloadFailedTitle, COPY.downloadFailedBody);
    } finally {
      setDownloadingGroupId(null);
      setSwipedGroupId(null);
    }
  }, []);

  const handleGroupTouchStart = useCallback((groupId: string, event: React.TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    gestureRef.current = {
      id: groupId,
      startX: touch.clientX,
      startY: touch.clientY,
    };
  }, []);

  const handleGroupTouchMove = useCallback((event: React.TouchEvent<HTMLElement>) => {
    if (!gestureRef.current) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - gestureRef.current.startX;
    const deltaY = touch.clientY - gestureRef.current.startY;

    if (!gestureRef.current.locked) {
      gestureRef.current.locked = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
    }

    if (gestureRef.current.locked === 'horizontal') {
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
    }
  }, []);

  const handleGroupTouchEnd = useCallback((groupId: string, event: React.TouchEvent<HTMLElement>) => {
    if (!gestureRef.current || gestureRef.current.id !== groupId) {
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - gestureRef.current.startX;

    if (deltaX <= -48) {
      setSwipedGroupId(groupId);
    } else if (deltaX >= 32) {
      setSwipedGroupId(null);
    }

    gestureRef.current = null;
  }, []);

  useEffect(() => {
    if (!highlightedId) {
      return;
    }

    const targetGroup = cardGroups.find((group) => {
      if (group.prompt?.id === highlightedId) {
        return true;
      }

      return group.images.some((image) => image.id === highlightedId);
    });

    if (targetGroup) {
      groupRefs.current[targetGroup.id]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [cardGroups, highlightedId]);

  return (
    <div className="mobile-card-stream">
      <div className="mobile-card-stream__header">
        <div>
          <span className="mobile-card-stream__eyebrow">{COPY.headerEyebrow}</span>
          <div className="mobile-card-stream__headline">
            <h2>{COPY.headerTitle}</h2>
            <span className="mobile-card-stream__order-pill">{COPY.headerOrder}</span>
          </div>
        </div>

        <div className="mobile-card-stream__count">
          <span>{cardGroups.length}</span>
          <span>{COPY.groupUnit}</span>
        </div>
      </div>

      {cardGroups.length === 0 ? (
        <div className="mobile-card-stream__empty">
          <div className="mobile-card-stream__empty-badge">{COPY.ready}</div>
          <h3>{COPY.emptyTitle}</h3>
          <p>{COPY.emptyBody}</p>
        </div>
      ) : (
        <div
          className="mobile-card-stream__list"
          onScroll={() => {
            if (swipedGroupId) {
              setSwipedGroupId(null);
            }
          }}
        >
          {cardGroups.map((group, index) => {
            const isHighlighted = group.prompt?.id === highlightedId || group.images.some((image) => image.id === highlightedId);
            const prompt = group.prompt;
            const promptText = truncateText(
              prompt?.optimizedPromptZh ||
                prompt?.originalPrompt ||
                prompt?.prompt ||
                group.label,
              110,
            );
            const promptStatus = getPromptStatus(prompt, group.images.length);
            const promptStatusClassName = prompt?.error ? 'is-error' : prompt?.isGenerating ? 'is-pending' : 'is-done';

            const mainCardBody = (
              <>
                <div className="mobile-card-main__topline">
                  <span className="mobile-card-main__index">{String(index + 1).padStart(2, '0')}</span>
                  <span className={`mobile-card-main__status ${promptStatusClassName}`}>
                    {promptStatus}
                  </span>
                </div>

                <div className="mobile-card-main__title">{promptText}</div>

                <div className="mobile-card-main__meta">
                  <span>{formatTimestamp(group.timestamp)}</span>
                  <span className="mobile-card-main__dot" />
                  <span>{`${group.images.length} ${COPY.subCardSuffix}`}</span>
                  {prompt?.tags?.length ? (
                    <>
                      <span className="mobile-card-main__dot" />
                      <span>{`${prompt.tags.length} ${COPY.tagSuffix}`}</span>
                    </>
                  ) : null}
                </div>

                <div className="mobile-card-main__footer">
                  <span className="mobile-card-main__footer-note">
                    {prompt ? COPY.continueEditing : COPY.standaloneGroup}
                  </span>
                  <ChevronRight size={16} />
                </div>
              </>
            );

            return (
              <div
                key={group.id}
                ref={(node) => {
                  groupRefs.current[group.id] = node;
                }}
                className={`mobile-card-group-shell ${swipedGroupId === group.id ? 'is-swiped' : ''}`}
              >
                <div className="mobile-card-group-shell__actions">
                  <button
                    type="button"
                    className="mobile-card-group-shell__action mobile-card-group-shell__action--download"
                    onClick={() => void handleDownloadGroup(group)}
                    aria-label={COPY.download}
                  >
                    {downloadingGroupId === group.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    <span>{COPY.download}</span>
                  </button>
                  <button
                    type="button"
                    className="mobile-card-group-shell__action mobile-card-group-shell__action--delete"
                    onClick={() => handleDeleteGroup(group)}
                    aria-label={COPY.delete}
                  >
                    <Trash2 size={16} />
                    <span>{COPY.delete}</span>
                  </button>
                </div>

                <section
                  className={`mobile-card-group ${isHighlighted ? 'is-highlighted' : ''}`}
                  onTouchStart={(event) => handleGroupTouchStart(group.id, event)}
                  onTouchMove={handleGroupTouchMove}
                  onTouchEnd={(event) => handleGroupTouchEnd(group.id, event)}
                  onTouchCancel={() => {
                    gestureRef.current = null;
                  }}
                  onClick={() => {
                    if (swipedGroupId === group.id) {
                      setSwipedGroupId(null);
                    }
                  }}
                >
                  <article className="mobile-card-main">
                    {prompt ? (
                      <button
                        type="button"
                        className="mobile-card-main__surface"
                        onClick={() => {
                          if (swipedGroupId === group.id) {
                            setSwipedGroupId(null);
                            return;
                          }

                          onPromptSelect(prompt.id);
                          void onPromptClick(prompt, Boolean(prompt.optimizedPromptEn || prompt.promptOptimizerResult));
                        }}
                      >
                        {mainCardBody}
                      </button>
                    ) : (
                      <div className="mobile-card-main__surface">{mainCardBody}</div>
                    )}

                    {prompt ? (
                      <div className="mobile-card-main__actions">
                        {prompt.error ? (
                          <button
                            type="button"
                            className="mobile-card-main__action-pill"
                            onClick={() => void onPromptRetry(prompt)}
                          >
                            {COPY.retry}
                          </button>
                        ) : null}

                        {prompt.isGenerating ? (
                          <button
                            type="button"
                            className="mobile-card-main__action-pill"
                            onClick={() => onPromptCancel(prompt.id)}
                          >
                            {COPY.cancel}
                          </button>
                        ) : null}

                        {!prompt.isGenerating && prompt.mode === GenerationMode.PPT && group.images.length > 0 ? (
                          <>
                            {onPromptEditPptDeck ? (
                              <button
                                type="button"
                                className="mobile-card-main__action-pill"
                                onClick={() => void onPromptEditPptDeck(prompt)}
                              >
                                Edit Deck
                              </button>
                            ) : null}

                            {onPromptExportPpt ? (
                              <button
                                type="button"
                                className="mobile-card-main__action-pill"
                                onClick={() => void onPromptExportPpt(prompt)}
                              >
                                导出包
                              </button>
                            ) : null}

                            {onPromptExportPptx ? (
                              <button
                                type="button"
                                className="mobile-card-main__action-pill"
                                onClick={() => void onPromptExportPptx(prompt)}
                              >
                                导出PPTX
                              </button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </article>

                  <div className="mobile-card-sublist">
                    {group.images.length === 0 ? (
                      <div className="mobile-card-sublist__placeholder">
                        <Sparkles size={15} />
                        <span>{prompt?.isGenerating ? COPY.generatingSubcards : COPY.noSubcards}</span>
                      </div>
                    ) : (
                      group.images.map((image) => {
                        const mediaSource = resolveMediaSource(image);
                        const videoAsset = isVideoAsset(image, mediaSource);
                        const audioAsset = isAudioAsset(image, mediaSource);
                        const isSelected = selectedNodeIds.includes(image.id);
                        const isActive = activeSourceImage === image.id;
                        const isFresh = (nowTimestamp || Date.now()) - (image.timestamp || 0) < 12000;

                        return (
                          <article
                            key={image.id}
                            className={`mobile-card-sub ${isSelected ? 'is-selected' : ''} ${isActive ? 'is-active' : ''}`}
                            onClick={() => {
                              if (swipedGroupId === group.id) {
                                setSwipedGroupId(null);
                                return;
                              }

                              onImageSelect(image.id);
                            }}
                          >
                            <button
                              type="button"
                              className="mobile-card-sub__media"
                              onClick={(event) => {
                                event.stopPropagation();

                                if (swipedGroupId === group.id) {
                                  setSwipedGroupId(null);
                                  return;
                                }

                                onImagePreview(image.id);
                              }}
                            >
                              {mediaSource && videoAsset ? (
                                <video
                                  src={mediaSource}
                                  muted
                                  playsInline
                                  loop
                                  autoPlay
                                  className="h-full w-full object-cover"
                                />
                              ) : mediaSource && !audioAsset ? (
                                <img
                                  src={mediaSource}
                                  alt={image.prompt || image.alias || COPY.subCardAlt}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="mobile-card-sub__media-fallback">
                                  <Sparkles size={18} />
                                  <span>{audioAsset ? COPY.audioResult : COPY.previewUnavailable}</span>
                                </div>
                              )}

                              {image.isGenerating ? (
                                <div className="mobile-card-sub__state">
                                  <Loader2 size={18} className="animate-spin" />
                                  <span>{COPY.generating}</span>
                                </div>
                              ) : null}

                              {image.error ? (
                                <div className="mobile-card-sub__state is-error">
                                  <span>{COPY.failed}</span>
                                </div>
                              ) : null}

                              {isFresh ? <span className="mobile-card-sub__badge">NEW</span> : null}
                            </button>

                            <div className="mobile-card-sub__body">
                              <p className="mobile-card-sub__prompt">
                                {truncateText(image.alias || image.prompt || group.label, 74)}
                              </p>

                              <div className="mobile-card-sub__info">
                                <div className="mobile-card-sub__info-row">
                                  <span>{getImageModelLabel(image)}</span>
                                  <span>{getImageParameterLabel(image)}</span>
                                  <span>{formatDuration(image.generationTime)}</span>
                                  <span>{getImageAmountLabel(image)}</span>
                                </div>

                                {image.tags && image.tags.length > 0 ? (
                                  <div className="mobile-card-sub__tags">
                                    {image.tags.slice(0, 6).map((tag) => {
                                      const colors = generateTagColor(tag);

                                      return (
                                        <span
                                          key={`${image.id}-${tag}`}
                                          className="mobile-card-sub__tag"
                                          style={{
                                            backgroundColor: colors.bg,
                                            color: colors.text,
                                            borderColor: colors.border,
                                          }}
                                        >
                                          #{truncateText(tag, 8)}
                                        </span>
                                      );
                                    })}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </section>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MobileChatFeed;
