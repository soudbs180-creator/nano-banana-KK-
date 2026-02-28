import React, { useMemo, useRef } from 'react';
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
            [AspectRatio.LANDSCAPE_4_1]: [4, 1],
            [AspectRatio.PORTRAIT_1_4]: [1, 4],
            [AspectRatio.LANDSCAPE_8_1]: [8, 1],
            [AspectRatio.PORTRAIT_1_8]: [1, 8]
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

    // 网格中的比例（排除AUTO），只显示支持的，按比值从小到大排序（竖图→方图→横图）
    const gridRatios = useMemo(() => {
        const explicitRatios = availableRatios.filter(r => r !== AspectRatio.AUTO);
        return explicitRatios.sort((a, b) => {
            const [aw, ah] = a.split(':').map(Number);
            const [bw, bh] = b.split(':').map(Number);
            const ratioA = aw / ah;
            const ratioB = bw / bh;
            return ratioA - ratioB; // 从小到大：竖图在前，横图在后
        });
    }, [availableRatios]);

    // 只显示当前模型支持的画质选项
    const displaySizes = useMemo(() => {
        const sizeOrder = [ImageSize.SIZE_05K, ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K];
        return sizeOrder.filter(s => availableSizes.includes(s));
    }, [availableSizes]);

    // 鼠标滚轮横向滚动支持
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (scrollContainerRef.current) {
            if (e.deltaY !== 0) {
                scrollContainerRef.current.scrollLeft += e.deltaY;
            }
        }
    };

    // 计算滑动背景位置（画质）
    const sizeSlide = useMemo(() => {
        const index = displaySizes.indexOf(imageSize);
        if (index === -1) return { left: '2px', width: `calc(${100 / displaySizes.length}% - 4px)` };

        const totalButtons = displaySizes.length;
        const buttonWidthPercent = 100 / totalButtons;

        return {
            left: `calc(${buttonWidthPercent * index}% + 2px)`,
            width: `calc(${buttonWidthPercent}% - 4px)`
        };
    }, [imageSize, displaySizes]);

    // 判断自适应按钮布局模式
    const hasAuto = availableRatios.includes(AspectRatio.AUTO);
    const isOddCount = gridRatios.length % 2 !== 0;

    // 奇数个比例时：自适应变成小按钮混入网格（凑偶数）
    // 偶数个时：自适应独立大按钮占左侧两行
    const autoInGrid = hasAuto && isOddCount;

    // 网格中的实际项目数（含/不含AUTO）
    const totalGridItems = autoInGrid ? gridRatios.length + 1 : gridRatios.length;
    const columns = Math.ceil(totalGridItems / 2);
    const useDoubleRow = totalGridItems > 5;

    // 超过10个时才显示滚动条
    const needsScroll = gridRatios.length > 10;

    return (
        <div
            className="p-4 rounded-xl border max-w-[90vw]"
            style={{
                width: '380px',
                backgroundColor: 'var(--bg-secondary)',
                backdropFilter: 'blur(8px)',
                borderColor: 'var(--border-light)',
                boxShadow: 'var(--shadow-xl)'
            }}
        >
            {/* 画质 - 只显示支持的选项 */}
            {displaySizes.length > 1 && (
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

                        {/* 按钮 - 只渲染支持的size */}
                        {displaySizes.map((size) => (
                            <button
                                key={size}
                                onClick={() => onImageSizeChange(size)}
                                className="relative z-10 flex-1 px-2 py-1.5 rounded-md text-sm transition-colors duration-200 hover:text-[var(--text-secondary)] cursor-pointer"
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


            {/* 比例 */}
            <div>
                <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    比例
                </div>
                <div
                    className="flex gap-1.5 rounded-lg p-1.5 overflow-hidden"
                    style={{ backgroundColor: 'var(--bg-tertiary)' }}
                >
                    {/* 偶数模式：自适应按钮独立占左侧两行 */}
                    {hasAuto && !autoInGrid && (
                        <button
                            onClick={() => onAspectRatioChange(AspectRatio.AUTO)}
                            className="flex flex-col items-center justify-center rounded-md transition-all duration-200 gap-1 hover:text-[var(--text-secondary)] shrink-0"
                            style={{
                                width: '56px',
                                height: useDoubleRow ? '100px' : '48px',
                                color: aspectRatio === AspectRatio.AUTO ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                backgroundColor: aspectRatio === AspectRatio.AUTO ? 'var(--bg-secondary)' : 'transparent'
                            }}
                        >
                            <Fullscreen size={18} />
                            <span className="text-xs">自适应</span>
                        </button>
                    )}

                    {/* 比例网格 */}
                    <div
                        ref={scrollContainerRef}
                        onWheel={handleWheel}
                        className={`grid flex-1 min-w-0 overflow-y-hidden ${needsScroll ? 'overflow-x-auto custom-scrollbar' : 'overflow-x-hidden'}`}
                        style={{
                            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                            gridTemplateRows: useDoubleRow ? 'repeat(2, 48px)' : '1fr',
                            gap: '4px',
                            paddingBottom: needsScroll ? '2px' : '0'
                        }}
                    >
                        {/* 奇数模式：自适应按钮作为网格第一个小按钮 */}
                        {autoInGrid && (
                            <button
                                onClick={() => onAspectRatioChange(AspectRatio.AUTO)}
                                className="flex flex-col items-center justify-center rounded-md transition-all duration-200 hover:text-[var(--text-secondary)]"
                                style={{
                                    height: '46px',
                                    padding: '4px',
                                    color: aspectRatio === AspectRatio.AUTO ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                    backgroundColor: aspectRatio === AspectRatio.AUTO ? 'var(--bg-secondary)' : 'transparent',
                                    gap: '4px'
                                }}
                            >
                                <Fullscreen size={14} />
                                <span className="text-[10px] leading-none whitespace-nowrap">自适应</span>
                            </button>
                        )}

                        {/* 比例按钮 */}
                        {gridRatios.map(ratio => (
                            <button
                                key={ratio}
                                onClick={() => onAspectRatioChange(ratio)}
                                className="flex flex-col items-center justify-center rounded-md transition-all duration-200 hover:text-[var(--text-secondary)]"
                                style={{
                                    height: '46px',
                                    padding: '4px',
                                    color: aspectRatio === ratio ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                    backgroundColor: aspectRatio === ratio ? 'var(--bg-secondary)' : 'transparent',
                                    gap: '6px'
                                }}
                            >
                                {getRatioIcon(ratio)}
                                <span className="text-[10px] leading-none whitespace-nowrap">{ratio}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div >
    );
};

export default ImageOptionsPanel;
