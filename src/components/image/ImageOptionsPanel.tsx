import React, { useMemo, useRef } from 'react';
import { AspectRatio, ImageSize } from '../../types';
import { Fullscreen } from 'lucide-react';

interface ImageOptionsPanelProps {
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  networkOptions?: Array<{
    id: string;
    label: string;
    active: boolean;
    onToggle: () => void;
  }>;
  showThinkingMode?: boolean;
  thinkingMode?: 'minimal' | 'high';
  onThinkingModeChange?: (mode: 'minimal' | 'high') => void;
  onAspectRatioChange: (ratio: AspectRatio) => void;
  onImageSizeChange: (size: ImageSize) => void;
  availableRatios?: AspectRatio[];
  availableSizes?: ImageSize[];
}

const SECTION_STYLE: React.CSSProperties = {
  background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg-tertiary) 92%, transparent) 0%, color-mix(in srgb, var(--bg-secondary) 88%, transparent) 100%)',
  borderColor: 'var(--border-default)',
};

const TITLE_STYLE: React.CSSProperties = {
  color: 'var(--text-secondary)',
};

const PANEL_STYLE: React.CSSProperties = {
  background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg-overlay) 94%, transparent) 0%, color-mix(in srgb, var(--bg-base) 96%, transparent) 100%)',
  borderColor: 'var(--border-default)',
  boxShadow: 'var(--shadow-lg), inset 0 1px 0 color-mix(in srgb, var(--text-primary) 8%, transparent)',
};

const SEGMENT_STYLE: React.CSSProperties = {
  backgroundColor: 'color-mix(in srgb, var(--bg-input) 76%, transparent)',
};

const ACTIVE_BUTTON_STYLE: React.CSSProperties = {
  borderColor: 'var(--border-strong)',
  backgroundColor: 'color-mix(in srgb, var(--bg-hover) 88%, transparent)',
  color: 'var(--text-primary)',
};

const INACTIVE_BUTTON_STYLE: React.CSSProperties = {
  borderColor: 'var(--border-subtle)',
  backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
  color: 'var(--text-secondary)',
};

const getRatioDimensions = (ratio: AspectRatio): { width: number; height: number } => {
  const maxSize = 14;
  const ratioMap: Record<string, [number, number]> = {
    [AspectRatio.SQUARE]: [1, 1],
    [AspectRatio.PORTRAIT_1_8]: [1, 8],
    [AspectRatio.PORTRAIT_1_4]: [1, 4],
    [AspectRatio.PORTRAIT_2_3]: [2, 3],
    [AspectRatio.PORTRAIT_3_4]: [3, 4],
    [AspectRatio.PORTRAIT_4_5]: [4, 5],
    [AspectRatio.PORTRAIT_9_16]: [9, 16],
    [AspectRatio.PORTRAIT_9_21]: [9, 21],
    [AspectRatio.LANDSCAPE_3_2]: [3, 2],
    [AspectRatio.LANDSCAPE_4_3]: [4, 3],
    [AspectRatio.LANDSCAPE_5_4]: [5, 4],
    [AspectRatio.LANDSCAPE_16_9]: [16, 9],
    [AspectRatio.LANDSCAPE_21_9]: [21, 9],
    [AspectRatio.LANDSCAPE_4_1]: [4, 1],
    [AspectRatio.LANDSCAPE_8_1]: [8, 1],
  };
  const [w, h] = ratioMap[ratio] || [1, 1];

  if (w > h) {
    return { width: maxSize, height: (maxSize * h) / w };
  }

  return { height: maxSize, width: (maxSize * w) / h };
};

const getRatioIcon = (ratio: AspectRatio) => {
  const dimensions = getRatioDimensions(ratio);

  return (
    <div className="flex items-center justify-center" style={{ width: 14, height: 14 }}>
      <div
        className="rounded-[2px] border-[1.5px] border-current"
        style={{ width: dimensions.width, height: dimensions.height }}
      />
    </div>
  );
};

const ImageOptionsPanel: React.FC<ImageOptionsPanelProps> = ({
  aspectRatio,
  imageSize,
  networkOptions = [],
  showThinkingMode = false,
  thinkingMode = 'minimal',
  onThinkingModeChange,
  onAspectRatioChange,
  onImageSizeChange,
  availableRatios = Object.values(AspectRatio),
  availableSizes = Object.values(ImageSize),
}) => {
  const uniqueRatios = useMemo(() => Array.from(new Set(availableRatios)), [availableRatios]);
  const gridRatios = useMemo(() => {
    const explicitRatios = uniqueRatios.filter((ratio) => ratio !== AspectRatio.AUTO);
    return explicitRatios.sort((left, right) => {
      const [leftWidth, leftHeight] = left.split(':').map(Number);
      const [rightWidth, rightHeight] = right.split(':').map(Number);
      const leftRatio = leftWidth / leftHeight;
      const rightRatio = rightWidth / rightHeight;
      return rightRatio - leftRatio;
    });
  }, [uniqueRatios]);

  const displaySizes = useMemo(() => {
    const sizeOrder = [ImageSize.SIZE_05K, ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K];
    return sizeOrder.filter((size, index) => availableSizes.includes(size) && sizeOrder.indexOf(size) === index);
  }, [availableSizes]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (scrollContainerRef.current && event.deltaY !== 0) {
      scrollContainerRef.current.scrollLeft += event.deltaY;
    }
  };

  const sizeSlide = useMemo(() => {
    if (displaySizes.length === 0) {
      return { left: '0%', width: '0%' };
    }

    const index = displaySizes.indexOf(imageSize);
    if (index === -1) {
      return { left: '2px', width: `calc(${100 / displaySizes.length}% - 4px)` };
    }

    const buttonWidthPercent = 100 / displaySizes.length;
    return {
      left: `calc(${buttonWidthPercent * index}% + 2px)`,
      width: `calc(${buttonWidthPercent}% - 4px)`,
    };
  }, [displaySizes, imageSize]);

  const hasAuto = uniqueRatios.includes(AspectRatio.AUTO);
  const isOddCount = gridRatios.length % 2 !== 0;
  const autoInGrid = hasAuto && isOddCount;
  const totalGridItems = autoInGrid ? gridRatios.length + 1 : gridRatios.length;
  const useDoubleRow = totalGridItems > 3 || (hasAuto && !autoInGrid);
  const columns = useDoubleRow ? Math.ceil(totalGridItems / 2) : Math.max(1, totalGridItems);
  const needsScroll = useDoubleRow ? columns > 5 : columns > 4;

  return (
    <div
      className="custom-scrollbar overflow-y-auto rounded-[28px] border p-4"
      style={{
        width: 'min(420px, calc(100vw - 24px))',
        maxHeight: 'min(60vh, 520px)',
        ...PANEL_STYLE,
      }}
    >
      {networkOptions.length > 0 ? (
        <section className="mb-3 rounded-2xl border p-3" style={SECTION_STYLE}>
          <div className="mb-2 text-sm font-medium" style={TITLE_STYLE}>
            {'\u641c\u7d22\u589e\u5f3a'}
          </div>
          <div className="grid grid-cols-1 gap-2">
            {networkOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={option.onToggle}
                className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition-colors"
                style={option.active ? ACTIVE_BUTTON_STYLE : INACTIVE_BUTTON_STYLE}
              >
                <span>{option.label}</span>
                <span className="text-xs">{option.active ? '\u5df2\u5f00\u542f' : '\u672a\u5f00\u542f'}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {showThinkingMode ? (
        <section className="mb-3 rounded-2xl border p-3" style={SECTION_STYLE}>
          <div className="mb-2 text-sm font-medium" style={TITLE_STYLE}>
            {'\u601d\u8003\u6a21\u5f0f'}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onThinkingModeChange?.('minimal')}
              className="rounded-xl border px-3 py-2 text-sm transition-colors"
              style={thinkingMode === 'minimal' ? ACTIVE_BUTTON_STYLE : {
                ...INACTIVE_BUTTON_STYLE,
                color: 'var(--text-tertiary)',
              }}
            >
              {'\u5feb\u901f (minimal)'}
            </button>
            <button
              type="button"
              onClick={() => onThinkingModeChange?.('high')}
              className="rounded-xl border px-3 py-2 text-sm transition-colors"
              style={thinkingMode === 'high' ? ACTIVE_BUTTON_STYLE : {
                ...INACTIVE_BUTTON_STYLE,
                color: 'var(--text-tertiary)',
              }}
            >
              {'\u6df1\u5165 (high)'}
            </button>
          </div>
        </section>
      ) : null}

      {displaySizes.length > 1 ? (
        <section className="mb-3 rounded-2xl border p-3" style={SECTION_STYLE}>
          <div className="mb-2 text-sm font-medium" style={TITLE_STYLE}>
            {'\u753b\u8d28'}
          </div>
          <div className="relative flex rounded-xl p-0.5" style={SEGMENT_STYLE}>
            <div
              className="absolute bottom-0.5 top-0.5 rounded-[10px] transition-all duration-200 ease-out"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--bg-hover) 92%, transparent)',
                left: sizeSlide.left,
                width: sizeSlide.width,
              }}
            />

            {displaySizes.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => onImageSizeChange(size)}
                className="relative z-10 flex-1 rounded-[10px] px-2 py-2 text-sm transition-colors duration-200"
                style={{
                  color: imageSize === size ? 'var(--text-primary)' : 'var(--text-tertiary)',
                }}
              >
                {size}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border p-3" style={SECTION_STYLE}>
        <div className="mb-2 text-sm font-medium" style={TITLE_STYLE}>
          {'\u6bd4\u4f8b'}
        </div>
        <div
          className="flex gap-1.5 overflow-hidden rounded-xl p-1.5"
          style={SEGMENT_STYLE}
        >
          {hasAuto && !autoInGrid ? (
            <button
              type="button"
              onClick={() => onAspectRatioChange(AspectRatio.AUTO)}
              className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl transition-all duration-200"
              style={{
                width: '58px',
                height: useDoubleRow ? '100px' : '48px',
                color: aspectRatio === AspectRatio.AUTO ? 'var(--text-primary)' : 'var(--text-tertiary)',
                backgroundColor: aspectRatio === AspectRatio.AUTO ? 'color-mix(in srgb, var(--bg-hover) 92%, transparent)' : 'transparent',
              }}
            >
              <Fullscreen size={18} />
              <span className="text-xs">{'\u81ea\u9002\u5e94'}</span>
            </button>
          ) : null}

          <div
            ref={scrollContainerRef}
            onWheel={handleWheel}
            className={`grid min-w-0 flex-1 overflow-y-hidden ${needsScroll ? 'custom-scrollbar overflow-x-auto' : 'overflow-x-hidden'}`}
            style={{
              gridTemplateColumns: needsScroll ? `repeat(${columns}, minmax(54px, 1fr))` : `repeat(${columns}, minmax(0, 1fr))`,
              gridTemplateRows: useDoubleRow ? 'repeat(2, 48px)' : '48px',
              gap: '4px',
              paddingBottom: needsScroll ? '4px' : '0',
              WebkitOverflowScrolling: 'touch',
              overscrollBehaviorX: 'contain',
            }}
          >
            {autoInGrid ? (
              <button
                type="button"
                onClick={() => onAspectRatioChange(AspectRatio.AUTO)}
                className="flex flex-col items-center justify-center gap-1 rounded-xl transition-all duration-200"
                style={{
                  height: '46px',
                  padding: '4px',
                  color: aspectRatio === AspectRatio.AUTO ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  backgroundColor: aspectRatio === AspectRatio.AUTO ? 'color-mix(in srgb, var(--bg-hover) 92%, transparent)' : 'transparent',
                }}
              >
                <Fullscreen size={14} />
                <span className="whitespace-nowrap text-[10px] leading-none">{'\u81ea\u9002\u5e94'}</span>
              </button>
            ) : null}

            {gridRatios.map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => onAspectRatioChange(ratio)}
                className="flex flex-col items-center justify-center gap-1.5 rounded-xl transition-all duration-200"
                style={{
                  height: '46px',
                  padding: '4px',
                  color: aspectRatio === ratio ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  backgroundColor: aspectRatio === ratio ? 'color-mix(in srgb, var(--bg-hover) 92%, transparent)' : 'transparent',
                }}
              >
                {getRatioIcon(ratio)}
                <span className="whitespace-nowrap text-[10px] leading-none">{ratio}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default ImageOptionsPanel;
