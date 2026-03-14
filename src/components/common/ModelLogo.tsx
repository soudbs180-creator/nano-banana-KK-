import React, { useMemo } from 'react';
import geminiLogo from '../../assets/icons/google-gemini.svg';
import { useTheme } from '../../context/ThemeContext';

interface ModelLogoProps {
    modelId: string;
    provider?: string;
    size?: number;
    active?: boolean;
    className?: string;
}

interface LogoDescriptor {
    background: string;
    borderColor: string;
    color: string;
    imageSrc?: string;
    label: string;
    title: string;
}

const BRAND_LOGOS: Array<{ match: string[]; descriptor: Omit<LogoDescriptor, 'title'> }> = [
    {
        match: ['gemini', 'google', 'nano-banana'],
        descriptor: {
            background: 'linear-gradient(135deg, rgba(66,133,244,0.14), rgba(52,168,83,0.18))',
            borderColor: 'rgba(66,133,244,0.24)',
            color: '#4285F4',
            imageSrc: geminiLogo,
            label: 'GM',
        },
    },
    {
        match: ['gpt', 'openai', 'o1', 'o3', 'o4'],
        descriptor: {
            background: '#111827',
            borderColor: 'rgba(17,24,39,0.35)',
            color: '#FFFFFF',
            label: 'AI',
        },
    },
    {
        match: ['claude', 'anthropic'],
        descriptor: {
            background: '#D97757',
            borderColor: 'rgba(217,119,87,0.35)',
            color: '#FFF7ED',
            label: 'CL',
        },
    },
    {
        match: ['deepseek'],
        descriptor: {
            background: '#2563EB',
            borderColor: 'rgba(37,99,235,0.3)',
            color: '#EFF6FF',
            label: 'DS',
        },
    },
    {
        match: ['qwen', 'tongyi', 'alibaba', 'dashscope'],
        descriptor: {
            background: '#7C3AED',
            borderColor: 'rgba(124,58,237,0.28)',
            color: '#F5F3FF',
            label: 'QW',
        },
    },
    {
        match: ['grok', 'xai'],
        descriptor: {
            background: '#0F172A',
            borderColor: 'rgba(15,23,42,0.35)',
            color: '#E2E8F0',
            label: 'GX',
        },
    },
    {
        match: ['llama', 'meta'],
        descriptor: {
            background: '#2563EB',
            borderColor: 'rgba(37,99,235,0.3)',
            color: '#DBEAFE',
            label: 'MT',
        },
    },
    {
        match: ['doubao'],
        descriptor: {
            background: '#0F766E',
            borderColor: 'rgba(15,118,110,0.28)',
            color: '#CCFBF1',
            label: 'DB',
        },
    },
    {
        match: ['kimi', 'moonshot'],
        descriptor: {
            background: '#DB2777',
            borderColor: 'rgba(219,39,119,0.25)',
            color: '#FCE7F3',
            label: 'KM',
        },
    },
    {
        match: ['mistral'],
        descriptor: {
            background: '#EA580C',
            borderColor: 'rgba(234,88,12,0.25)',
            color: '#FFF7ED',
            label: 'MS',
        },
    },
    {
        match: ['flux', 'fal'],
        descriptor: {
            background: '#4F46E5',
            borderColor: 'rgba(79,70,229,0.3)',
            color: '#EEF2FF',
            label: 'FX',
        },
    },
];

function getInitials(value: string): string {
    const cleaned = value
        .replace(/[@/_-]+/g, ' ')
        .replace(/[^a-zA-Z0-9 ]/g, ' ')
        .trim();

    if (!cleaned) return 'AI';

    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
    }

    return cleaned.slice(0, 2).toUpperCase();
}

function getFallbackDescriptor(modelId: string, provider?: string): LogoDescriptor {
    const source = (provider || modelId || 'AI').trim();
    const hueSeed = source
        .split('')
        .reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;

    return {
        background: `linear-gradient(135deg, hsla(${hueSeed}, 78%, 48%, 0.92), hsla(${(hueSeed + 36) % 360}, 72%, 42%, 0.92))`,
        borderColor: `hsla(${hueSeed}, 78%, 48%, 0.24)`,
        color: '#FFFFFF',
        label: getInitials(source),
        title: source,
    };
}

function neutralizeDescriptor(theme: 'light' | 'dark', descriptor: LogoDescriptor): LogoDescriptor {
    return {
        ...descriptor,
        background: theme === 'light' ? '#F3F4F6' : '#1F2937',
        borderColor: theme === 'light' ? 'rgba(209,213,219,0.9)' : 'rgba(75,85,99,0.9)',
        color: theme === 'light' ? '#4B5563' : '#D1D5DB',
    };
}

function resolveLogoDescriptor(modelId: string, provider?: string): LogoDescriptor {
    const lowerModelId = modelId.toLowerCase();
    const lowerProvider = (provider || '').toLowerCase();

    for (const item of BRAND_LOGOS) {
        if (item.match.some((keyword) => lowerModelId.includes(keyword) || lowerProvider.includes(keyword))) {
            return {
                ...item.descriptor,
                title: provider || modelId,
            };
        }
    }

    return getFallbackDescriptor(modelId, provider);
}

const ModelLogo: React.FC<ModelLogoProps> = ({
    modelId,
    provider,
    size = 18,
    active = true,
    className = '',
}) => {
    const { resolvedTheme } = useTheme();

    const descriptor = useMemo(() => {
        const resolved = resolveLogoDescriptor(modelId, provider);
        const shouldUseBrandStyle = resolvedTheme === 'dark' || active;
        return shouldUseBrandStyle ? resolved : neutralizeDescriptor(resolvedTheme, resolved);
    }, [active, modelId, provider, resolvedTheme]);

    const innerSize = Math.max(10, Math.round(size * 0.72));
    const textSize = Math.max(9, Math.round(size * 0.42));

    return (
        <span
            title={descriptor.title}
            className={`inline-flex items-center justify-center overflow-hidden transition-all duration-200 ${active ? '' : 'opacity-50'} ${className}`}
            style={{
                width: size,
                height: size,
                borderRadius: Math.max(6, Math.round(size * 0.34)),
                background: descriptor.background,
                border: `1px solid ${descriptor.borderColor}`,
                color: descriptor.color,
                boxShadow: resolvedTheme === 'dark'
                    ? '0 6px 18px rgba(15, 23, 42, 0.18)'
                    : '0 4px 14px rgba(15, 23, 42, 0.08)',
            }}
        >
            {descriptor.imageSrc ? (
                <img
                    src={descriptor.imageSrc}
                    alt={descriptor.title}
                    style={{ width: innerSize, height: innerSize }}
                    className="object-contain"
                />
            ) : (
                <span
                    style={{
                        fontSize: textSize,
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                        lineHeight: 1,
                    }}
                >
                    {descriptor.label}
                </span>
            )}
        </span>
    );
};

export default ModelLogo;
