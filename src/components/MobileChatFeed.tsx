import React, { useRef, useEffect, useMemo } from 'react';
import PromptNodeComponent from './canvas/PromptNodeComponent';
import ImageNode from './image/ImageCard2';
import { PromptNode, GeneratedImage } from '../types';

// 手机端聊天流式垂直列表组件
// 用于替代手机端的无限画布，将所有节点按时间线排列

interface ChatFeedItem {
  type: 'prompt' | 'image';
  node: PromptNode | GeneratedImage;
  timestamp: number;
}

interface MobileChatFeedProps {
  promptNodes: PromptNode[];
  imageNodes: GeneratedImage[];
  onPromptPositionChange: (id: string, pos: { x: number; y: number }) => void;
  onPromptSelect: (nodeId: string) => void;
  onPromptClick: (nodeId: string) => void;
  onPromptCancel: (nodeId: string) => void;
  onPromptRetry: (nodeId: string) => void;
  onPromptDelete: (nodeId: string) => void;
  onPromptDisconnect: (imageId: string) => void;
  onPromptUpdate: (node: PromptNode) => void;
  onPromptHeightChange: (id: string, height: number) => void;
  onPromptPin: (id: string) => void;
  onPromptRemoveTag: (id: string, tag: string) => void;
  onPromptExportPpt?: (nodeId: string) => void;
  onPromptExportPptx?: (nodeId: string) => void;
  onPromptRetryPptPage?: (nodeId: string, pageIndex: number) => void;
  onPromptExportPptPage?: (nodeId: string, pageIndex: number) => void;
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

const MobileChatFeed: React.FC<MobileChatFeedProps> = ({
  promptNodes,
  imageNodes,
  onPromptPositionChange,
  onPromptSelect,
  onPromptClick,
  onPromptCancel,
  onPromptRetry,
  onPromptDelete,
  onPromptDisconnect,
  onPromptUpdate,
  onPromptHeightChange,
  onPromptPin,
  onPromptRemoveTag,
  onPromptExportPpt,
  onPromptExportPptx,
  onPromptRetryPptPage,
  onPromptExportPptPage,
  onOpenStorageSettings,
  selectedNodeIds,
  actualChildImagesByPromptId,
  getNodeIoTrace,
  onImagePositionChange,
  onImageDelete,
  onImageClick,
  onImageSelect,
  onImageUpdate,
  onImageDimensionsUpdate,
  onImagePreview,
  activeSourceImage,
  highlightedId,
  nowTimestamp
}) => {
  const feedRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  // 合并并按时间排序所有节点
  const feedItems: ChatFeedItem[] = useMemo(() => {
    const items: ChatFeedItem[] = [];

    promptNodes.forEach(pn => {
      items.push({
        type: 'prompt',
        node: pn,
        timestamp: pn.timestamp || 0
      });
    });

    imageNodes.forEach(img => {
      items.push({
        type: 'image',
        node: img,
        timestamp: img.timestamp || 0
      });
    });

    // 按时间升序排列（最新的在底部）
    items.sort((a, b) => a.timestamp - b.timestamp);
    return items;
  }, [promptNodes, imageNodes]);

  // 当新节点加入时自动滚动到底部
  useEffect(() => {
    if (feedItems.length > prevCountRef.current) {
      feedRef.current?.scrollTo({
        top: feedRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
    prevCountRef.current = feedItems.length;
  }, [feedItems.length]);

  return (
    <div
      ref={feedRef}
      className="flex-1 overflow-y-auto overflow-x-hidden px-3 pt-4 pb-32"
      style={{
        WebkitOverflowScrolling: 'touch',
        scrollBehavior: 'smooth'
      }}
    >
      {feedItems.length === 0 && (
        <div className="flex items-center justify-center h-full text-white/30 text-sm">
          输入提示词开始创作 ✨
        </div>
      )}

      {feedItems.map((item) => {
        if (item.type === 'prompt') {
          const node = item.node as PromptNode;
          return (
            <PromptNodeComponent
              key={node.id}
              node={node}
              isChatMode={true}
              actualChildImageCount={(actualChildImagesByPromptId.get(node.id) || []).length}
              onPositionChange={onPromptPositionChange}
              isSelected={selectedNodeIds.includes(node.id)}
              highlighted={highlightedId === node.id}
              onSelect={() => onPromptSelect(node.id)}
              onClickPrompt={onPromptClick}
              zoomScale={1}
              isMobile={true}
              onCancel={onPromptCancel}
              onRetry={onPromptRetry}
              onExportPpt={onPromptExportPpt}
              onExportPptx={onPromptExportPptx}
              onRetryPptPage={onPromptRetryPptPage}
              onExportPptPage={onPromptExportPptPage}
              ioTrace={getNodeIoTrace?.(node.id)}
              onOpenStorageSettings={onOpenStorageSettings}
              onDelete={onPromptDelete}
              onDisconnect={onPromptDisconnect}
              onUpdateNode={onPromptUpdate}
              onHeightChange={onPromptHeightChange}
              onPin={onPromptPin}
              onRemoveTag={onPromptRemoveTag}
            />
          );
        } else {
          const img = item.node as GeneratedImage;
          return (
            <ImageNode
              key={img.id}
              image={img}
              isChatMode={true}
              position={img.position}
              onPositionChange={onImagePositionChange}
              onDimensionsUpdate={onImageDimensionsUpdate}
              onUpdate={onImageUpdate}
              onDelete={onImageDelete}
              onClick={onImageClick}
              isActive={img.id === activeSourceImage}
              isSelected={selectedNodeIds.includes(img.id)}
              onSelect={() => onImageSelect(img.id)}
              zoomScale={1}
              isMobile={true}
              onPreview={onImagePreview}
              isNew={(nowTimestamp || Date.now()) - (img.timestamp || 0) < 10000}
            />
          );
        }
      })}
    </div>
  );
};

export default MobileChatFeed;