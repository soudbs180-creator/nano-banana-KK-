
import React, { useState, useEffect } from 'react';
import { ModelIcon, ProviderIcon } from '@lobehub/icons';
import { useTheme } from '../../context/ThemeContext';

interface ModelLogoProps {
    modelId: string;
    provider?: string;
    size?: number;
    active?: boolean;
    className?: string;
}

/**
 * 标准化模型 ID，映射到 LobeHub 支持的格式
 */
const normalizeModelId = (modelId: string): string => {
    if (!modelId) return 'unknown';
    const lowerId = modelId.toLowerCase();
    
    // Gemini 系列
    if (lowerId.includes('gemini')) {
        if (lowerId.includes('pro')) return 'gemini-pro';
        if (lowerId.includes('flash')) return 'gemini-flash';
        if (lowerId.includes('ultra')) return 'gemini-ultra';
        return 'gemini';
    }
    
    // GPT 系列
    if (lowerId.includes('gpt-4')) {
        if (lowerId.includes('vision')) return 'gpt-4-vision';
        if (lowerId.includes('turbo')) return 'gpt-4-turbo';
        return 'gpt-4';
    }
    if (lowerId.includes('gpt-3.5')) return 'gpt-3.5-turbo';
    
    // Claude 系列
    if (lowerId.includes('claude')) {
        if (lowerId.includes('3') && lowerId.includes('opus')) return 'claude-3-opus';
        if (lowerId.includes('3') && lowerId.includes('sonnet')) return 'claude-3-sonnet';
        if (lowerId.includes('3') && lowerId.includes('haiku')) return 'claude-3-haiku';
        return 'claude';
    }
    
    // 其他常见模型
    if (lowerId.includes('dall-e') || lowerId.includes('dalle')) return 'dall-e';
    if (lowerId.includes('midjourney')) return 'midjourney';
    if (lowerId.includes('stable-diffusion') || lowerId.includes('sd-')) return 'stable-diffusion';
    if (lowerId.includes('llama')) return 'llama';
    
    return modelId;
};

/**
 * 根据 provider 获取对应的图标名称
 */
const normalizeProvider = (provider: string): string => {
    if (!provider) return 'unknown';
    const lowerProvider = provider.toLowerCase();
    
    const providerMap: Record<string, string> = {
        'google': 'google',
        'openai': 'openai',
        'anthropic': 'anthropic',
        'azure': 'azure',
        'cohere': 'cohere',
        'mistral': 'mistral',
        'meta': 'meta',
        'amazon': 'aws',
        'aws': 'aws',
        'baidu': 'baidu',
        'alibaba': 'alibaba',
        'tencent': 'tencent',
        'zhipu': 'zhipu',
        'deepseek': 'deepseek',
        'moonshot': 'moonshot',
        'siliconflow': 'siliconflow',
        'systemproxy': 'openai', // SystemProxy 使用 OpenAI 图标作为 fallback
    };
    
    return providerMap[lowerProvider] || lowerProvider;
};

/**
 * AI 模型图标组件
 * 
 * 显示策略：
 * 1. 暗色模式：使用彩色图标 (type="color")
 * 2. 亮色模式：
 *    - 选中状态：使用彩色图标
 *    - 未选中状态：使用单色图标 (type="mono")，显示为灰色
 */
const ModelLogo: React.FC<ModelLogoProps> = ({
    modelId,
    provider,
    size = 18,
    active = true,
    className = ""
}) => {
    const { theme } = useTheme();
    const [hasError, setHasError] = useState(false);
    // 去掉 @ 后缀进行匹配，支持 API 获取的带后缀模型ID
    const baseModelId = (modelId || '').split('@')[0];
    const lowerId = baseModelId.toLowerCase();

    // 判断是否为亮色模式
    const isLight = theme === 'light' || (theme === 'system' && !window.matchMedia('(prefers-color-scheme: dark)').matches);

    // 未选中时的样式
    const inactiveClasses = !active ? "opacity-50" : "";
    
    // 图标颜色策略
    const useColorIcon = !isLight || active;
    const iconColorClass = !useColorIcon ? 'text-gray-500' : '';

    // 重置错误状态当 modelId 改变时
    useEffect(() => {
        setHasError(false);
    }, [modelId, provider]);

    // 1. 特殊判定 - Nano Banana Pro (🍌)
    if (lowerId.includes('nano-banana-pro') || lowerId.includes('gemini-3-pro-image')) {
        return (
            <span
                style={{ fontSize: `${size}px`, lineHeight: 1 }}
                className={`inline-flex items-center justify-center transition-all duration-200 ${inactiveClasses} ${className}`}
            >
                🍌
            </span>
        );
    }

    // 2. 特殊判定 - Nano Banana 2 & Gemini 3.1 Flash (本地 SVG)
    if (lowerId.includes('nano-banana-2') || lowerId.includes('gemini-3.1-flash')) {
        return (
            <img
                src="/src/assets/icons/google-gemini.svg"
                alt="Gemini"
                style={{ width: size, height: size }}
                className={`object-contain transition-all duration-200 ${inactiveClasses} ${className}`}
            />
        );
    }

    // 3. 特殊判定 - Nano Banana (Gemini 2.5 Flash Image) - 使用香蕉emoji
    if (lowerId.includes('nano-banana') || lowerId.includes('gemini-2.5-flash-image')) {
        return (
            <span
                style={{ fontSize: `${size}px`, lineHeight: 1 }}
                className={`inline-flex items-center justify-center transition-all duration-200 ${inactiveClasses} ${className}`}
            >
                🍌
            </span>
        );
    }

    // 4. 使用 LobeHub Icons (使用基础ID，去掉@后缀)
    const normalizedModelId = normalizeModelId(baseModelId);
    const normalizedProvider = provider ? normalizeProvider(provider) : null;

    // 如果有错误，使用 provider 图标作为 fallback
    if (hasError && normalizedProvider) {
        return (
            <div
                className={`inline-flex items-center justify-center transition-all duration-200 ${inactiveClasses} ${className}`}
            >
                <div className={iconColorClass}>
                    <ProviderIcon
                        provider={normalizedProvider}
                        size={size}
                        type={useColorIcon ? "color" : "mono"}
                    />
                </div>
            </div>
        );
    }

    // 默认使用 ModelIcon
    return (
        <div
            className={`inline-flex items-center justify-center transition-all duration-200 ${inactiveClasses} ${className}`}
        >
            <div className={iconColorClass}>
                <ModelIcon
                    model={normalizedModelId}
                    size={size}
                    type={useColorIcon ? "color" : "mono"}
                />
            </div>
        </div>
    );
};

export default ModelLogo;
