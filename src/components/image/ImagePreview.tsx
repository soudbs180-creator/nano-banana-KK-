import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';

interface ImagePreviewProps {
    imageUrl: string;
    originRect: DOMRect; // 原始参考图位置
    onClose: () => void;
}

/**
 * 参考图放大浮层组件
 * 从原位置向上放大3倍显示，无背景遮罩
 */
const ImagePreview: React.FC<ImagePreviewProps> = ({ imageUrl, originRect, onClose }) => {
    const [isAnimating, setIsAnimating] = useState(true);
    const [isClosing, setIsClosing] = useState(false);

    useEffect(() => {
        // 动画完成后设置状态
        const timer = setTimeout(() => setIsAnimating(false), 400);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        // ESC键关闭
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        
        // 🚀 [新增] 监听拖拽开始事件，自动关闭预览
        const handleDragStart = () => {
            handleClose();
        };
        window.addEventListener('kk-drag-start', handleDragStart as EventListener);
        
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('kk-drag-start', handleDragStart as EventListener);
        };
    }, []);

    const handleClose = () => {
        setIsClosing(true);
        // 等待动画完成后再真正关闭
        setTimeout(() => {
            onClose();
        }, 350);
    };

    // 计算放大后的位置和尺寸
    const scale = 3;
    const targetWidth = originRect.width * scale;
    const targetHeight = originRect.height * scale;

    // 从底部中心向上放大
    const targetLeft = originRect.left + originRect.width / 2 - targetWidth / 2;
    const targetTop = originRect.top - targetHeight + originRect.height;

    // 如果正在关闭，使用回收动画（返回原位置）
    const currentLeft = isClosing ? originRect.left : (isAnimating ? originRect.left : targetLeft);
    const currentTop = isClosing ? originRect.top : (isAnimating ? originRect.top : targetTop);
    const currentWidth = isClosing ? originRect.width : (isAnimating ? originRect.width : targetWidth);
    const currentHeight = isClosing ? originRect.height : (isAnimating ? originRect.height : targetHeight);
    const currentOpacity = isClosing ? 0 : 1;

    return ReactDOM.createPortal(
        <>
            {/* 透明点击层用于关闭 */}
            <div
                className="fixed inset-0 z-[9998]"
                onClick={handleClose}
            />

            {/* 放大的图片 - 直接显示在原图上方 */}
            <div
                className="fixed z-[9999]"
                style={{
                    left: currentLeft,
                    top: currentTop,
                    width: currentWidth,
                    height: currentHeight,
                    opacity: currentOpacity,
                    transition: isClosing
                        ? 'all 350ms cubic-bezier(0.4, 0, 0.2, 1)' // 关闭时使用更快的缓动
                        : 'all 400ms cubic-bezier(0.34, 1.56, 0.64, 1)', // 弹性动画
                    transformOrigin: 'bottom center',
                    pointerEvents: 'none'
                }}
            >
                <img
                    src={imageUrl}
                    alt="放大查看"
                    className="w-full h-full object-contain rounded-xl shadow-2xl"
                    style={{
                        border: '3px solid rgba(99, 102, 241, 0.6)',
                        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                        pointerEvents: 'auto',
                        cursor: 'pointer'
                    }}
                    onClick={(e) => {
                        // 如果是视频，点击切换播放状态
                        if (e.currentTarget.tagName === 'VIDEO') {
                            e.stopPropagation();
                            const v = e.currentTarget as unknown as HTMLVideoElement;
                            v.paused ? v.play() : v.pause();
                            return;
                        }
                        handleClose();
                    }}
                />
            </div>
        </>,
        document.body
    );
};

export default ImagePreview;
