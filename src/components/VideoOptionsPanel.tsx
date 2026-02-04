import React, { useMemo, useEffect } from 'react';
import { AspectRatio, VIDEO_RESOLUTION_DURATION_MAP } from '../types';
import { Fullscreen, Volume2, VolumeOff } from 'lucide-react';

interface VideoOptionsPanelProps {
    aspectRatio: AspectRatio;
    resolution: string;
    duration: string;
    audio: boolean;
    onAspectRatioChange: (ratio: AspectRatio) => void;
    onResolutionChange: (resolution: string) => void;
    onDurationChange: (duration: string) => void;
    onAudioChange: (audio: boolean) => void;
    availableRatios?: AspectRatio[];
}

const VideoOptionsPanel: React.FC<VideoOptionsPanelProps> = ({
    aspectRatio,
    resolution,
    duration,
    audio,
    onAspectRatioChange,
    onResolutionChange,
    onDurationChange,
    onAudioChange,
    availableRatios = [
        AspectRatio.AUTO,
        AspectRatio.LANDSCAPE_16_9,
        AspectRatio.LANDSCAPE_4_3,
        AspectRatio.SQUARE,
        AspectRatio.PORTRAIT_3_4,
        AspectRatio.PORTRAIT_9_16,
    ]
}) => {
    const resolutions = ['720p', '1080p', '4k'];

    // 根据选中的分辨率动态计算可用时长
    const availableDurations = useMemo(() => {
        return VIDEO_RESOLUTION_DURATION_MAP[resolution as keyof typeof VIDEO_RESOLUTION_DURATION_MAP] || ['4s', '6s', '8s'];
    }, [resolution]);

    // 当分辨率变化时，如果当前时长不可用，自动切换到第一个可用时长
    useEffect(() => {
        if (!availableDurations.includes(duration)) {
            onDurationChange(availableDurations[0]);
        }
    }, [resolution, duration, availableDurations, onDurationChange]);

    // 计算比例图标的尺寸
    const getRatioDimensions = (ratio: AspectRatio): { width: number; height: number } => {
        const maxSize = 14;

        const ratioMap: Record<string, [number, number]> = {
            [AspectRatio.SQUARE]: [1, 1],
            [AspectRatio.PORTRAIT_9_16]: [9, 16],
            [AspectRatio.LANDSCAPE_16_9]: [16, 9],
            [AspectRatio.PORTRAIT_3_4]: [3, 4],
            [AspectRatio.LANDSCAPE_4_3]: [4, 3],
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

    // 网格中的比例（排除AUTO）
    const gridRatios = useMemo(() =>
        availableRatios.filter(r => r !== AspectRatio.AUTO),
        [availableRatios]
    );

    // 注：已改用内联背景色方案，不再需要ratioSlide计算

    // 计算滑动背景位置（清晰度）
    const resolutionSlide = useMemo(() => {
        const index = resolutions.indexOf(resolution);
        const buttonWidthPercent = 100 / resolutions.length;

        return {
            left: `calc(${buttonWidthPercent * index}% + 2px)`,
            width: `calc(${buttonWidthPercent}% - 4px)`
        };
    }, [resolution, resolutions]);

    // 计算滑动背景位置（时长）
    const durationSlide = useMemo(() => {
        const allDurations = ['4s', '6s', '8s'];
        const index = allDurations.indexOf(duration);
        const buttonWidthPercent = 100 / allDurations.length;

        return {
            left: `calc(${buttonWidthPercent * index}% + 2px)`,
            width: `calc(${buttonWidthPercent}% - 4px)`
        };
    }, [duration]);

    // 计算滑动背景位置（音频）
    const audioSlide = useMemo(() => {
        const index = audio ? 0 : 1;
        const buttonWidthPercent = 50;

        return {
            left: `calc(${buttonWidthPercent * index}% + 2px)`,
            width: `calc(${buttonWidthPercent}% - 4px)`
        };
    }, [audio]);

    return (
        <div
            className="p-4 rounded-xl border shadow-2xl"
            style={{
                width: '380px',
                backgroundColor: 'var(--bg-secondary)',
                backdropFilter: 'blur(8px)',
                borderColor: 'var(--border-light)'
            }}
        >
            {/* 1. 音频 - 左右两个按钮带图标 */}
            <div className="mb-4 last:mb-0">
                <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    音频
                </div>
                <div
                    className="relative flex rounded-lg p-0.5"
                    style={{ backgroundColor: 'var(--bg-tertiary)' }}
                >
                    <div
                        className="absolute top-0.5 bottom-0.5 rounded-md transition-all duration-200 ease-out"
                        style={{
                            backgroundColor: 'var(--bg-secondary)',
                            left: audioSlide.left,
                            width: audioSlide.width
                        }}
                    />

                    <button
                        onClick={() => onAudioChange(true)}
                        className="relative z-10 flex-1 flex items-center justify-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors duration-200 hover:text-[var(--text-secondary)]"
                        style={{
                            color: audio ? 'var(--text-primary)' : 'var(--text-tertiary)'
                        }}
                    >
                        <Volume2 size={16} />
                        <span>开启</span>
                    </button>
                    <button
                        onClick={() => onAudioChange(false)}
                        className="relative z-10 flex-1 flex items-center justify-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors duration-200 hover:text-[var(--text-secondary)]"
                        style={{
                            color: !audio ? 'var(--text-primary)' : 'var(--text-tertiary)'
                        }}
                    >
                        <VolumeOff size={16} />
                        <span>关闭</span>
                    </button>
                </div>
            </div>

            {/* 2. 比例 - 左右布局 */}
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

            {/* 3. 清晰度 - Segmented Control */}
            <div className="mb-4 last:mb-0">
                <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    清晰度
                </div>
                <div
                    className="relative flex rounded-lg p-0.5"
                    style={{ backgroundColor: 'var(--bg-tertiary)' }}
                >
                    <div
                        className="absolute top-0.5 bottom-0.5 rounded-md transition-all duration-200 ease-out"
                        style={{
                            backgroundColor: 'var(--bg-secondary)',
                            left: resolutionSlide.left,
                            width: resolutionSlide.width
                        }}
                    />

                    {resolutions.map(res => (
                        <button
                            key={res}
                            onClick={() => onResolutionChange(res)}
                            className="relative z-10 flex-1 px-2 py-1.5 rounded-md text-sm transition-colors duration-200 hover:text-[var(--text-secondary)]"
                            style={{
                                color: resolution === res ? 'var(--text-primary)' : 'var(--text-tertiary)'
                            }}
                        >
                            {res}
                        </button>
                    ))}
                </div>
            </div>

            {/* 4. 生成时长 - Segmented Control */}
            <div className="mb-4 last:mb-0">
                <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    生成时长
                </div>
                <div
                    className="relative flex rounded-lg p-0.5"
                    style={{ backgroundColor: 'var(--bg-tertiary)' }}
                >
                    <div
                        className="absolute top-0.5 bottom-0.5 rounded-md transition-all duration-200 ease-out"
                        style={{
                            backgroundColor: 'var(--bg-secondary)',
                            left: durationSlide.left,
                            width: durationSlide.width
                        }}
                    />

                    {['4s', '6s', '8s'].map(dur => {
                        const isAvailable = availableDurations.includes(dur);
                        return (
                            <button
                                key={dur}
                                onClick={() => isAvailable && onDurationChange(dur)}
                                disabled={!isAvailable}
                                className="relative z-10 flex-1 px-2 py-1.5 rounded-md text-sm transition-colors duration-200 hover:text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{
                                    color: duration === dur && isAvailable ? 'var(--text-primary)' : 'var(--text-tertiary)'
                                }}
                            >
                                {dur}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default VideoOptionsPanel;
