import React, { useMemo } from 'react';
import { AspectRatio, ImageSize } from '../types';
import { Fullscreen } from 'lucide-react';

interface ImageOptionsPanelProps {
    aspectRatio: AspectRatio;
    imageSize: ImageSize;
    onAspectRatioChange: (ratio: AspectRatio) => void;
    onImageSizeChange: (size: ImageSize) => void;
    availableRatios?: AspectRatio[];
    availableSizes?: ImageSize[];
}

const ImageOptionsPanel: React.FC<ImageOptionsPanelProps> = ({
    aspectRatio,
    imageSize,
    onAspectRatioChange,
    onImageSizeChange,
    availableRatios = Object.values(AspectRatio),
    availableSizes = Object.values(ImageSize)
}) => {
    // 计算比例图标的尺寸
    const getRatioDimensions = (ratio: AspectRatio): { width: number; height: number } => {
        const maxSize = 14;

        const ratioMap: Record<string, [number, number]> = {
            [AspectRatio.SQUARE]: [1, 1],
            [AspectRatio.PORTRAIT_9_16]: [9, 16],
            [AspectRatio.LANDSCAPE_16_9]: [16, 9],
            [AspectRatio.PORTRAIT_3_4]: [3, 4],
            [AspectRatio.LANDSCAPE_4_3]: [4, 3],
            [AspectRatio.LANDSCAPE_3_2]: [3, 2],
            [AspectRatio.PORTRAIT_2_3]: [2, 3],
            [AspectRatio.LANDSCAPE_5_4]: [5, 4],
            [AspectRatio.PORTRAIT_4_5]: [4, 5],
            [AspectRatio.LANDSCAPE_21_9]: [21, 9],
        };

        const [w, h] = ratioMap[ratio] || [1, 1];

        if (w > h) {
            return { width: maxSize, height: (maxSize * h) / w };
        } else {
            return { height: maxSize, width: (maxSize * w) / h };
        }
    };

    // 渲染比例图标
    const getRatioIcon = (ratio: AspectRatio) => {
        const dims = getRatioDimensions(ratio);

        return (
            <div className="flex items-center justify-center" style={{ width: 14, height: 14 }}>
                <div
                    className="border-[1.5px] border-current rounded-[2px]"
                    style={{ width: dims.width, height: dims.height }}
                />
            </div>
        );
    };

    // 网格中的比例（排除AUTO），按照参考UI顺序：2行×5列
    const gridRatios = useMemo(() => [
        // Row 1
        AspectRatio.SQUARE,           // 1:1
        AspectRatio.PORTRAIT_9_16,    // 9:16
        AspectRatio.LANDSCAPE_16_9,   // 16:9
        AspectRatio.PORTRAIT_3_4,     // 3:4
        AspectRatio.LANDSCAPE_4_3,    // 4:3
        // Row 2
        AspectRatio.LANDSCAPE_3_2,    // 3:2
        AspectRatio.PORTRAIT_2_3,     // 2:3
        AspectRatio.LANDSCAPE_5_4,    // 5:4
        AspectRatio.PORTRAIT_4_5,     // 4:5
        AspectRatio.LANDSCAPE_21_9,   // 21:9
    ].filter(r => availableRatios.includes(r)), [availableRatios]);

    // 注：已改用内联背景色方案，不再需要ratioSlide计算

    // 确保availableSizes按正确顺序排列
    const sortedSizes = useMemo(() => {
        const sizeOrder = [ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K];
        return sizeOrder.filter(s => availableSizes.includes(s));
    }, [availableSizes]);

    // 计算滑动背景位置（画质）
    const sizeSlide = useMemo(() => {
        const index = sortedSizes.indexOf(imageSize);
        if (index === -1) return { left: '2px', width: 'calc(33.33% - 4px)' };

        const totalButtons = sortedSizes.length;
        const buttonWidthPercent = 100 / totalButtons;

        return {
            left: `calc(${buttonWidthPercent * index}% + 2px)`,
            width: `calc(${buttonWidthPercent}% - 4px)`
        };
    }, [imageSize, sortedSizes]);

    return (
        <div
            className="p-4 rounded-xl border"
            style={{
                width: '380px',
                backgroundColor: 'var(--bg-secondary)',
                backdropFilter: 'blur(8px)',
                borderColor: 'var(--border-light)',
                boxShadow: 'var(--shadow-xl)'
            }}
        >
            {/* 画质 - Segmented Control (只有多个选项时才显示) */}
            {sortedSizes.length > 1 && (
                <div className="mb-4 last:mb-0">
                    <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                        画质
                    </div>
                    <div
                        className="relative flex rounded-lg p-0.5"
                        style={{ backgroundColor: 'var(--bg-tertiary)' }}
                    >
                        {/* 滑动背景 */}
                        <div
                            className="absolute top-0.5 bottom-0.5 rounded-md transition-all duration-200 ease-out"
                            style={{
                                backgroundColor: 'var(--bg-secondary)',
                                left: sizeSlide.left,
                                width: sizeSlide.width
                            }}
                        />

                        {/* 按钮 - 使用排序后的sizes */}
                        {sortedSizes.map(size => (
                            <button
                                key={size}
                                onClick={() => onImageSizeChange(size)}
                                className="relative z-10 flex-1 px-2 py-1.5 rounded-md text-sm transition-colors duration-200 hover:text-[var(--text-secondary)]"
                                style={{
                                    color: imageSize === size ? 'var(--text-primary)' : 'var(--text-tertiary)'
                                }}
                            >
                                {size}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* 比例 - 左右布局 */}
            <div className="mb-4 last:mb-0">
                <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    比例
                </div>
                <div
                    className="flex gap-1.5 rounded-lg p-1"
                    style={{ backgroundColor: 'var(--bg-tertiary)' }}
                >
                    {/* 左侧：自适应按钮 - 高度根据行数自适应 */}
                    {availableRatios.includes(AspectRatio.AUTO) && (
                        <button
                            onClick={() => onAspectRatioChange(AspectRatio.AUTO)}
                            className="flex flex-col items-center justify-center rounded-md transition-all duration-200 gap-1 hover:text-[var(--text-secondary)]"
                            style={{
                                width: '64px',
                                // ≤5个比例时单排高度48px，>5个时双排高度100px
                                height: gridRatios.length <= 5 ? '48px' : '100px',
                                color: aspectRatio === AspectRatio.AUTO ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                backgroundColor: aspectRatio === AspectRatio.AUTO ? 'var(--bg-secondary)' : 'transparent'
                            }}
                        >
                            <Fullscreen size={20} />
                            <span className="text-xs">自适应</span>
                        </button>
                    )}

                    {/* 右侧：网格 - 使用CSS Grid固定5列 */}
                    <div
                        className="grid gap-1"
                        style={{
                            gridTemplateColumns: 'repeat(5, 52px)'
                        }}
                    >
                        {gridRatios.map(ratio => (
                            <button
                                key={ratio}
                                onClick={() => onAspectRatioChange(ratio)}
                                className="flex flex-col items-center justify-center rounded-md transition-all duration-200 gap-1 hover:text-[var(--text-secondary)]"
                                style={{
                                    width: '52px',
                                    height: '48px',
                                    padding: '4px',
                                    color: aspectRatio === ratio ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                    backgroundColor: aspectRatio === ratio ? 'var(--bg-secondary)' : 'transparent'
                                }}
                            >
                                {getRatioIcon(ratio)}
                                <span className="text-[10px] leading-none">{ratio}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImageOptionsPanel;
