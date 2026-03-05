import { Provider } from '../../types';

export interface ProviderMetadata {
    id: Provider;
    label: string;
    icon?: string;
    defaultBaseUrl?: string;
    description?: string;
    docsUrl?: string;
}

export const PROVIDER_REGISTRY: Record<Provider, ProviderMetadata> = {
    Google: {
        id: 'Google',
        label: 'Google Cloud / Gemini',
        defaultBaseUrl: 'https://generativelanguage.googleapis.com',
        description: 'Official Google Gemini & Imagen API',
        docsUrl: 'https://ai.google.dev/'
    },
    OpenAI: {
        id: 'OpenAI',
        label: 'OpenAI',
        defaultBaseUrl: 'https://api.openai.com/v1',
        description: 'Standard OpenAI API',
        docsUrl: 'https://platform.openai.com/docs/api-reference'
    },
    Anthropic: {
        id: 'Anthropic',
        label: 'Anthropic',
        defaultBaseUrl: 'https://api.anthropic.com/v1',
        description: 'Claude Models (via Proxy recommended)',
        docsUrl: 'https://docs.anthropic.com/'
    },
    Volcengine: {
        id: 'Volcengine',
        label: 'Volcengine (Doubao)',
        defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        description: 'ByteDance Doubao & Ark Models',
        docsUrl: 'https://www.volcengine.com/docs/82379/1099222'
    },
    Aliyun: {
        id: 'Aliyun',
        label: 'Aliyun (Qwen)',
        defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        description: 'Alibaba Cloud Qwen & Wanx',
        docsUrl: 'https://help.aliyun.com/zh/model-studio/developer-reference/use-qwen-by-calling-api'
    },
    Tencent: {
        id: 'Tencent',
        label: 'Tencent Cloud',
        defaultBaseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
        description: 'Tencent Hunyuan Models',
        docsUrl: 'https://cloud.tencent.com/document/product/1729'
    },
    SiliconFlow: {
        id: 'SiliconFlow',
        label: 'SiliconFlow',
        defaultBaseUrl: 'https://api.siliconflow.cn/v1',
        description: 'High-performance inference for open weights',
        docsUrl: 'https://siliconflow.cn/'
    },
    '12AI': {
        id: '12AI',
        label: '12AI (官方平台)',
        defaultBaseUrl: 'https://cdn.12ai.org',
        description: '12AI 官方聚合通道',
        docsUrl: 'https://doc.12ai.org/'
    },
    Custom: {
        id: 'Custom',
        label: 'Custom / Proxy',
        description: 'Any OpenAI-compatible provider'
    },
    SystemProxy: {
        id: 'SystemProxy',
        label: 'System Proxy',
        description: 'System internal proxy for credit-based models'
    }
};

export const getProviderMetadata = (provider: Provider): ProviderMetadata => {
    return PROVIDER_REGISTRY[provider] || PROVIDER_REGISTRY.Custom;
};
