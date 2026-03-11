import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';
import { GeneratedImage } from '../../types';

interface PptStackPreviewModalProps {
  images: GeneratedImage[];
  initialIndex?: number;
  onClose: () => void;
}

const PptStackPreviewModal: React.FC<PptStackPreviewModalProps> = ({
  images,
  initialIndex = 0,
  onClose,
}) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const target = document.getElementById(`ppt-stack-page-${initialIndex}`);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [initialIndex]);

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[100000] bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="absolute inset-0 flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 text-white">
          <div>
            <div className="text-sm font-semibold">PPT 整屏预览</div>
            <div className="text-xs text-white/60">已拼接显示 {images.length} 页副卡</div>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            title="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto w-full max-w-[1100px] rounded-2xl bg-[#111827] border border-white/10 overflow-hidden shadow-2xl">
            {images.map((image, index) => (
              <div
                id={`ppt-stack-page-${index}`}
                key={image.id}
                className={`relative border-b border-white/10 last:border-b-0 ${index === initialIndex ? 'ring-2 ring-sky-400/60 ring-inset' : ''}`}
              >
                <div className="absolute left-4 top-4 z-10 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white shadow-lg">
                  {image.alias || `第 ${index + 1} 页`}
                </div>
                <img
                  src={image.originalUrl || image.url}
                  alt={image.alias || `PPT page ${index + 1}`}
                  className="block w-full h-auto"
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PptStackPreviewModal;
