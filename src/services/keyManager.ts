/**
 * API Key Manager Service
 * 
 * Provides multi-key rotation, status monitoring, and automatic failover.
 * Similar to Gemini Balance but runs entirely on frontend.
 * NOW SUPPORTS: Supabase Cloud Sync & Third-Party API Proxies
 */
import { supabase } from '../lib/supabase';
import { AuthMethod, GOOGLE_API_BASE, getDefaultAuthMethod } from './apiConfig';
import { MODEL_PRESETS, CHAT_MODEL_PRESETS } from './modelPresets';

/**
 * Helper: Parse "id(name, description)" format
 */
export function parseModelString(input: string): { id: string; name?: string; description?: string } {
    // Normalize full-width parentheses to standard ones
    const normalized = input.replace(/（/g, '(').replace(/）/g, ')');
    const match = normalized.match(/^([^()]+)(?:\(([^/]+)(?:\/\s*(.+))?\))?$/);

    if (!match) return { id: input.trim() };

    let id = match[1].trim();
    let name = match[2]?.trim();
    const description = match[3]?.trim();

    // 智能检测: 如果 ID 看起来像名称(包含空格或大写), 而括号内的 name 看起来像 ID (kebab-case/lowercase)
    // 则交换它们
    const idLikeRegex = /^[a-z0-9-.:]+$/;
    const hasSpace = /\s/.test(id);

    if (name && idLikeRegex.test(name) && (hasSpace || !idLikeRegex.test(id))) {
        // Swap
        const temp = id;
        id = name;
        name = temp;
    }

    return {
        id,
        name,
        description
    };
}




export interface KeySlot {
    id: string;
    key: string;
    name: string;
    provider: string; // 'Google', 'OpenAI', 'Anthropic', etc.
    type: 'official' | 'proxy' | 'third-party'; // ✨ New field for categorization

    // Channel Configuration
    baseUrl?: string;        // Custom base URL (e.g. for proxies)
    group?: string;          // Group selection for proxies
    compatibilityMode?: 'standard' | 'chat'; // 'standard' = /v1/images, 'chat' = /v1/chat
    supportedModels: string[]; // List of model IDs this channel supports

    // Proxy Specific
    proxyConfig?: {
        serverName?: string;
    };

    // Auth Configuration
    authMethod?: AuthMethod; // 'query' | 'header'
    headerName?: string;     // Custom header name (default: x-goog-api-key)

    // Advanced Configuration (NEW)
    weight?: number;         // 权重 (1-100), 用于负载均衡,默认50
    timeout?: number;        // 超时时间 (ms), 默认30000
    maxRetries?: number;     // 最大重试次数,默认2
    retryDelay?: number;     // 重试延迟 (ms), 默认1000

    // Status & Usage
    status: 'valid' | 'invalid' | 'rate_limited' | 'unknown';
    failCount: number;
    successCount: number;
    lastUsed: number | null;
    lastError: string | null;
    disabled: boolean;
    createdAt: number;

    // Performance Metrics (NEW)
    avgResponseTime?: number;    // 平均响应时间 (ms)
    lastResponseTime?: number;   // 最后一次响应时间 (ms)
    successRate?: number;        // 成功率 (0-100)
    totalRequests?: number;      // 总请求数

    // Call History (NEW)
    recentCalls?: Array<{
        timestamp: number;
        success: boolean;
        responseTime: number;
        model?: string;
        error?: string;
    }>;

    // Metrics
    usedTokens?: number;
    totalCost: number;
    budgetLimit: number; // -1 for unlimited
    tokenLimit?: number; // ✨ New: -1 for unlimited

    // Sync
    updatedAt?: number; // Timestamp of last modification for sync conflict resolution
    quota?: {
        limitRequests: number;
        remainingRequests: number;
        resetConstant?: string;
        resetTime: number;
        updatedAt: number;
    };
}


interface KeyManagerState {
    slots: KeySlot[];
    currentIndex: number;
    maxFailures: number;
    rotationStrategy: 'round-robin' | 'sequential'; // New strategy field
}

/**
 * 第三方 API 服务商接口
 * 支持智谱、万清、火山引擎等 OpenAI 兼容 API
 */
export interface ThirdPartyProvider {
    id: string;
    name: string;                 // 显示名称（如 "智谱 AI"）
    baseUrl: string;              // API 基础 URL
    apiKey: string;               // API Key
    models: string[];             // 支持的模型列表
    format: 'auto' | 'openai' | 'gemini';  // 协议格式
    icon?: string;                // 图标 emoji
    isActive: boolean;            // 是否激活

    // 独立计费
    usage: {
        totalTokens: number;
        totalCost: number;
        dailyTokens: number;
        dailyCost: number;
        lastReset: number;        // 每日重置时间戳
    };

    // 状态
    status: 'active' | 'error' | 'checking';
    lastError?: string;
    lastChecked?: number;

    // 元数据
    createdAt: number;
    updatedAt: number;
}

/**
 * 预设的第三方 API 服务商模板
 */
export const PROVIDER_PRESETS: Record<string, Omit<ThirdPartyProvider, 'id' | 'apiKey' | 'usage' | 'status' | 'createdAt' | 'updatedAt' | 'isActive'>> = {
    'zhipu': {
        name: '智谱 AI',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        models: ['glm-4', 'glm-4-flash', 'glm-4-plus', 'cogview-4'],
        format: 'openai',
        icon: '🧠'
    },
    'wanqing': {
        name: '万清 (快手)',
        baseUrl: 'https://wanqing.streamlakeapi.com/api/gateway/v1/endpoints',
        models: ['deepseek-reasoner', 'deepseek-v3', 'qwen-max'],
        format: 'openai',
        icon: '🎬'
    },
    'volcengine': {
        name: '火山引擎',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        models: ['doubao-pro', 'doubao-lite'],
        format: 'openai',
        icon: '🌋'
    },
    'deepseek': {
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        models: ['deepseek-chat', 'deepseek-reasoner'],
        format: 'openai',
        icon: '🔮'
    },
    'moonshot': {
        name: 'Moonshot (月之暗面)',
        baseUrl: 'https://api.moonshot.cn/v1',
        models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
        format: 'openai',
        icon: '🌙'
    },
    'siliconflow': {
        name: 'SiliconFlow',
        baseUrl: 'https://api.siliconflow.cn/v1',
        models: ['Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3'],
        format: 'openai',
        icon: '💎'
    },
    'custom': {
        name: '自定义',
        baseUrl: '',
        models: [],
        format: 'auto',
        icon: '⚙️'
    }
};

const STORAGE_KEY = 'kk_studio_key_manager';
const PROVIDERS_STORAGE_KEY = 'kk_studio_third_party_providers';
const DEFAULT_MAX_FAILURES = 3;
// 旧版 Gemini 模型（已弃用）
const LEGACY_GOOGLE_MODELS = ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash-exp'];

/**
 * 旧模型 ID 到新模型 ID 的自动校正映射表
 * 用于向后兼容和自动迁移
 */
export const MODEL_MIGRATION_MAP: Record<string, string> = {
    // Gemini 1.5 系列 → Gemini 2.5 系列
    'gemini-1.5-pro': 'gemini-2.5-pro',
    'gemini-1.5-pro-latest': 'gemini-2.5-pro',
    'gemini-1.5-flash': 'gemini-2.5-flash',
    'gemini-1.5-flash-latest': 'gemini-2.5-flash',

    // Gemini 2.0 系列 → Gemini 2.5 系列
    'gemini-2.0-flash-exp': 'gemini-2.5-flash',
    'gemini-2.0-pro-exp': 'gemini-2.5-pro',

    // Gemini 2.0 实验性图像生成 → Nano Banana
    'gemini-2.0-flash-exp-image-generation': 'nano-banana',

    // -latest 别名 → 具体版本
    'gemini-flash-lite-latest': 'gemini-2.5-flash-lite',
    'gemini-flash-latest': 'gemini-2.5-flash',
    'gemini-pro-latest': 'gemini-2.5-pro',
};

/**
 * 需要完全过滤掉的模型(不进行迁移,直接删除)
 */
export const BLACKLIST_MODELS = [
    // Imagen 预览版(带日期后缀)
    /^imagen-[34]\.0-(ultra-)?generate-preview-\d{2}-\d{2}$/,
    /^imagen-[34]\.0-(fast-)?generate-preview-\d{2}-\d{2}$/,
    // Imagen 旧版(generate-001)  
    /^imagen-[34]\.0-.*generate-001$/,
];

/**
 * 已弃用的模型列表(用于迁移)
 */
export const DEPRECATED_MODELS = Object.keys(MODEL_MIGRATION_MAP);

/**
 * 自动校正模型 ID
 * @param modelId - 原始模型 ID
 * @returns 校正后的模型 ID（如果需要校正）或原始 ID
 */
export function normalizeModelId(modelId: string): string {
    const normalized = MODEL_MIGRATION_MAP[modelId];
    if (normalized) {
        console.log(`[ModelMigration] Auto-correcting "${modelId}" → "${normalized}"`);
        return normalized;
    }
    return modelId;
}

/**
 * 检查模型是否已弃用
 */
export function isDeprecatedModel(modelId: string): boolean {
    return DEPRECATED_MODELS.includes(modelId);
}

/**
 * 检查模型是否应该被过滤掉
 */
function shouldFilterModel(modelId: string): boolean {
    // 过滤Imagen预览版(带日期后缀)
    if (/imagen-[34]\.0-.*-preview-\d{2}-\d{2}/.test(modelId)) {
        console.log(`[ModelFilter] Filtering Imagen preview: ${modelId}`);
        return true;
    }

    // 过滤Imagen旧版(generate-001)
    if (/imagen-[34]\.0-.*generate-001$/.test(modelId)) {
        console.log(`[ModelFilter] Filtering old Imagen: ${modelId}`);
        return true;
    }

    // 过滤gemini-2.0-flash-exp-image-generation
    if (modelId === 'gemini-2.0-flash-exp-image-generation') {
        console.log(`[ModelFilter] Filtering deprecated model: ${modelId}`);
        return true;
    }

    return false;
}

/**
 * 批量校正模型列表（去重）
 */
export function normalizeModelList(models: string[]): string[] {
    const filtered = models.filter(model => !shouldFilterModel(model));
    const normalized = filtered.map(normalizeModelId);
    // 去重（防止多个旧模型映射到同一个新模型）
    const unique = Array.from(new Set(normalized));

    if (filtered.length < models.length) {
        console.log(`[ModelFilter] Filtered ${models.length - filtered.length} obsolete models`);
    }

    return unique;
}

// 默认 Google 模型列表（仅核心Gemini模型）
export const DEFAULT_GOOGLE_MODELS = [
    // Gemini 3 系列（预览版）
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
    // Gemini 2.5 系列（稳定版）
    'gemini-2.5-flash',
    // Gemini Image（Nano Banana系列）
    'nano-banana',
    'nano-banana-pro'
];

const GOOGLE_HEADER_NAME = 'x-goog-api-key';

const inferHeaderName = (provider: string | undefined, baseUrl: string | undefined, authMethod: AuthMethod): string => {
    if (authMethod === 'query') return GOOGLE_HEADER_NAME;
    const providerLower = (provider || '').toLowerCase();
    const baseLower = (baseUrl || '').toLowerCase();
    if (providerLower === 'google' || baseLower.includes('googleapis.com')) {
        return GOOGLE_HEADER_NAME;
    }
    // OpenRouter / Other OpenAI compatible
    return 'Authorization';
};

const isLegacyGoogleModelList = (models: string[]) => {
    if (models.length !== LEGACY_GOOGLE_MODELS.length) return false;
    return models.every(m => LEGACY_GOOGLE_MODELS.includes(m));
};

type GlobalModelType = 'chat' | 'image' | 'video' | 'image+chat';  // ✨ 支持多模态

const GOOGLE_CHAT_MODELS = [
    // Gemini 2.5 系列 - 性价比最佳
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', icon: '🧠', description: '最强推理模型，擅长代码、数学、STEM 复杂任务' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', icon: '⚡', description: '性价比最佳，适合大规模处理与代理任务' },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', icon: '🚀', description: '最快速、最经济，适合高并发场景' },
    // Gemini 3 系列 - 最强智能
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro 预览', icon: '🌟', description: '世界最强多模态模型，顶级推理能力' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash 预览', icon: '✨', description: 'Gemini 3 快速版，新能力尝鲜' },
    // 多模态模型 - 既能图像生成，又能聊天
    { id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro', icon: '🎨', description: '顶级图像生成模型,超高质量输出' },
    { id: 'gemini-2.5-flash-image', name: 'Nano Banana', icon: '🖼️', description: '快速图像生成,性价比最佳' },
];

const GOOGLE_MODEL_METADATA = new Map<string, {
    name: string;
    description?: string;
    icon?: string;
    contextLength?: number;
    pricing?: { prompt: string; completion: string; image?: string; request?: string };
}>(
    GOOGLE_CHAT_MODELS.map(model => [model.id, { name: model.name, description: model.description, icon: model.icon }])
);

const MODEL_TYPE_MAP = new Map<string, GlobalModelType>();
GOOGLE_CHAT_MODELS.forEach(model => MODEL_TYPE_MAP.set(model.id, 'chat'));
MODEL_PRESETS.forEach(preset => MODEL_TYPE_MAP.set(preset.id, preset.type));

// ✨ 修正 Gemini 多模态图片模型的类型
MODEL_TYPE_MAP.set('gemini-2.5-flash-image', 'image+chat');
MODEL_TYPE_MAP.set('gemini-3-pro-image-preview', 'image+chat');

// ✨ 设置 Imagen 4.0 系列的类型
MODEL_TYPE_MAP.set('imagen-4.0-generate-001', 'image');
MODEL_TYPE_MAP.set('imagen-4.0-ultra-generate-001', 'image');
MODEL_TYPE_MAP.set('imagen-4.0-fast-generate-001', 'image');

// ✨ 设置 Veo 3.1 系列的类型
MODEL_TYPE_MAP.set('veo-3.1-generate-preview', 'video');
MODEL_TYPE_MAP.set('veo-3.1-fast-generate-preview', 'video');



MODEL_PRESETS.filter(preset => preset.provider === 'Google').forEach(preset => {
    if (!GOOGLE_MODEL_METADATA.has(preset.id)) {
        GOOGLE_MODEL_METADATA.set(preset.id, { name: preset.label, description: preset.description });
    }
});

// 添加 Imagen 4.0 和 Veo 3.1 系列模型元数据
GOOGLE_MODEL_METADATA.set('imagen-4.0-generate-001', { name: 'Imagen 4.0', icon: '🎨', description: 'Google 最新专业图像生成模型' });
GOOGLE_MODEL_METADATA.set('imagen-4.0-ultra-generate-001', { name: 'Imagen 4.0 Ultra', icon: '💎', description: 'Imagen 4.0 超高质量版本' });
GOOGLE_MODEL_METADATA.set('imagen-4.0-fast-generate-001', { name: 'Imagen 4.0 Fast', icon: '⚡', description: 'Imagen 4.0 快速生成版本' });
GOOGLE_MODEL_METADATA.set('veo-3.1-generate-preview', { name: 'Veo 3.1', icon: '🎬', description: '最新视频生成模型（预览版）' });
GOOGLE_MODEL_METADATA.set('veo-3.1-fast-generate-preview', { name: 'Veo 3.1 Fast', icon: '🎞️', description: 'Veo 3.1 快速版' });


export const getModelMetadata = (modelId: string) => GOOGLE_MODEL_METADATA.get(modelId);

const inferModelType = (modelId: string): GlobalModelType => {
    const id = modelId.toLowerCase();

    // OpenRouter Specific: "provider/model" format usually implies chat unless "flux", "sd", "ideogram" etc.
    const isOpenRouter = id.includes('/') && !id.startsWith('models/');

    const isVideo = id.includes('video') || id.includes('veo') || id.includes('kling') || id.includes('runway') || id.includes('luma') || id.includes('sora') || id.includes('pika');
    if (isVideo) return 'video';

    // ✨ 优先检查图片关键词,避免 gemini-*-image 被误判为 chat
    const isImage = id.includes('imagen') || id.includes('image') || id.includes('img') || id.includes('dall-e') || id.includes('midjourney') || id.includes('nano') || id.includes('banana') || id.includes('flux') || id.includes('stable') || id.includes('sd') || id.includes('diffusion') || id.includes('painting') || id.includes('draw');
    if (isImage) return 'image';

    const isChat = id.includes('gemini') || id.includes('gpt') || id.includes('claude') || id.includes('deepseek') || id.includes('qwen') || id.includes('llama') || id.includes('mistral') || id.includes('yi-') || id.includes(':free');
    if (isChat) return 'chat';

    // Default OpenRouter to chat if ambivalent
    if (isOpenRouter) return 'chat';


    return 'chat';
};


// Register Chat Model Presets
CHAT_MODEL_PRESETS.forEach(preset => {
    if (!GOOGLE_MODEL_METADATA.has(preset.id)) {
        GOOGLE_MODEL_METADATA.set(preset.id, { name: preset.label, description: preset.description });
    }
});

export class KeyManager {
    private state: KeyManagerState;
    private listeners: Set<() => void> = new Set();
    private userId: string | null = null;
    private isSyncing = false;

    constructor() {
        this.state = this.loadState();
        // Ensure strategy exists for legacy state
        if (!this.state.rotationStrategy) {
            this.state.rotationStrategy = 'round-robin';
        }

        // Ensure loaded slots have sane defaults
        this.state.slots = this.state.slots.map(s => ({
            ...s,
            disabled: s.disabled ?? false,
            status: s.status || 'valid'
        }));
    }

    private getStorageKey(): string {
        if (!this.userId) return STORAGE_KEY; // Default global key for anon
        return `${STORAGE_KEY}_${this.userId}`;
    }

    /**
     * Add token usage to a key and update cost
     * 预算耗尽时自动将 key 移到队列末尾
     */
    addUsage(keyId: string, tokens: number): void {
        const slot = this.state.slots.find(s => s.id === keyId);
        if (slot) {
            slot.usedTokens = (slot.usedTokens || 0) + tokens;
            slot.updatedAt = Date.now(); // Update timestamp

            // Check budget - 预算耗尽时自动轮换
            if (slot.budgetLimit > 0 && slot.totalCost >= slot.budgetLimit) {
                console.log(`[KeyManager] API ${slot.name} 预算已耗尽 ($${slot.totalCost.toFixed(2)}/$${slot.budgetLimit})`);
                // Removed strategy-based rotation, now handled by external logic or just disabled
            }

            this.saveState();
            this.notifyListeners();
        }
    }




    /**
     * Load state from localStorage
     */
    private loadState(): KeyManagerState {
        try {
            const key = this.getStorageKey();
            const stored = localStorage.getItem(key);

            // If scoped key not found, DO NOT fallback to global key to prevent leakage.
            // Only fallback if userId is null (already handled by getStorageKey).

            if (stored) {
                const parsed = JSON.parse(stored);
                // Migration for existing keys
                const slots = (parsed.slots || []).map((s: any) => {
                    const provider = s.provider || 'Google';
                    const baseUrl = s.baseUrl || '';
                    const authMethod = s.authMethod || getDefaultAuthMethod(baseUrl);
                    const shouldOverrideHeader = !s.headerName || (
                        s.headerName === GOOGLE_HEADER_NAME &&
                        provider !== 'Google' &&
                        !baseUrl.toLowerCase().includes('google')
                    );
                    const headerName = shouldOverrideHeader ? inferHeaderName(provider, baseUrl, authMethod) : s.headerName;
                    const rawModels = Array.isArray(s.supportedModels) ? s.supportedModels : [];
                    // ✅ 直接使用存储的模型列表,不进行任何过滤或修改
                    const supportedModels = provider === 'Google' && rawModels.length === 0
                        ? [...DEFAULT_GOOGLE_MODELS]
                        : rawModels;

                    return {
                        ...s,
                        name: s.name || 'Unnamed Channel',
                        provider,
                        totalCost: s.totalCost || 0,
                        budgetLimit: s.budgetLimit !== undefined ? s.budgetLimit : -1,
                        tokenLimit: s.tokenLimit !== undefined ? s.tokenLimit : -1, // Default unlimited
                        type: s.type || (s.name?.startsWith('[代理]') ? 'proxy' : (provider === 'Google' ? 'official' : 'third-party')),
                        baseUrl,
                        authMethod,
                        headerName,
                        compatibilityMode: s.compatibilityMode || 'standard',
                        supportedModels,
                        disabled: s.disabled ?? false,
                        status: s.status || 'valid',
                        updatedAt: s.updatedAt || s.createdAt || Date.now() // Backfill updatedAt
                    };
                });

                const state: KeyManagerState = {
                    slots,
                    currentIndex: 0,
                    maxFailures: DEFAULT_MAX_FAILURES,
                    rotationStrategy: parsed.rotationStrategy || this.state?.rotationStrategy || 'round-robin'
                };

                // No immediate saveState here to avoid overwriting on read
                return state;
            }
        } catch (e) {
            console.warn('[KeyManager] Load failed:', e);
        }

        // Return empty state if nothing found (Fresh user / Fresh storage)
        return {
            slots: [],
            currentIndex: 0,
            maxFailures: DEFAULT_MAX_FAILURES,
            rotationStrategy: 'round-robin'
        };
    }

    private migrateFromOldFormat(): KeyManagerState {
        try {
            const oldKeys = localStorage.getItem('kk-api-keys-local');
            if (oldKeys) {
                const keys = JSON.parse(oldKeys) as string[];
                const slots: KeySlot[] = keys
                    .filter(k => k && k.trim())
                    .map((key, i) => ({
                        id: `key_${Date.now()}_${i}`,
                        key: key.trim(),
                        name: `Migrated Key ${i + 1}`,
                        provider: 'Google',
                        status: 'unknown' as const,
                        failCount: 0,
                        successCount: 0,
                        lastUsed: null,
                        lastError: null,
                        disabled: false,
                        createdAt: Date.now(),
                        totalCost: 0,
                        budgetLimit: -1,
                        tokenLimit: -1,
                        supportedModels: [...DEFAULT_GOOGLE_MODELS],
                        baseUrl: '',
                        authMethod: 'query',
                        headerName: 'x-goog-api-key',
                        type: 'official', // ✨ Default to official for old keys
                        updatedAt: Date.now() // Set initial timestamp
                    }));

                if (slots.length > 0) {
                    console.log(`[KeyManager] Migrated ${slots.length} keys from old format`);
                    const state: KeyManagerState = {
                        slots,
                        currentIndex: 0,
                        maxFailures: DEFAULT_MAX_FAILURES,
                        rotationStrategy: 'round-robin'
                    };
                    this.saveState(state);
                    return state;
                }
            }
        } catch (e) {
            console.warn('[KeyManager] Migration failed:', e);
        }

        return {
            slots: [],
            currentIndex: 0,
            maxFailures: DEFAULT_MAX_FAILURES,
            rotationStrategy: 'round-robin'
        };
    }

    /**
     * Save state to localStorage (Only for anonymous users) or Cloud (For logged in)
     */
    private async saveState(state?: KeyManagerState): Promise<void> {
        const toSave = state || this.state;
        const key = this.getStorageKey();

        try {
            // 🔒 Security Update: 
            // 如果用户已登录，不再保存到本地 localStorage，防止泄露。
            // 仅保存在内存中，并同步到云端。
            if (this.userId) {
                console.log('[KeyManager] 🔒 用户已登录，跳过本地存储，仅使用云端同步。');
                // Optional: Clear existing local storage just in case
                localStorage.removeItem(key);

                // Sync to cloud
                if (!this.isSyncing) {
                    await this.saveToCloud(toSave);
                }
            } else {
                // 匿名用户：必须保存到本地，否则刷新后丢失
                localStorage.setItem(key, JSON.stringify(toSave));
                console.log('[KeyManager] ✅ (匿名) localStorage保存成功!', key);
            }

        } catch (e) {
            console.error('[KeyManager] ❌ Failed to save state:', e);
        }
    }

    /**
     * Set user ID and sync with cloud
     */
    async setUserId(userId: string | null) {
        if (this.userId === userId) return;

        // Unsubscribe from previous user's channel if exists
        this.unsubscribeRealtime();

        this.userId = userId;

        // Reset state to empty/initial before loading from cloud
        // This ensures no leakage from previous user or anon state
        this.state = {
            slots: [],
            currentIndex: 0,
            maxFailures: DEFAULT_MAX_FAILURES,
            rotationStrategy: 'round-robin'
        };
        this.notifyListeners();

        if (userId) {
            console.log('[KeyManager] 👤 用户登录:', userId);

            // 1. Load from cloud (Authoritative)
            await this.loadFromCloud();

            // 2. Subscribe to Realtime Changes
            this.subscribeRealtime(userId);
        } else {
            // Logout: Load from global (anon) storage
            console.log('[KeyManager] 👤 用户登出');
            this.state = this.loadState();
            this.notifyListeners();
        }
    }

    private realtimeChannel: any = null;

    private subscribeRealtime(userId: string) {
        console.log('[KeyManager] 🔌 连接实时更新频道...');
        this.realtimeChannel = supabase.channel(`user_settings:${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'user_settings',
                    filter: `user_id=eq.${userId}`
                },
                async (payload) => {
                    console.log('[KeyManager] ⚡ 收到云端实时更新!', payload);
                    // Avoid infinite loop if this client caused the update
                    // Ideally check a 'last_modified_by' field, but strict "Cloud is Truth" works too
                    // as long as loadFromCloud doesn't trigger saveToCloud immediately.
                    if (!this.isSyncing) {
                        await this.loadFromCloud();
                    }
                }
            )
            .subscribe();
    }

    private unsubscribeRealtime() {
        if (this.realtimeChannel) {
            console.log('[KeyManager] 🔌 断开实时更新频道');
            supabase.removeChannel(this.realtimeChannel);
            this.realtimeChannel = null;
        }
    }

    /**
     * Load state from Supabase (Cloud is Source of Truth)
     */
    private async loadFromCloud(localKeys: KeySlot[] = []) { // localKeys arg kept for compatibility but ignored for logged-in
        if (!this.userId) return;

        // Skip cloud load for Dev User
        if (this.userId.startsWith('dev-user-')) return;

        try {
            this.isSyncing = true;
            console.log('[KeyManager] ☁️ 正在从云端拉取数据...');

            const { data, error } = await supabase
                .from('user_settings')
                .select('api_keys')
                .eq('user_id', this.userId)
                .single();

            if (error) {
                if (error.code !== 'PGRST116') {
                    console.warn('[KeyManager] Cloud fetch failed:', error);
                }
                // If not found, it means empty cloud state. 
                // We do NOT merge local keys anymore strictly.
                // Or maybe we treat first login as "Import"? 
                // Let's stick to "Cloud is Truth". If cloud empty -> local empty.
                return;
            }

            if (data && data.api_keys) {
                let cloudSlots = data.api_keys as KeySlot[];
                if (Array.isArray(cloudSlots)) {
                    // Backfill new fields
                    cloudSlots = cloudSlots.map(s => ({
                        ...s,
                        name: s.name || 'Cloud Key',
                        provider: s.provider || 'Gemini',
                        totalCost: s.totalCost || 0,
                        budgetLimit: s.budgetLimit !== undefined ? s.budgetLimit : -1,
                        tokenLimit: s.tokenLimit !== undefined ? s.tokenLimit : -1,
                        supportedModels: s.supportedModels || [],
                        updatedAt: s.updatedAt || s.createdAt || Date.now()
                    }));

                    // 🔒 Security & Sync Update:
                    // 完全信任云端数据 (Cloud Authoritative)
                    // 不再进行合并，直接覆盖本地状态。
                    // 这样 A 电脑删除，Cloud 只有 N-1，B 电脑拉取后也只有 N-1，实现删除同步。
                    this.state.slots = cloudSlots;

                    console.log(`[KeyManager] ✅ 云端数据同步完成 (覆盖模式). Keys: ${this.state.slots.length}`);
                    this.notifyListeners();
                }
            }
        } catch (e) {
            console.error('[KeyManager] Error loading from cloud:', e);
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Update budgets and usage from Cloud (called by CostService)
     */
    updateBudgetsFromCloud(budgets: { id: string, budget: number, used?: number }[]): void {
        const slots = this.state.slots;
        let changed = false;

        budgets.forEach(b => {
            const slot = slots.find(s => s.id === b.id);
            if (slot) {
                if (b.budget !== undefined && slot.budgetLimit !== b.budget) {
                    slot.budgetLimit = b.budget;
                    changed = true;
                }
                if (b.used !== undefined && (slot.totalCost || 0) < b.used) {
                    slot.totalCost = b.used;
                    changed = true;
                }
            }
        });

        if (changed) {
            this.saveState();
            this.notifyListeners();
        }
    }


    /**
     * Save state to Supabase
     */
    private async saveToCloud(state: KeyManagerState) {
        if (!this.userId || this.userId.startsWith('dev-user-')) {
            console.log('[KeyManager] ⚠️ 跳过云端上传 (无userId或dev用户)');
            return;
        }

        try {
            console.log('[KeyManager] 📤 开始上传到Supabase...', {
                userId: this.userId,
                slots数量: state.slots.length
            });

            // 1. 先验证当前用户身份
            const { data: { user }, error: authError } = await supabase.auth.getUser();

            if (authError || !user) {
                console.error('[KeyManager] ❌ 用户未登录或session过期!', authError);
                return;
            }

            console.log('[KeyManager] ✅ 用户验证成功:', user.id);

            // 2. 确保userId一致
            if (user.id !== this.userId) {
                console.error('[KeyManager] ❌ userId不匹配!', {
                    expected: this.userId,
                    actual: user.id
                });
                this.userId = user.id; // 更新userId
            }

            // 3. 准备上传数据
            const uploadData = {
                user_id: user.id, // 使用验证后的user.id
                api_keys: state.slots,
                updated_at: new Date().toISOString()
            };

            console.log('[KeyManager] 💾 执行upsert...', {
                user_id: uploadData.user_id,
                模型数量: state.slots[0]?.supportedModels?.length
            });

            // 4. 执行upsert (RLS策略会检查auth.uid() = user_id)
            const { data, error } = await supabase
                .from('user_settings')
                .upsert(uploadData, {
                    onConflict: 'user_id' // 明确指定冲突字段
                })
                .select();

            if (error) {
                console.error('[KeyManager] ❌ Supabase upsert失败!', {
                    code: error.code,
                    message: error.message,
                    details: error.details,
                    hint: error.hint
                });

                // 如果是RLS错误,提示用户
                if (error.code === '42501' || error.message.includes('policy')) {
                    console.error('[KeyManager] ⚠️ RLS策略阻止! 请检查Supabase RLS设置');
                }

                throw error;
            }

            console.log('[KeyManager] ✅ Supabase上传成功!', data);

            // 5. 触发costService同步
            const { forceSync } = await import('./costService');
            forceSync().catch(console.error);

        } catch (e) {
            console.error('[KeyManager] ❌ saveToCloud异常:', e);
        }
    }

    /**
     * Notify all listeners of state change
     */
    private notifyListeners(): void {
        this.listeners.forEach(fn => fn());
    }

    /**
     * Subscribe to state changes
     */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }



    /**
     * Test a potential channel connection
     */
    async testChannel(
        url: string,
        key: string,
        provider?: string,
        authMethod?: AuthMethod,
        headerName?: string
    ): Promise<{ success: boolean, message?: string }> {
        try {
            let targetUrl = url;
            const headers: Record<string, string> = {};

            // Pre-process URL
            const cleanUrl = url.replace(/\/chat\/completions$/, '').replace(/\/$/, '');

            const resolvedAuthMethod = authMethod || getDefaultAuthMethod(cleanUrl);
            const resolvedHeader = headerName || inferHeaderName(provider, cleanUrl, resolvedAuthMethod);

            if (url.includes('generativelanguage.googleapis.com') || provider === 'Google') {
                // Google Native Logic
                if (cleanUrl === 'https://generativelanguage.googleapis.com') {
                    // Default Google Base
                    targetUrl = `${cleanUrl}/v1beta/models`;
                } else if (!cleanUrl.endsWith('/models')) {
                    // Custom Google Proxy? Try appending models if missing
                    targetUrl = `${cleanUrl}/models`;
                }

                // Google uses Query Param or x-goog-api-key header
                // We'll use the header for cleanliness, works on v1beta
                if (resolvedAuthMethod === 'query') {
                    targetUrl = `${targetUrl}?key=${key}`;
                } else {
                    headers[resolvedHeader] = key;
                }
                // headers['Content-Type'] = 'application/json'; // Not strictly triggered for GET
            } else {
                // OpenAI Compatible Logic - 🚀 [Fix] Use /v1/models for proxy compatibility
                const cleanBaseUrl = cleanUrl.replace(/\/v1$/, '').replace(/\/v1\/models$/, '').replace(/\/models$/, '');
                targetUrl = `${cleanBaseUrl}/v1/models`;
                const headerValue = resolvedHeader.toLowerCase() === 'authorization'
                    ? (key.toLowerCase().startsWith('bearer ') ? key : `Bearer ${key}`)
                    : key;
                headers[resolvedHeader] = headerValue;
            }

            // console.log(`[TestChannel] Testing ${targetUrl} (Provider: ${provider})...`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort("Request Timed Out"), 15000); // Increased to 15s

            try {
                const response = await fetch(targetUrl, {
                    method: 'GET',
                    headers,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (response.ok) {
                    return { success: true };
                }

                // Google often returns 400/403 with detailed JSON
                let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    if (errorData.error && errorData.error.message) {
                        errorMsg = errorData.error.message;
                    }
                } catch (e) {
                    // Ignore json parse error
                }

                return { success: false, message: errorMsg };
            } catch (e: any) {
                clearTimeout(timeoutId);
                const isAbort = e.name === 'AbortError' || e.message?.includes('aborted');
                return {
                    success: false,
                    message: isAbort ? 'Request Timed Out (Check Network/Proxy)' : (e.message || 'Connection failed')
                };
            }
        } catch (e: any) {
            return { success: false, message: e.message || 'Connection failed' };
        }
    }

    /**
     * Fetch available models from a remote API
     * Returns a list of model IDs or empty array on failure
     * SIDE EFFECT: Updates GOOGLE_MODEL_METADATA with rich info if available
     */
    async fetchRemoteModels(baseUrl: string, key: string, authMethod?: AuthMethod, headerName?: string, provider?: string): Promise<string[]> {
        try {
            const cleanUrl = baseUrl.replace(/\/chat\/completions$/, '').replace(/\/$/, '');
            let targetUrls = [
                cleanUrl.endsWith('/models') ? cleanUrl : `${cleanUrl}/models`,
            ];

            if (!cleanUrl.match(/\/v1\/?$/) && !cleanUrl.match(/\/v1beta\/?$/)) {
                targetUrls.push(`${cleanUrl}/v1/models`);
                targetUrls.push(`${cleanUrl}/v1beta/models`);
            }

            targetUrls = [...new Set(targetUrls)];

            const resolvedAuthMethod = authMethod || 'query'; // Simplified default
            const resolvedHeader = headerName || 'Authorization';
            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

            if (resolvedAuthMethod !== 'query') {
                headers[resolvedHeader] = resolvedHeader.toLowerCase() === 'authorization'
                    ? (key.toLowerCase().startsWith('bearer ') ? key : `Bearer ${key}`)
                    : key;
            }

            // OpenRouter CORS Fix
            if (cleanUrl.includes('openrouter.ai')) {
                headers['HTTP-Referer'] = window.location.origin; // Required by OpenRouter
                headers['X-Title'] = 'KK Studio'; // Optional
            }

            // Try each URL until one works
            for (const url of targetUrls) {
                try {
                    const fullUrl = resolvedAuthMethod === 'query' ? `${url}?key=${key}` : url;

                    // Use manual AbortController for broader compatibility
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort("Request Timed Out"), 8000);

                    const response = await fetch(fullUrl, {
                        method: 'GET',
                        headers,
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);

                    if (response.ok) {
                        const data = await response.json();
                        const list = data.data || data.models || [];
                        if (Array.isArray(list)) {
                            // Process metadata if available (OpenRouter style)
                            list.forEach((m: any) => {
                                const id = m.id || m.name;
                                if (!id) return;

                                const existing = GOOGLE_MODEL_METADATA.get(id);
                                const metadata: any = {
                                    name: m.name || existing?.name || id,
                                    description: m.description || existing?.description,
                                    // OpenRouter specific fields
                                    contextLength: m.context_length || m.context_window,
                                    pricing: m.pricing // { prompt: "0.000001", completion: "0.000002" } check API docs
                                };

                                // Explicitly handle OpenRouter free tagging
                                if (id.endsWith(':free')) {
                                    metadata.pricing = { prompt: '0', completion: '0' };
                                }

                                GOOGLE_MODEL_METADATA.set(id, { ...existing, ...metadata });
                            });

                            // Return all models - filtering by type happens at usage time
                            // Chat models are needed for chat functionality
                            // Image/video models are needed for generation
                            let models = list.map((m: any) => {
                                const id = m.id || m.name;
                                // Normalize: remove 'models/' prefix if present for consistent matching
                                return id ? id.replace(/^models\//, '') : null;
                            }).filter(Boolean);

                            // Auto-add Google chat models for Google provider
                            if (provider === 'Google') {
                                const googleModelIds = GOOGLE_CHAT_MODELS.map(m => m.id);
                                googleModelIds.forEach(modelId => {
                                    if (!models.includes(modelId)) {
                                        models.push(modelId);
                                    }
                                });
                            }

                            return models;
                        }
                    }
                } catch { /* continue */ }
            }
            return [];
        } catch (e) {
            console.error('Fetch models failed', e);
            return [];
        }
    }

    /**
     * Set rotation strategy
     */
    setStrategy(strategy: 'round-robin' | 'sequential') {

        this.state.rotationStrategy = strategy;
        this.saveState();
        this.notifyListeners();
    }

    /**
     * Get the current rotation strategy
     */
    getStrategy(): 'round-robin' | 'sequential' {
        return this.state.rotationStrategy || 'round-robin'; // Default to round-robin
    }

    /**
     * Get the best available channel for a specific model
     * Strategy:
     * 1. Filter channels that support the model
     * 2. Filter healthy channels (Active, Valid, Budget OK)
     * 3. Apply Rotation Strategy (Round Robin vs Sequential)
     */
    getNextKey(modelId: string): {
        id: string;
        key: string;
        baseUrl: string;
        authMethod: AuthMethod;
        headerName: string;
        group?: string;
        provider: string;
    } | null {
        // Parse the requested ID to separate base model and suffix
        // Format: modelId@Suffix or just modelId
        const [baseIdPart, suffix] = modelId.split('@');
        // If no suffix, it implies Official/Google or specific mapping

        // Normalize the requested model ID: remove 'models/' prefix if present
        const normalizedModelId = baseIdPart.replace(/^models\//, '');

        // 1. Filter by Model Support AND Provider/Pool match
        const candidates = this.state.slots.filter(s => {
            // Check if slot supports the base model
            const supportsModel = (s.supportedModels || []).some(m => {
                const storedId = parseModelString(m).id.replace(/^models\//, '');
                return storedId === normalizedModelId;
            });

            if (!supportsModel) return false;

            // Check if slot matches the requested pool (via suffix)
            if (suffix) {
                // Special handling for "Custom" suffix: Match any non-Google key if exact match fails
                const slotSuffix = s.proxyConfig?.serverName || s.provider || 'Custom';

                if (suffix === 'Custom') {
                    // unexpected "Custom" request? Default to any non-google key that has this model
                    return s.provider !== 'Google';
                }

                return slotSuffix === suffix;
            } else {
                // No suffix -> Official Google
                return s.provider === 'Google';
            }
        });

        if (candidates.length === 0) return null;

        // 2. Filter Healthy
        const healthy = candidates.filter(s =>
            !s.disabled &&
            s.status !== 'invalid' &&
            (s.budgetLimit < 0 || s.totalCost < s.budgetLimit)
        );

        if (healthy.length === 0) return null;

        // 3. Apply Strategy
        // Common Sort: Valid > Unknown > Rate Limited
        healthy.sort((a, b) => {
            if (a.status === 'valid' && b.status !== 'valid') return -1;
            if (a.status !== 'valid' && b.status === 'valid') return 1;
            // Secondary Sort: Stable Order (by Index/ID) for Sequential
            // tertiary sort by creation time or just preserve index order
            return 0;
        });

        // Determine Selection
        const strategy = this.state.rotationStrategy || 'round-robin';
        let winner: KeySlot;

        if (strategy === 'sequential') {
            // SEQUENTIAL: Always pick the first healthy key (Stable Priority)
            // This ensures we burn through Key 1 before touching Key 2
            winner = healthy[0];
        } else {
            // ROUND-ROBIN / CONCURRENT: Pick random from top tier to distribute load
            const topStatus = healthy[0].status;
            const topTier = healthy.filter(s => s.status === topStatus);
            winner = topTier[Math.floor(Math.random() * topTier.length)];
        }

        return this.prepareKeyResult(winner);
    }

    /**
     * Get available proxy models with default capabilities
     * Used by modelCapabilities.ts
     */
    getAvailableProxyModels(): { id: string; supportedAspectRatios: any[]; supportedSizes: any[]; supportsGrounding: boolean }[] {
        const models = new Map<string, any>();
        // Import enums to avoid circular dependency if possible, or just use strings if suitable. 
        // Actually we can access AspectRatio/ImageSize from imports if available, but to avoid circular deps with types.ts if this file imports it...
        // KeyManager imports types from apiConfig? No.
        // Let's assume defaults.
        const defaultRatios = ['1:1', '3:4', '4:3', '9:16', '16:9', '21:9', '2:3', '3:2'];
        const defaultSizes = ['1024x1024', '1344x768', '768x1344']; // Approximate

        this.state.slots.forEach(s => {
            // Check if proxy (has baseUrl)
            if (s.baseUrl && !s.disabled && s.status !== 'invalid') {
                (s.supportedModels || []).forEach(m => {
                    if (!models.has(m)) {
                        models.set(m, {
                            id: m,
                            supportedAspectRatios: defaultRatios,
                            supportedSizes: defaultSizes,
                            supportsGrounding: false
                        });
                    }
                });
            }
        });
        return Array.from(models.values());
    }

    /**
     * Helper to format the key result and update metadata
     */
    private prepareKeyResult(slot: KeySlot) {
        // Update last used timestamp
        const actualSlot = this.state.slots.find(s => s.id === slot.id);
        if (actualSlot) {
            actualSlot.lastUsed = Date.now();
            this.saveState();
        }

        return {
            id: slot.id,
            key: slot.key,
            baseUrl: slot.baseUrl || GOOGLE_API_BASE,
            authMethod: slot.authMethod || 'query',
            headerName: slot.headerName || 'x-goog-api-key',
            compatibilityMode: slot.compatibilityMode || 'standard',
            group: slot.group,
            provider: slot.provider || 'Google'
        };
    }

    /**
     * Report successful API call
     */
    reportSuccess(keyId: string): void {
        const slot = this.state.slots.find(s => s.id === keyId);
        if (slot) {
            slot.status = 'valid';
            slot.successCount++;
            slot.failCount = 0; // Reset fail count on success
            slot.lastError = null;
            this.saveState();
            this.notifyListeners();
        }
    }

    /**
     * Report failed API call
     */
    reportFailure(keyId: string, error: string): void {
        const slot = this.state.slots.find(s => s.id === keyId);
        if (slot) {
            slot.failCount++;
            slot.lastError = error;
            slot.lastUsed = Date.now();

            if (error.includes('429') || error.includes('rate limit')) {
                slot.status = 'rate_limited';
            } else if (error.includes('401') || error.includes('403') || error.includes('invalid')) {
                slot.status = 'invalid';
            }

            this.saveState();
            this.notifyListeners();
        }
    }
    /**
     * Toggle disabled state for manual pause/resume
     * 暂停的 key 会移到顺序队列末尾
     */
    toggleKey(keyId: string): void {
        const slot = this.state.slots.find(s => s.id === keyId);
        if (slot) {
            slot.disabled = !slot.disabled;
            if (!slot.disabled) {
                // Optimistic unpause: Assume valid to allow immediate usage without auto-check
                // If it fails, standard error handling will mark it invalid/rate_limited
                slot.status = 'valid';
                slot.failCount = 0;
                slot.lastError = null;
            }
            this.saveState();
            this.notifyListeners();
        }
    }


    /**
     * Update quota information for a key
     */
    updateQuota(keyId: string, quota: KeySlot['quota']): void {
        const slot = this.state.slots.find(s => s.id === keyId);
        if (slot && quota) {
            slot.quota = quota;
            this.saveState();
            this.notifyListeners();
        }
    }

    /**
     * Add exact cost usage to a key (syncs with CostService)
     */
    addCost(keyId: string, cost: number): void {
        const slot = this.state.slots.find(s => s.id === keyId);
        if (slot) {
            slot.totalCost = (slot.totalCost || 0) + cost;
            this.saveState();
            this.notifyListeners();
        }
    }



    /**
     * Clear all keys (e.g. on user switch)
     */
    clearAll() {
        this.state.slots = [];
        this.state.currentIndex = 0;
        this.saveState();
        this.notifyListeners();
    }

    /**
     * Reorder slots (for manual sorting)
     */
    reorderSlots(fromIndex: number, toIndex: number) {
        if (fromIndex < 0 || fromIndex >= this.state.slots.length ||
            toIndex < 0 || toIndex >= this.state.slots.length) return;

        const slots = [...this.state.slots];
        const [moved] = slots.splice(fromIndex, 1);
        slots.splice(toIndex, 0, moved);

        this.state.slots = slots;
        this.saveState();
        this.notifyListeners();
    }

    async addKey(key: string, options?: {
        name?: string;
        provider?: string;
        baseUrl?: string;
        authMethod?: AuthMethod;
        headerName?: string;
        supportedModels?: string[];
        budgetLimit?: number;
        tokenLimit?: number;
        type?: 'official' | 'proxy' | 'third-party';
        proxyConfig?: { serverName?: string };
    }): Promise<{ success: boolean; error?: string; id?: string }> {
        const trimmedKey = key.trim();

        if (!trimmedKey) {
            return { success: false, error: '请输入 API Key' };
        }

        // Check for duplicates
        if (this.state.slots.some(s => s.key === trimmedKey && s.baseUrl === options?.baseUrl)) {
            return { success: false, error: '该 Key 已存在' };
        }

        const baseUrl = options?.baseUrl || '';
        const authMethod = options?.authMethod || getDefaultAuthMethod(baseUrl);
        const headerName = options?.headerName || inferHeaderName(options?.provider || 'Custom', baseUrl, authMethod);

        // Initialize supportedModels
        let supportedModels = options?.supportedModels || [];

        // Auto-add all Google chat models for Google provider
        if (options?.provider === 'Google') {
            const googleModelIds = GOOGLE_CHAT_MODELS.map(m => m.id);
            googleModelIds.forEach(modelId => {
                if (!supportedModels.includes(modelId)) {
                    supportedModels.push(modelId);
                }
            });
        }

        // ✨ 自动校正模型列表（将旧模型迁移到新模型）
        supportedModels = normalizeModelList(supportedModels);

        const newSlot: KeySlot = {
            id: `key_${Date.now()}`,
            key: trimmedKey,
            name: options?.name || 'My Channel',
            // Default provider logic
            provider: options?.provider || 'Custom',
            // Default type logic: if explicit, use it. Else if provider is Google, official. Else third-party.
            type: options?.type || (options?.provider === 'Google' ? 'official' : 'third-party'),
            baseUrl,
            authMethod,
            headerName,
            supportedModels,
            status: 'unknown',
            failCount: 0,
            successCount: 0,
            lastUsed: null,
            lastError: null,
            disabled: false,
            createdAt: Date.now(),
            totalCost: 0,
            budgetLimit: options?.budgetLimit ?? -1,
            tokenLimit: options?.tokenLimit ?? -1,
            proxyConfig: options?.proxyConfig,
            updatedAt: Date.now() // Initial timestamp
        };

        this.state.slots.push(newSlot);
        this.saveState();
        this.notifyListeners();

        return {
            success: true,
            id: newSlot.id
        };
    }

    /**
     * Remove an API key
     */
    removeKey(keyId: string): void {
        this.state.slots = this.state.slots.filter(s => s.id !== keyId);
        this.saveState();
        this.notifyListeners();
    }

    /**
 * Update an existing API key
 */
    async updateKey(id: string, updates: Partial<KeySlot>): Promise<void> {
        console.log('[KeyManager] 🔧 updateKey被调用!', {
            id,
            updates,
            当前模型: this.state.slots.find(s => s.id === id)?.supportedModels
        });
        const slot = this.state.slots.find(s => s.id === id);
        if (slot) {
            Object.assign(slot, updates);
            // Ensure supportedModels is always an array
            if (updates.supportedModels) {
                // ✅ 直接使用用户提供的模型,不自动过滤或修改
                slot.supportedModels = updates.supportedModels;
            }
            slot.updatedAt = Date.now(); // Update timestamp
            await this.saveState();
            this.notifyListeners();
        }
    }



    /**
     * Validate an API key by making a test request
     */
    async validateKey(key: string, provider: string = 'Gemini'): Promise<{ valid: boolean; error?: string }> {
        if (provider !== 'Gemini') {
            return { valid: true }; // Skip validation for other providers for now
        }

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
                { method: 'GET' }
            );

            // Capture Quota Headers
            const limitRequests = response.headers.get('x-ratelimit-limit-requests');
            const remainingRequests = response.headers.get('x-ratelimit-remaining-requests');
            const resetRequests = response.headers.get('x-ratelimit-reset-requests');

            // Find keyId if it exists (for existing keys being re-validated)
            const existingSlot = this.state.slots.find(s => s.key === key);
            if (existingSlot && (limitRequests || remainingRequests)) {
                const resetSeconds = resetRequests ? (parseInt(resetRequests) || 0) : 0;
                this.updateQuota(existingSlot.id, {
                    limitRequests: parseInt(limitRequests || '0'),
                    remainingRequests: parseInt(remainingRequests || '0'),
                    resetConstant: resetRequests || '',
                    resetTime: Date.now() + (resetSeconds * 1000),
                    updatedAt: Date.now()
                });
            }

            if (response.ok) {
                return { valid: true };
            } else if (response.status === 429) {
                return { valid: true, error: '有效但已限流' };
            } else if (response.status === 401 || response.status === 403) {
                return { valid: false, error: 'API Key 无效' };
            } else {
                return { valid: false, error: `HTTP ${response.status}` };
            }
        } catch (e: any) {
            return { valid: false, error: e.message || '网络错误' };
        }
    }

    /**
     * Update compatibility mode for a specific key (Persistence)
     * Used by GeminiService to remember working API format
     */
    public setKeyCompatibilityMode(keyId: string, mode: 'standard' | 'chat') {
        const slotIndex = this.state.slots.findIndex(s => s.id === keyId);
        if (slotIndex === -1) return;

        console.log(`[KeyManager] Persisting compatibility mode for key ${keyId}: ${mode}`);

        // Update state
        this.state.slots[slotIndex].compatibilityMode = mode;
        this.saveState();

        this.notifyListeners();
    }

    public getKey(id: string): KeySlot | undefined {
        return this.state.slots.find(s => s.id === id);
    }
    /**
     * Refresh a single key
     */
    async refreshKey(id: string): Promise<void> {
        const slot = this.state.slots.find(s => s.id === id);
        if (slot) {
            const result = await this.validateKey(slot.key, slot.provider);
            slot.status = result.valid ? 'valid' : 'invalid';
            slot.lastError = result.error || null;
            if (result.valid) {
                slot.disabled = false;
                slot.failCount = 0;
            }
            this.saveState();
            this.notifyListeners();
        }
    }

    /**
     * Re-validate all keys
     */
    async revalidateAll(): Promise<void> {
        for (const slot of this.state.slots) {
            const result = await this.validateKey(slot.key, slot.provider);
            slot.status = result.valid ? 'valid' : 'invalid';
            slot.lastError = result.error || null;
            if (result.valid) {
                slot.disabled = false;
                slot.failCount = 0;
            }
        }
        this.saveState();
        this.notifyListeners();
    }

    /**
     * Get validated global model list from all channels (Standard + Custom)
     */
    /**
     * Get validated global model list from all channels (Standard + Custom)
     * SORTING ORDER: User Custom Models (Top) -> Standard Google Models (Bottom)
     */
    getGlobalModelList(): { id: string; name: string; provider: string; isCustom: boolean; type: GlobalModelType; icon?: string; description?: string }[] {
        console.log('[keyManager.getGlobalModelList] 开始获取全局模型列表');
        console.log('[keyManager.getGlobalModelList] slots数量:', this.state.slots.length);
        console.log('[keyManager.getGlobalModelList] 激活的slots:', this.state.slots.filter(s => !s.disabled && s.status !== 'invalid').map(s => ({ id: s.id, name: s.name, supportedModels: s.supportedModels })));

        const uniqueModels = new Map<string, { id: string; name: string; provider: string; isCustom: boolean; type: GlobalModelType; icon?: string; description?: string }>();
        const chatModelIds = new Set(GOOGLE_CHAT_MODELS.map(model => model.id));

        // 1. Add models from all active keys (Proxies/Custom) - THESE GO FIRST
        this.state.slots.forEach(slot => {
            if (slot.disabled || slot.status === 'invalid') return;
            if (slot.supportedModels && slot.supportedModels.length > 0) {
                slot.supportedModels.forEach(rawModelStr => {
                    const { id, name, description } = parseModelString(rawModelStr);

                    // ✨ Construct Distinct ID based on Provider/Pool
                    let distinctId = id;
                    const isGoogleKey = slot.provider === 'Google';

                    if (!isGoogleKey) {
                        // Suffix with Server Name (preferred for Proxies) or Provider
                        // e.g., "gemini-1.5-pro@MyProxy"
                        const suffix = slot.proxyConfig?.serverName || slot.provider || 'Custom';
                        distinctId = `${id}@${suffix}`;
                    }

                    // Only add if not already present
                    if (!uniqueModels.has(distinctId)) {
                        const meta = GOOGLE_MODEL_METADATA.get(id);
                        const mappedType = MODEL_TYPE_MAP.get(id);
                        const isGoogleProvider = slot.provider === 'Google' || chatModelIds.has(id);
                        const inferredType = mappedType || inferModelType(id);

                        // Use parsed name/desc if available, otherwise use model display name
                        const displayName = name || (meta ? meta.name : null);
                        // 如果没有自定义名称也没有 meta，根据模型 ID 推断友好名称
                        let inferredModelName = id;
                        const lowerId = id.toLowerCase();
                        if (lowerId.includes('gemini-3-pro') || lowerId.includes('nano-banana-pro')) {
                            inferredModelName = 'Nano Banana Pro';
                        } else if (lowerId.includes('gemini-2.5-flash-image') || lowerId.includes('nano-banana')) {
                            inferredModelName = 'Nano Banana';
                        } else if (lowerId.includes('imagen-4') && lowerId.includes('ultra')) {
                            inferredModelName = 'Imagen 4 Ultra';
                        } else if (lowerId.includes('imagen-4') && lowerId.includes('fast')) {
                            inferredModelName = 'Imagen 4 Fast';
                        } else if (lowerId.includes('imagen-4')) {
                            inferredModelName = 'Imagen 4';
                        } else if (lowerId.includes('imagen-3')) {
                            inferredModelName = 'Imagen 3';
                        } else if (lowerId.includes('veo-3.1') && lowerId.includes('fast')) {
                            inferredModelName = 'Veo 3.1 Fast';
                        } else if (lowerId.includes('veo-3.1')) {
                            inferredModelName = 'Veo 3.1';
                        } else if (lowerId.includes('veo-3') && lowerId.includes('fast')) {
                            inferredModelName = 'Veo 3 Fast';
                        } else if (lowerId.includes('veo-3')) {
                            inferredModelName = 'Veo 3';
                        } else if (lowerId.includes('veo')) {
                            inferredModelName = 'Veo 2';
                        }
                        const finalName = displayName || inferredModelName;
                        const finalDesc = description || (meta ? meta.description : `通过 ${slot.name || slot.provider} 调用`);

                        if (meta) {
                            // If we have metadata (it's a known model), we still want to use User's Name/Desc overrides if provided
                            // But distinct "isCustom" based on provider
                            uniqueModels.set(distinctId, {
                                id: distinctId,
                                name: finalName,
                                provider: slot.provider,
                                isCustom: false, // It's a known model, just via proxy
                                type: inferredType,
                                icon: meta.icon,
                                description: finalDesc
                            });
                        } else {
                            // Truly custom/unknown model
                            uniqueModels.set(distinctId, {
                                id: distinctId,
                                name: finalName,
                                provider: slot.provider,
                                isCustom: true,
                                type: inferredType,
                                description: finalDesc
                            });
                        }
                    }
                });
            }
        });

        // 2. Add Standard Google Models if any Google key exists - THESE GO LAST
        // Only add if NOT already added by user custom list
        const hasGoogleKey = this.state.slots.some(s => s.provider === 'Google' && !s.disabled && s.status !== 'invalid');
        if (hasGoogleKey) {
            GOOGLE_CHAT_MODELS.forEach(model => {
                if (!uniqueModels.has(model.id)) {
                    // 推断正确的模型类型
                    const inferredType = MODEL_TYPE_MAP.get(model.id) || inferModelType(model.id);

                    uniqueModels.set(model.id, {
                        id: model.id,
                        name: model.name,
                        provider: 'Google',
                        isCustom: false,
                        type: inferredType,
                        icon: model.icon,
                        description: model.description
                    });
                }
            });
        }


        const result = Array.from(uniqueModels.values());
        console.log('[keyManager.getGlobalModelList] 最终返回模型数量:', result.length);
        console.log('[keyManager.getGlobalModelList] 模型详情:', result.map(m => ({ id: m.id, name: m.name, type: m.type, provider: m.provider })));
        return result;
    }

    /**
     * Get all key slots
     */
    getSlots(): KeySlot[] {
        return [...this.state.slots];
    }

    /**
     * Get statistics
     */
    getStats(): {
        total: number;
        valid: number;
        invalid: number;
        disabled: number;
        rateLimited: number;
    } {
        const slots = this.state.slots;
        return {
            total: slots.length,
            valid: slots.filter(s => s.status === 'valid' && !s.disabled).length,
            invalid: slots.filter(s => s.status === 'invalid').length,
            disabled: slots.filter(s => s.disabled).length,
            rateLimited: slots.filter(s => s.status === 'rate_limited').length
        };
    }

    /**
     * Check if any valid keys are available
     */
    hasValidKeys(): boolean {
        return this.state.slots.some(s => !s.disabled && s.status !== 'invalid');
    }

    /**
     * Set max failures threshold
     */
    setMaxFailures(count: number): void {
        this.state.maxFailures = Math.max(1, count);
        this.saveState();
    }

    // =========================================================================
    // 🆕 第三方 API 服务商管理方法
    // =========================================================================

    private providers: ThirdPartyProvider[] = [];

    /**
     * 获取所有第三方服务商
     */
    getProviders(): ThirdPartyProvider[] {
        this.loadProviders();
        return [...this.providers];
    }

    /**
     * 获取单个服务商
     */
    getProvider(id: string): ThirdPartyProvider | undefined {
        this.loadProviders();
        return this.providers.find(p => p.id === id);
    }

    /**
     * 添加新的第三方服务商
     */
    addProvider(config: Omit<ThirdPartyProvider, 'id' | 'usage' | 'status' | 'createdAt' | 'updatedAt'>): ThirdPartyProvider {
        this.loadProviders();

        const now = Date.now();
        const provider: ThirdPartyProvider = {
            ...config,
            id: `provider_${now}_${Math.random().toString(36).substr(2, 9)}`,
            usage: {
                totalTokens: 0,
                totalCost: 0,
                dailyTokens: 0,
                dailyCost: 0,
                lastReset: now
            },
            status: 'checking',
            createdAt: now,
            updatedAt: now
        };

        this.providers.push(provider);
        this.saveProviders();
        this.notifyListeners();

        return provider;
    }

    /**
     * 更新服务商配置
     */
    updateProvider(id: string, updates: Partial<Omit<ThirdPartyProvider, 'id' | 'createdAt'>>): boolean {
        this.loadProviders();

        const index = this.providers.findIndex(p => p.id === id);
        if (index === -1) return false;

        this.providers[index] = {
            ...this.providers[index],
            ...updates,
            updatedAt: Date.now()
        };

        this.saveProviders();
        this.notifyListeners();
        return true;
    }

    /**
     * 删除服务商
     */
    removeProvider(id: string): boolean {
        this.loadProviders();

        const index = this.providers.findIndex(p => p.id === id);
        if (index === -1) return false;

        this.providers.splice(index, 1);
        this.saveProviders();
        this.notifyListeners();
        return true;
    }

    /**
     * 记录服务商使用量
     */
    addProviderUsage(providerId: string, tokens: number, cost: number): void {
        this.loadProviders();

        const provider = this.providers.find(p => p.id === providerId);
        if (!provider) return;

        // 检查是否需要重置每日计数（每天 0 点重置）
        const now = Date.now();
        const lastResetDate = new Date(provider.usage.lastReset);
        const today = new Date(now);
        if (lastResetDate.toDateString() !== today.toDateString()) {
            provider.usage.dailyTokens = 0;
            provider.usage.dailyCost = 0;
            provider.usage.lastReset = now;
        }

        provider.usage.totalTokens += tokens;
        provider.usage.totalCost += cost;
        provider.usage.dailyTokens += tokens;
        provider.usage.dailyCost += cost;
        provider.updatedAt = now;

        this.saveProviders();
        this.notifyListeners();
    }

    /**
     * 获取服务商统计信息
     */
    getProviderStats(): {
        total: number;
        active: number;
        totalCost: number;
        dailyCost: number;
    } {
        this.loadProviders();

        return {
            total: this.providers.length,
            active: this.providers.filter(p => p.isActive && p.status === 'active').length,
            totalCost: this.providers.reduce((sum, p) => sum + p.usage.totalCost, 0),
            dailyCost: this.providers.reduce((sum, p) => sum + p.usage.dailyCost, 0)
        };
    }

    /**
     * 从预设创建服务商
     */
    createProviderFromPreset(presetKey: string, apiKey: string, customModels?: string[]): ThirdPartyProvider | null {
        const preset = PROVIDER_PRESETS[presetKey];
        if (!preset) return null;

        return this.addProvider({
            name: preset.name,
            baseUrl: preset.baseUrl,
            apiKey,
            models: customModels || preset.models,
            format: preset.format,
            icon: preset.icon,
            isActive: true
        });
    }

    /**
     * 加载服务商列表
     */
    private loadProviders(): void {
        if (this.providers.length > 0) return; // Already loaded

        try {
            const stored = localStorage.getItem(PROVIDERS_STORAGE_KEY);
            if (stored) {
                this.providers = JSON.parse(stored);
            }
        } catch (e) {
            console.error('[KeyManager] Failed to load providers:', e);
            this.providers = [];
        }
    }

    /**
     * 保存服务商列表
     */
    private saveProviders(): void {
        try {
            localStorage.setItem(PROVIDERS_STORAGE_KEY, JSON.stringify(this.providers));
        } catch (e) {
            console.error('[KeyManager] Failed to save providers:', e);
        }
    }

}

// Singleton instance
export const keyManager = new KeyManager();

export default keyManager;

// ============================================================================
// 🆕 自动模型检测和配置功能
// ============================================================================

/**
 * 检测API类型
 */
export function detectApiType(apiKey: string, baseUrl?: string): 'google-official' | 'openai' | 'proxy' | 'unknown' {
    // Google官方API
    if (apiKey.startsWith('AIza') || baseUrl?.includes('googleapis.com') || baseUrl?.includes('generativelanguage.googleapis.com')) {
        return 'google-official';
    }

    // OpenAI官方API
    if (apiKey.startsWith('sk-') && (!baseUrl || baseUrl.includes('api.openai.com'))) {
        return 'openai';
    }

    // 第三方代理（NewAPI/One API等）
    if (baseUrl && !baseUrl.includes('googleapis.com') && baseUrl.length > 0) {
        return 'proxy';
    }

    return 'unknown';
}

/**
 * 自动获取Google API支持的模型
 */
export async function fetchGoogleModels(apiKey: string): Promise<string[]> {
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );

        if (!response.ok) {
            console.error('[KeyManager] Failed to fetch Google models:', response.status);
            console.log('[KeyManager] 使用默认Google模型列表作为备选');
            return getDefaultGoogleModels();
        }

        const data = await response.json();

        const models = data.models
            ?.map((m: any) => m.name.replace('models/', ''))
            .filter((rawM: string) => {
                const m = rawM.replace(/^models\//, '');
                const lower = m.toLowerCase();

                // ❌ 排除embedding、audio、robotics等非内容生成模型
                if (lower.includes('embedding') ||
                    lower.includes('audio') ||
                    lower.includes('robotics') ||
                    lower.includes('code-execution') ||
                    lower.includes('computer-use') ||
                    lower.includes('aqa')) {
                    return false;
                }

                // ❌ 排除TTS模型
                if (lower.includes('tts')) return false;

                // ✅ 白名单:只保留用户需要的核心模型
                const allowedPatterns = [
                    // 图像模型(5个)
                    /^gemini-2\.5-flash-image$/,           // Nano Banana
                    /^gemini-3-pro-image-preview$/,        // Nano Banana Pro
                    /^imagen-4\.0-generate-001$/,          // Imagen 4
                    /^imagen-4\.0-ultra-generate-001$/,    // Imagen 4 Ultra
                    /^imagen-4\.0-fast-generate-001$/,     // Imagen 4 Fast

                    // 视频模型(2个) - 只保留Veo 3.1
                    /^veo-3\.1-generate-preview$/,         // Veo 3.1
                    /^veo-3\.1-fast-generate-preview$/,    // Veo 3.1 fast

                    // 聊天模型(保留主线版本)
                    /^gemini-2\.5-(flash|pro|flash-lite)$/,
                    /^gemini-3-(pro|flash)-preview$/,
                ];

                return allowedPatterns.some(pattern => pattern.test(m));
            }) || [];

        console.log(`[KeyManager] ✓ 白名单过滤后剩余 ${models.length} 个模型:`, models);

        // 如果过滤后没有模型,使用默认列表
        if (models.length === 0) {
            console.log('[KeyManager] API返回空结果,使用默认Google模型列表');
            return getDefaultGoogleModels();
        }

        return models;
    } catch (error) {
        console.error('[KeyManager] Error fetching Google models:', error);
        console.log('[KeyManager] 使用默认Google模型列表作为备选');
        return getDefaultGoogleModels();
    }
}

// 默认Google模型列表(备选方案)
function getDefaultGoogleModels(): string[] {
    return [
        // 图片模型
        'gemini-2.5-flash-image',
        'gemini-3-pro-image-preview',
        'imagen-4.0-generate-001',
        'imagen-4.0-ultra-generate-001',
        'imagen-4.0-fast-generate-001',
        // 视频模型
        'veo-3.1-generate-preview',
        'veo-3.1-fast-generate-preview',
        // 聊天模型
        'gemini-3-pro-preview',
        'gemini-3-flash-preview',
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite'
    ];
}

/**
 * 自动获取OpenAI兼容API的模型列表
 * 🚀 [Enhancement] 自动去重：移除参数后缀，只保留唯一的基础模型
 */
export async function fetchOpenAICompatModels(apiKey: string, baseUrl: string): Promise<string[]> {
    try {
        const cleanUrl = baseUrl.replace(/\/$/, '');
        const response = await fetch(`${cleanUrl}/v1/models`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('[KeyManager] Failed to fetch proxy models:', response.status);
            return [];
        }

        const data = await response.json();
        const rawModels: string[] = data.data?.map((m: any) => m.id) || [];

        console.log(`[KeyManager] ✓ 原始检测到 ${rawModels.length} 个模型`);

        // 🚀 去重逻辑：移除 Antigravity 风格的参数后缀
        // 例如: gemini-3-pro-image-16x9 -> gemini-3-pro-image
        //       gemini-3-pro-image-1x1-4k -> gemini-3-pro-image
        //       claude-3-5-sonnet-20240620 -> claude-3-5-sonnet (移除日期后缀)
        const stripSuffix = (modelId: string): string => {
            // 匹配模式: -[宽高比]-[分辨率] 或 -[宽高比] 
            // 宽高比支持两种格式: 16x9 或 16-9
            // 分辨率: 4k, 2k, 1k
            return modelId
                // 移除 Antigravity 宽高比后缀 (使用 x 或 - 作为分隔符)  
                .replace(/-(16[x-]9|9[x-]16|1[x-]1|4[x-]3|3[x-]4|21[x-]9|9[x-]21|3[x-]2|2[x-]3|4[x-]5|5[x-]4)(-4k|-2k|-1k)?$/i, '')
                // 移除单独的分辨率后缀
                .replace(/(-4k|-2k|-1k)$/i, '')
                // 移除日期后缀 (如 -20240620, -20251001)
                .replace(/-\d{8}$/i, '')
                // 移除通配符后缀 (如 -*)
                .replace(/-\*$/i, '');
        };

        // 使用 Set 去重
        const uniqueModels = new Set<string>();
        rawModels.forEach(model => {
            const baseModel = stripSuffix(model);
            uniqueModels.add(baseModel);
        });

        const result = Array.from(uniqueModels);
        console.log(`[KeyManager] ✓ 去重后 ${result.length} 个唯一模型:`, result);
        return result;
    } catch (error) {
        console.error('[KeyManager] Error fetching proxy models:', error);
        return [];
    }
}

/**
 * 自动分类模型 - 增强版
 * 按优先级分类: 图像 → 视频 → 聊天 → 其他
 */
export function categorizeModels(models: string[]): {
    imageModels: string[];
    videoModels: string[];
    chatModels: string[];
    otherModels: string[];
} {
    const categories = {
        imageModels: [] as string[],
        videoModels: [] as string[],
        chatModels: [] as string[],
        otherModels: [] as string[]
    };

    models.forEach(model => {
        const lowerModel = model.toLowerCase();

        // 优先级1: 视频模型
        if (lowerModel.includes('veo') ||
            lowerModel.includes('runway') ||
            lowerModel.includes('luma') ||
            lowerModel.includes('dream-machine') ||
            lowerModel.includes('kling') ||
            lowerModel.includes('cogvideo') ||
            lowerModel.includes('svd') ||
            lowerModel.includes('video')) {
            categories.videoModels.push(model);
        }
        // 优先级2: 图像模型
        else if (lowerModel.includes('imagen') ||
            lowerModel.includes('dall-e') ||
            lowerModel.includes('midjourney') ||
            lowerModel.includes('image') ||
            lowerModel.includes('nano') ||
            lowerModel.includes('banana') ||
            lowerModel.includes('flux') ||
            lowerModel.includes('stable') ||
            lowerModel.includes('diffusion') ||
            lowerModel.includes('painting') ||
            lowerModel.includes('draw') ||
            lowerModel.includes('img')) {
            categories.imageModels.push(model);
        }
        // 优先级3: 聊天模型
        else if (lowerModel.includes('gemini') ||
            lowerModel.includes('gpt') ||
            lowerModel.includes('claude') ||
            lowerModel.includes('chat')) {
            categories.chatModels.push(model);
        }
        // 其他: 未分类模型
        else {
            categories.otherModels.push(model);
        }
    });

    return categories;
}

/**
 * 自动检测并配置API的所有模型
 */
export async function autoDetectAndConfigureModels(apiKey: string, baseUrl?: string): Promise<{
    success: boolean;
    models: string[];
    categories: ReturnType<typeof categorizeModels>;
    apiType: string;
}> {
    const apiType = detectApiType(apiKey, baseUrl);
    console.log('[KeyManager] 检测到API类型:', apiType);

    let models: string[] = [];

    if (apiType === 'google-official') {
        models = await fetchGoogleModels(apiKey);
    } else if (apiType === 'proxy' && baseUrl) {
        models = await fetchOpenAICompatModels(apiKey, baseUrl);
    } else if (apiType === 'openai') {
        // OpenAI官方，使用已知模型列表
        models = ['dall-e-3', 'dall-e-2', 'gpt-4o', 'gpt-4o-mini'];
    }

    // 应用模型校正
    const normalizedModels = normalizeModelList(models);

    const categories = categorizeModels(normalizedModels);

    return {
        success: normalizedModels.length > 0,
        models: normalizedModels,
        categories,
        apiType
    };
}

// Re-export ProxyModelConfig for convenience
