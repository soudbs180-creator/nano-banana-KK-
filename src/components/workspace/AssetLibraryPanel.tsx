import React from 'react';
import { Eye, Images, Layers3, LocateFixed, X } from 'lucide-react';
import type { GeneratedImage } from '../../types';
import { WorkspaceActionBar, WorkspaceActionButton, WorkspaceCard, WorkspaceSheetHeader } from './WorkspaceSurface';

interface AssetLibraryPanelProps {
  isOpen: boolean;
  isMobile: boolean;
  images: GeneratedImage[];
  promptCount: number;
  onClose: () => void;
  onPreview: (imageId: string) => void;
  onFocusImage?: (imageId: string) => void;
}

const getImageSrc = (image: GeneratedImage) => image.url || image.originalUrl || '';

export const AssetLibraryPanel: React.FC<AssetLibraryPanelProps> = ({
  isOpen,
  isMobile,
  images,
  promptCount,
  onClose,
  onPreview,
  onFocusImage,
}) => {
  if (!isOpen) return null;

  const recentImages = [...images]
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 12);

  return (
    <>
      <div className="workspace-panel-backdrop" onClick={onClose} />
      <section className={`workspace-library-panel ${isMobile ? 'is-mobile' : 'is-desktop'}`}>
        <WorkspaceCard className="workspace-library-card">
          <WorkspaceSheetHeader
            eyebrow="资源面板"
            title="创作资源库"
            description="集中查看最近生成内容，减少在画布、预览和聊天之间来回切换。"
            actions={
              <WorkspaceActionButton aria-label="关闭资源库" onClick={onClose}>
                <X size={16} />
              </WorkspaceActionButton>
            }
          />

          <div className="workspace-library-summary">
            <WorkspaceCard className="workspace-library-summary-card">
              <div className="workspace-library-summary-icon">
                <Images size={16} />
              </div>
              <div className="min-w-0">
                <div className="workspace-library-summary-label">媒体资源</div>
                <div className="workspace-library-summary-value">{images.length}</div>
              </div>
            </WorkspaceCard>
            <WorkspaceCard className="workspace-library-summary-card">
              <div className="workspace-library-summary-icon">
                <Layers3 size={16} />
              </div>
              <div className="min-w-0">
                <div className="workspace-library-summary-label">提示节点</div>
                <div className="workspace-library-summary-value">{promptCount}</div>
              </div>
            </WorkspaceCard>
          </div>

          {recentImages.length > 0 ? (
            <div className="workspace-library-grid">
              {recentImages.map((image) => {
                const src = getImageSrc(image);
                return (
                  <WorkspaceCard key={image.id} className="workspace-library-item">
                    <button
                      className="workspace-library-thumb"
                      onClick={() => onPreview(image.id)}
                      aria-label="预览资源"
                      type="button"
                    >
                      {src ? (
                        <img src={src} alt={image.prompt || '最近生成内容'} />
                      ) : (
                        <div className="workspace-library-empty-thumb">暂无预览</div>
                      )}
                    </button>

                    <div className="workspace-library-meta">
                      <div className="workspace-library-prompt" title={image.prompt}>
                        {image.prompt || '未命名生成内容'}
                      </div>
                      <div className="workspace-library-caption">
                        {new Date(image.timestamp || Date.now()).toLocaleString('zh-CN', {
                          hour12: false,
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>

                    <WorkspaceActionBar className="workspace-library-item-actions">
                      <WorkspaceActionButton type="button" onClick={() => onPreview(image.id)}>
                        <Eye size={14} />
                        <span>预览</span>
                      </WorkspaceActionButton>
                      {onFocusImage ? (
                        <WorkspaceActionButton type="button" onClick={() => onFocusImage(image.id)}>
                          <LocateFixed size={14} />
                          <span>定位</span>
                        </WorkspaceActionButton>
                      ) : null}
                    </WorkspaceActionBar>
                  </WorkspaceCard>
                );
              })}
            </div>
          ) : (
            <WorkspaceCard className="workspace-library-empty">
              <div className="workspace-library-empty-title">还没有可浏览的资源</div>
              <p className="workspace-library-empty-copy">生成第一批图片、视频或音频后，这里会自动收纳最近成果。</p>
            </WorkspaceCard>
          )}
        </WorkspaceCard>
      </section>
    </>
  );
};
