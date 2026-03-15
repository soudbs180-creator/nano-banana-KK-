/**
 * API Key Manager Service
 *
 * Provides multi-key rotation, status monitoring, and automatic failover.
 * Similar to Gemini Balance but runs entirely on frontend.
 * NOW SUPPORTS: Supabase Cloud Sync & Third-Party API Proxies
 */
import { supabase } from '../../lib/supabase';
import {
    type ApiProtocolFormat,
    AuthMethod,
    buildGeminiHeaders,
    buildGeminiModelsEndpoint,
    buildOpenAIEndpoint,
    buildProxyHeaders,
    formatAuthorizationHeaderValue,
    GOOGLE_API_BASE,
    getDefaultAuthMethod,
    normalizeApiProtocolFormat,
    resolveApiProtocolFormat,
} from '../api/apiConfig';
import { buildUserFacingApiErrorMessage, classifyApiFailure, hasAuthErrorMarkers } from '../api/errorClassification';
import { resolveProviderKeyType, resolveProviderRuntime } from '../api/providerStrategy';
import type { ChannelConfig } from '../api/channelConfig';
import { MODEL_PRESETS, CHAT_MODEL_PRESETS } from '../model/modelPresets';
import { RegionService } from '../system/RegionService';
import { Provider } from '../../types';
import { MODEL_REGISTRY } from '../model/modelRegistry';
import { adminModelService } from '../model/adminModelService'; // 棣冩畬 [閺傛澘顤僝 缁狅紕鎮婇敾姗€鍘嗙純顔芥箛閿?
import { buildProviderPricingSnapshot, mergeProviderPricingSnapshot, type ProviderPricingSnapshot } from './providerPricingSnapshot';
import { fetchRawPricingCatalog, fetchWuyinPricingCatalog, selectWuyinCatalogModels } from '../billing/newApiPricingService';

/**
 * Helper: Parse "id(name, description)" format
 */
export function parseModelString(input: string): { id: string; name?: string; description?: string; provider?: string } {
    // Detect custom delimiter format: "id|name|provider"
    if (input.includes('|')) {
        const parts = input.split('|');
        let id = parts[0]?.trim() || '';
        let name = parts[1]?.trim() || undefined;
        const provider = parts[2]?.trim() || undefined;

        // 閸忕厧顔愰摗鍡楀蕉皤敂蹇旀殶閹? 閸欘垵鍏樼悮顐︽晩鐠囶垰鐡ㄩ幋?"name|id|provider"
        const idLikeRegex = /^[a-z0-9-.:/]+$/;
        const firstLooksLikeName = /\s/.test(id) || !idLikeRegex.test(id);
        const secondLooksLikeId = !!name && idLikeRegex.test(name);
        if (secondLooksLikeId && firstLooksLikeName) {
            const tmp = id;
            id = name!;
            name = tmp;
        }

        return {
            id,
            name,
            provider
        };
    }

    // Normalize full-width parentheses to standard ones
    const normalized = input.replace(/（/g, '(').replace(/）/g, ')');
    const match = normalized.match(/^([^()]+)(?:\(([^/]+)(?:\/\s*(.+))?\))?$/);

    if (!match) return { id: input.trim() };

    let id = match[1].trim();
    let name = match[2]?.trim();
    const description = match[3]?.trim();

    // 閺呴缚鍏樺Λ鈧ù? 婵″倹鐏?ID 皤摵瀣崳皎睊銉ュ剼閽栧矕袨(閸栧懎鎯堢粚鐑樼壐閹存牕銇囬崘?, 閽ュ本瀚崣宄板敶闀?name 皤摵瀣崳皎睊銉ュ剼 ID (kebab-case/lowercase)
    // 皤攧娆庢唉閹广垹鐣犳禒?
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


/**
 * Helper: Determine Key Type based on Provider and Base URL
 * Strictly enforces "official" status only for Google provider with official endpoints.
 */
export function determineKeyType(provider: string | Provider, baseUrl?: string): 'official' | 'proxy' | 'third-party' {
    return resolveProviderKeyType(provider, baseUrl);
}

function extractSlotRouteTarget(suffix: string | null | undefined): string | null {
    const decodedSuffix = (() => {
        try {
            return decodeURIComponent(String(suffix || '').trim().toLowerCase());
        } catch {
            return String(suffix || '').trim().toLowerCase();
        }
    })();

    if (!decodedSuffix) return null;
    if (decodedSuffix.startsWith('slot_key_')) return decodedSuffix.slice(5);
    if (decodedSuffix.startsWith('slot_')) return decodedSuffix.slice(5);
    if (decodedSuffix.startsWith('provider_')) return decodedSuffix.slice(9);
    return null;
}

function decodeRouteSuffix(suffix: string | null | undefined): string {
    try {
        return decodeURIComponent(String(suffix || '').trim().toLowerCase());
    } catch {
        return String(suffix || '').trim().toLowerCase();
    }
}

function matchesSlotRouteSuffix(slot: Pick<KeySlot, 'id' | 'name' | 'provider' | 'proxyConfig'>, suffix: string | null | undefined): boolean {
    const decodedSuffix = decodeRouteSuffix(suffix);
    if (!decodedSuffix) return false;

    const routeTarget = extractSlotRouteTarget(decodedSuffix);
    const slotIdLower = String(slot.id || '').trim().toLowerCase();
    const slotNameLower = String(slot.name || '').trim().toLowerCase();
    const slotSuffixLower = String(slot.proxyConfig?.serverName || slot.provider || 'Custom').trim().toLowerCase();
    const providerLower = String(slot.provider || '').trim().toLowerCase();

    if (routeTarget) {
        return slotIdLower === routeTarget;
    }

    return (
        slotIdLower === decodedSuffix ||
        slotNameLower === decodedSuffix ||
        slotSuffixLower === decodedSuffix ||
        providerLower === decodedSuffix
    );
}

function matchesProviderRouteSuffix(
    provider: Pick<ThirdPartyProvider, 'id' | 'name'>,
    suffix: string | null | undefined
): boolean {
    const decodedSuffix = decodeRouteSuffix(suffix);
    if (!decodedSuffix) return false;

    const routeTarget = extractSlotRouteTarget(decodedSuffix);
    const providerIdLower = String(provider.id || '').trim().toLowerCase();
    const providerNameLower = String(provider.name || '').trim().toLowerCase();

    if (routeTarget) {
        return providerIdLower === routeTarget;
    }

    return providerIdLower === decodedSuffix || providerNameLower === decodedSuffix;
}

const RATE_LIMIT_COOLDOWN_MS = 30 * 1000;

export interface KeySlot {
    id: string;
    key: string;
    name: string;
    provider: Provider; // 皎眳?Updated to strict type
    type: 'official' | 'proxy' | 'third-party'; // 皎眳?New field for categorization
    format: ApiProtocolFormat;

    // Provider Specific Config
    providerConfig?: {
        region?: string;      // AWS/Volcengine/Aliyun regions
        endpointId?: string;  // Volcengine Endpoint ID
        bucketName?: string;  // Object Storage bucket
        baseUrl?: string;     // Custom base URL (e.g. for proxies)
    };

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
    customHeaders?: Record<string, string>; // Provider-specific custom request headers
    customBody?: Record<string, any>; // Provider-specific custom request body template

    // Advanced Configuration (NEW)
    weight?: number;         // 皎睊鍐惃 (1-100), 閻劋绨拹鐔绘祰閸у洷銆€,姒涙か顓?0
    timeout?: number;        // 鐡掑懏妞傞暈鍫曟？ (ms), 姒涙か顓?0000
    maxRetries?: number;     // 閾锯偓婢堆囧惃鐠囨洘顐奸弫?姒涙か顓?
    retryDelay?: number;     // 闃咅『冪槸瀵ゆ儼绻?(ms), 姒涙か顓?000

    // Status & Usage
    status: 'valid' | 'invalid' | 'rate_limited' | 'unknown';
    failCount: number;
    successCount: number;
    lastUsed: number | null;
    lastError: string | null;
    disabled: boolean;
    createdAt: number;

    // Performance Metrics (NEW)
    avgResponseTime?: number;    // 楠炲啿娼庨崫宥呯安闀炲爼妫?(ms)
    lastResponseTime?: number;   // 閾锯偓閽栧簼绔村▎鈥虫惙鎼存梹妞傞梻?(ms)
    successRate?: number;        // 閹存劕濮涢悳?(0-100)
    totalRequests?: number;      // 闀愭槒顕Ч鍌涙殶

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
    tokenLimit?: number; // 皎眳?New: -1 for unlimited
    creditCost?: number; // 棣冩畬 [API Isolation] User-defined custom cost per generation

    // Sync
    updatedAt?: number; // Timestamp of last modification for sync conflict resolution
    quota?: {
        limitRequests: number;
        remainingRequests: number;
        resetConstant?: string;
        resetTime: number;
        updatedAt: number;
    };
    cooldownUntil?: number; // temporary cooldown for auto-failover
}


interface KeyManagerState {
    slots: KeySlot[];
    currentIndex: number;
    maxFailures: number;
    rotationStrategy: 'round-robin' | 'sequential'; // New strategy field
}

/**
 * 缁楊兛绗侀弬?API 閾惧秴濮熼崯鍡樺复閸?
 * 閺€顖涘瘮閺呴缚姘ㄩ妴浣风濞撳懌鈧胶浼€鐏炲崬绱╅晭搴ｇ搼 OpenAI 閸忕厧顔?API
 */
export interface ThirdPartyProvider {
    id: string;
    name: string;                 // 鏄剧ず鍚嶇О锛堝 "鏅鸿氨 AI"锛?
    baseUrl: string;              // API 鍩虹 URL
    apiKey: string;               // API Key
    group?: string;
    models: string[];             // 鏀寔鐨勬ā鍨嬪垪琛?
    format: ApiProtocolFormat;  // 鍗忚鏍煎紡
    icon?: string;                // 鍥炬爣 emoji
    isActive: boolean;            // 鏄惁婵€娲?
    providerColor?: string;
    badgeColor?: string;
    budgetLimit?: number;
    tokenLimit?: number;
    customCostMode?: 'unlimited' | 'amount' | 'tokens';
    customCostValue?: number;

    // 馃敟 [Feature] 鍚庡彴鎷夊彇 New API 浠锋牸琛ㄧ殑缂撳瓨
    pricingSnapshot?: ProviderPricingSnapshot;

    // 鐙珛璁¤垂
    usage: {
        totalTokens: number;
        totalCost: number;
        dailyTokens: number;
        dailyCost: number;
        lastReset: number;        // 姣忔棩閲嶇疆鏃堕棿鎴?
    };

    // 鐘舵€?
    status: 'active' | 'error' | 'checking';
    lastError?: string;
    lastChecked?: number;

    // 鍏冩暟鎹?
    createdAt: number;
    updatedAt: number;
}

function normalizeProviderLinkValue(value: string | undefined | null): string {
    return String(value || '').trim().replace(/\/+$/, '').toLowerCase();
}

/**
 * Preset third-party API providers
 */
export const PROVIDER_PRESETS: Record<string, Omit<ThirdPartyProvider, 'id' | 'apiKey' | 'usage' | 'status' | 'createdAt' | 'updatedAt' | 'isActive'> & { defaultApiKey?: string }> = {
    'zhipu': {
        name: '\u667A\u8C31 AI',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        models: ['glm-4', 'glm-4-flash', 'glm-4-plus', 'cogview-4'],
        format: 'openai',
        icon: '\u{1F9E0}'
    },
    'wanqing': {
        name: '\u4E07\u9752 (\u5FEB\u624B)',
        baseUrl: 'https://wanqing.streamlakeapi.com/api/gateway/v1/endpoints',
        models: ['deepseek-reasoner', 'deepseek-v3', 'qwen-max'],
        format: 'openai',
        icon: '\u{1F3AC}'
    },
    'sambanova': {
        name: 'SambaNova',
        baseUrl: 'https://api.sambanova.ai/v1',
        models: ['Meta-Llama-3.1-405B-Instruct', 'Meta-Llama-3.1-70B-Instruct', 'Meta-Llama-3.1-8B-Instruct', 'Meta-Llama-3.2-90B-Vision-Instruct', 'Meta-Llama-3.2-11B-Vision-Instruct', 'Meta-Llama-3.2-3B-Instruct', 'Meta-Llama-3.2-1B-Instruct', 'Qwen2.5-72B-Instruct', 'Qwen2.5-Coder-32B-Instruct'],
        format: 'openai',
        icon: '\u{1F680}'
    },
    'openclaw': {
        name: 'OpenClaw (Zero Token)',
        baseUrl: 'http://127.0.0.1:3001/v1',
        models: ['claude-3-5-sonnet-20241022', 'doubao-pro-32k', 'doubao-pro-128k', 'deepseek-chat', 'deepseek-reasoner'],
        format: 'openai',
        icon: '\u{1F43E}',
        defaultApiKey: 'sk-openclaw-zero-token'
    },
    't8star': {
        name: 'T8Star',
        baseUrl: 'https://ai.t8star.cn',
        // Conservative defaults; users can auto-detect or customize in UI
        models: ['gemini-3.1-pro-preview', 'gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image', 'gemini-3-pro-image-preview', 'gemini-2.5-flash', 'gemini-3-flash-preview', 'runway-gen3', 'luma-video', 'kling-v1', 'sv3d', 'flux-kontext-max', 'recraft-v3-svg', 'ideogram-v2', 'suno-v3.5', 'minimax-t2a-01'],
        format: 'openai',
        icon: '\u2B50'
    },
    'volcengine': {
        name: '\u706B\u5C71\u5F15\u64CE',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        models: ['doubao-pro', 'doubao-lite'],
        format: 'openai',
        icon: '\u{1F30B}'
    },
    'deepseek': {
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        models: ['deepseek-chat', 'deepseek-reasoner'],
        format: 'openai',
        icon: '\u{1F52E}'
    },
    'moonshot': {
        name: 'Moonshot (Kimi)',
        baseUrl: 'https://api.moonshot.cn/v1',
        models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
        format: 'openai',
        icon: '\u{1F319}'
    },
    'siliconflow': {
        name: 'SiliconFlow',
        baseUrl: 'https://api.siliconflow.cn/v1',
        models: ['Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3'],
        format: 'openai',
        icon: '\u{1F48E}'
    },
    '12ai': {
        name: '12AI',
        baseUrl: 'https://cdn.12ai.org',
        models: [
            'gpt-5.1',
            'gemini-2.5-pro', 'gemini-2.5-pro-c',
            'gemini-2.5-flash', 'gemini-2.5-flash-c',
            'gemini-3.1-pro-preview', 'gemini-3.1-pro-preview-c',
            'gemini-2.5-flash-image', 'gemini-2.5-flash-image-c',
            'gemini-3-pro-image-preview', 'gemini-3-pro-image-preview-c',
            'claude-4-sonnet', 'runway-gen3', 'luma-video', 'kling-v1', 'sv3d',
            'flux-kontext-max', 'recraft-v3-svg', 'ideogram-v2', 'suno-v3.5', 'minimax-t2a-01'
        ],
        format: 'gemini', // Best for Gemini-compatible routes and reference images
        icon: '\u{1F680}'
    },
    'antigravity': {
        name: 'Antigravity (\u672C\u5730)',
        baseUrl: 'http://127.0.0.1:8045',
        models: ['gemini-3.1-pro-preview', 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview', 'gemini-3-flash', 'gemini-2.5-flash-image', 'gemini-2.5-flash', 'runway-gen3', 'luma-video', 'kling-v1', 'sv3d', 'vidu', 'minimax-video', 'flux-kontext-max', 'recraft-v3-svg', 'ideogram-v2', 'suno-v3.5', 'minimax-t2a-01'],
        format: 'openai',
        icon: '\u{1F300}'
    },
    '12ai-nanobanana': {
        name: '12AI NanoBanana',
        baseUrl: 'https://cdn.12ai.org',
        models: [
            'gemini-2.5-flash-image', 'gemini-2.5-flash-image-c',
            'gemini-3-pro-image-preview', 'gemini-3-pro-image-preview-c'
        ],
        format: 'gemini',
        icon: '\u{1F34C}'
    },
    'custom': {
        name: '\u81EA\u5B9A\u4E49\u4F9B\u5E94\u5546',
        baseUrl: '',
        models: [],
        format: 'auto',
        icon: '\u2699\uFE0F'
    }
};

/**
 * 闀婎亜濮╅暀瑙勫祦閸栧搫鐑熼槂澶嬪 12AI 缂冩垵鍙ч獮鑸靛瘹閽栨垵鎮楃粩顖欏敩閻?
 */
/**
 * 闀婎亜濮╅暀瑙勫祦閸栧搫鐑熼槂澶嬪 12AI 缂冩垵鍙ч獮鑸靛瘹閽栨垵鎮楃粩顖欏敩閻?
 */
function get12AIBaseUrl(): string {
    return RegionService.get12AIBaseUrl();
}

const STORAGE_KEY = 'kk_studio_key_manager';
const PROVIDERS_STORAGE_KEY = 'kk_studio_third_party_providers';
const DEFAULT_MAX_FAILURES = 3;
// 闀炑呭 Gemini 濡€崇€烽敍鍩氬嚒瀵箓鏁ら敍?
const LEGACY_GOOGLE_MODELS = ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash-exp'];

/**
 * 闀炑勀侀崹?ID 皤攧鐗堟煀濡€崇€?ID 闀勫嫯鍤滈敺銊︾墡濮濓絾妞犵亸鍕€?
 * 閻劋绨挅鎴濇倵閸忕厧顔愰崪宀冨殰閿枫劏绺肩粔?
 */
export const MODEL_MIGRATION_MAP: Record<string, string> = {
    // Gemini 1.5 缁鍨?閳?Gemini 2.5 缁鍨?
    'gemini-1.5-pro': 'gemini-2.5-pro',
    'gemini-1.5-pro-latest': 'gemini-2.5-pro',
    'gemini-1.5-flash': 'gemini-2.5-flash',
    'gemini-1.5-flash-latest': 'gemini-2.5-flash',

    // Gemini 2.0 缁鍨?閳?Gemini 2.5 缁鍨?
    'gemini-2.0-flash-exp': 'gemini-2.5-flash',
    'gemini-2.0-pro-exp': 'gemini-2.5-pro',

    // Gemini 2.0 鐎逛负鐛欓晲褍娴橀晙蹇曟暁閹?閳?Gemini 2.5 Flash Image (Was mapped to Nano Banana)
    'gemini-2.0-flash-exp-image-generation': 'gemini-2.5-flash-image',

    // Nano Banana Alias 閳?Gemini 2.5 Flash Image (Official)
    'nano-banana': 'gemini-2.5-flash-image',
    'nano banana': 'gemini-2.5-flash-image',
    'nano-banana-pro': 'gemini-3-pro-image-preview',
    'nano banana pro': 'gemini-3-pro-image-preview',
    'nano-banana-2': 'gemini-3.1-flash-image-preview',
    'nano banana 2': 'gemini-3.1-flash-image-preview',

    // -latest 皤攧顐㈡倳 閳?閸忚渹皤焺閻楀牊婀?
    'gemini-flash-lite-latest': 'gemini-2.5-flash-lite',
    'gemini-flash-latest': 'gemini-2.5-flash',
    'gemini-pro-latest': 'gemini-2.5-pro',
    // Retroactive fixes for old canvas nodes
    'gemini-3-pro-image': 'gemini-3-pro-image-preview',
};

/**
 * 鏆椻偓鐟曚礁鐣崗銊ㄧ环濠娿倖甯€闀勫嫭膩閸?娑擆『冪箻鐞涘矁绺肩粔?瓞瀛樺复皤攧鐘绘珟)
 */
export const BLACKLIST_MODELS = [
    // Imagen 妫板嫯顫嶉悧?瀹侊附妫╅摼鐔锋倵缂傗偓)
    /^imagen-[34]\.0-(ultra-)?generate-preview-\d{2}-\d{2}$/,
    /^imagen-[34]\.0-(fast-)?generate-preview-\d{2}-\d{2}$/,
    // Imagen 闀炑呭(generate-001)
    /^imagen-[34]\.0-.*generate-001$/,
];

/**
 * 瀹告彃绾悽銊ф畱濡€崇€佛珨勬銆?閻劋绨潻浣盒?
 */
export const DEPRECATED_MODELS = Object.keys(MODEL_MIGRATION_MAP);

/**
 * 闀婎亜濮╅暀鈩冾劀濡€崇€?ID
 * @param modelId - 閾＄喎顫愬Ο鈥崇€?ID
 * @returns 闀欌剝顒滈挅搴ｆ畱濡€崇€?ID閿涘煔顩ч弸婊堟付鐟曚焦鐗庡锝忕骇閹存牕甯堟慨?ID
 */
export function normalizeModelId(modelId: string): string {
    const raw = (modelId || '').trim();
    const normalized = MODEL_MIGRATION_MAP[raw];
    if (normalized) {
        console.log(`[ModelMigration] Auto-correcting "${modelId}" 閳?"${normalized}"`);
        return normalized;
    }

    const lowerRaw = raw.toLowerCase();
    const lowerMapped = MODEL_MIGRATION_MAP[lowerRaw];
    if (lowerMapped) {
        console.log(`[ModelMigration] Auto-correcting "${modelId}" 閳?"${lowerMapped}"`);
        return lowerMapped;
    }

    const dashed = lowerRaw.replace(/\s+/g, '-');
    const dashedMapped = MODEL_MIGRATION_MAP[dashed];
    if (dashedMapped) {
        console.log(`[ModelMigration] Auto-correcting "${modelId}" 閳?"${dashedMapped}"`);
        return dashedMapped;
    }

    return raw;
}

export interface ModelVariantMeta {
    baseId: string;
    canonicalId: string; // for dedup (keeps speed tier, strips ratio/quality/date)
    speed?: 'fast' | 'slow';
    quality?: '4k' | '2k' | '1k' | 'high' | 'hd' | 'ultra' | 'medium' | 'low' | 'standard';
    ratio?: string;
}

/**
 * Parse vendor-specific suffix patterns and extract variant metadata.
 * - Keeps speed tier (fast/slow) as model-differentiating signal
 * - Treats resolution/quality/ratio suffix as parameter-like signal
 */
export function parseModelVariantMeta(modelId: string): ModelVariantMeta {
    const raw = (modelId || '').trim();
    let working = raw
        .replace(/-\*$/i, '')
        .replace(/-\d{8}$/i, '');

    const ratioRegex = /(16[x-]9|9[x-]16|1[x-]1|4[x-]3|3[x-]4|21[x-]9|9[x-]21|3[x-]2|2[x-]3|4[x-]5|5[x-]4)$/i;
    const qualityRegex = /(4k|2k|1k|hd|high|ultra|medium|low|standard)$/i;
    const speedRegex = /(fast|slow)$/i;

    let ratio: string | undefined;
    let quality: ModelVariantMeta['quality'];
    let speed: ModelVariantMeta['speed'];

    const ratioMatch = working.match(new RegExp(`-${ratioRegex.source}`, 'i'));
    if (ratioMatch) {
        ratio = ratioMatch[1].toLowerCase();
        working = working.replace(new RegExp(`-${ratioRegex.source}$`, 'i'), '');
    }

    const qualityMatch = working.match(new RegExp(`-${qualityRegex.source}`, 'i'));
    if (qualityMatch) {
        quality = qualityMatch[1].toLowerCase() as ModelVariantMeta['quality'];
        working = working.replace(new RegExp(`-${qualityRegex.source}$`, 'i'), '');
    }

    const speedMatch = working.match(new RegExp(`-${speedRegex.source}`, 'i'));
    if (speedMatch) {
        speed = speedMatch[1].toLowerCase() as ModelVariantMeta['speed'];
        // Keep speed in canonicalId to distinguish fast/slow model families
    }

    return {
        baseId: raw,
        canonicalId: working,
        speed,
        quality,
        ratio
    };
}

export function appendModelVariantLabel(baseName: string, modelId: string): string {
    const parsed = parseModelVariantMeta(modelId);
    const tags: string[] = [];

    if (parsed.speed) {
        tags.push(parsed.speed === 'fast' ? 'Fast' : 'Slow');
    }

    if (parsed.quality) {
        const qualityMap: Record<string, string> = {
            '4k': '4K',
            '2k': '2K',
            '1k': '1K',
            high: 'High',
            hd: 'HD',
            ultra: 'Ultra',
            medium: 'Medium',
            low: 'Low',
            standard: 'Standard'
        };
        tags.push(qualityMap[parsed.quality] || parsed.quality);
    }

    if (tags.length === 0) return baseName;
    return `${baseName} (${tags.join(' 璺?')})`;
}

/**
 * 濡偓闀嗐儲膩閸ㄥ妲搁挅锕€鍑″骞傛暏
 */
export function isDeprecatedModel(modelId: string): boolean {
    return DEPRECATED_MODELS.includes(modelId);
}

/**
 * 濡偓闀嗐儲膩閸ㄥ妲搁挅锕€绨茬拠銉潶鏉╁洦鎶ら幒?
 */
function shouldFilterModel(modelId: string): boolean {
    // 棣冩畬 [Strict Mode] Whitelist Override
    // If model is explicitly in our whitelist, DO NOT FILTER IT, even if it matches a ban pattern below.
    if (GOOGLE_IMAGE_WHITELIST.includes(modelId)) return false;

    // 鏉╁洦鎶magen妫板嫯顫嶉悧?瀹侊附妫╅摼鐔锋倵缂傗偓)
    if (/imagen-[34]\.0-.*-preview-\d{2}-\d{2}/.test(modelId)) {
        console.log(`[ModelFilter] Filtering Imagen preview: ${modelId}`);
        return true;
    }

    // 鏉╁洦鎶magen闀炑呭(generate-001) - BUT allow whitelisted ones
    if (/imagen-[34]\.0-.*generate-001$/.test(modelId)) {
        console.log(`[ModelFilter] Filtering old Imagen: ${modelId}`);
        return true;
    }

    // 鏉╁洦鎶emini-2.0-flash-exp-image-generation
    if (modelId === 'gemini-2.0-flash-exp-image-generation') {
        console.log(`[ModelFilter] Filtering deprecated model: ${modelId}`);
        return true;
    }

    return false;
}

/**
 * 闀撳綊鍣洪暀鈩冾劀濡€崇€佛珨勬銆冮敍鍩氥闃?& 鏉╀胶些闀?ID閿?
 * @param provider 閸欘垶鈧娈戞笟娑樼安閸熷棗鎮曠粔甯捍閻劋绨惔鏃楁暏娑撳秴鎮撻晞鍕环濠娿倗鐡ラ悾?
 */
export function normalizeModelList(models: string[], provider?: string): string[] {
    const isOfficialGoogle = provider === 'Google';

    // 1. Migrate & Normalize
    const normalized = models.map(id => {
        const raw = (id || '').trim();

        // 闂辩偛皙綀閺?Google 濞撶娀浜鹃敍姘㈢辑閻ｐ欐暏閹村嘲锝為崘?鏉╃伃顏潻鏂挎礀闀勫嫬甯堟慨瀣侀崹?ID閵?
        // 娓氬珨顩?nano-banana-2 鏉欒皤攧顐㈡倳閿涘苯婀晢鎰昂皤攧鍡楀絺濞撶娀浜炬稉瀣Ц闀剛鐝涢摼澶嬫櫏濡€崇€烽敍?
        // 娑擆『冨厴瀵搫鍩楁潻浣盒╅幋?gemini-3.1-flash-image-preview閵?
        if (!isOfficialGoogle) {
            return raw;
        }

        // 鐎规ɑ鏌?Google 濞撶娀浜鹃敍姘╁帒鐠佺浠涢摗鍡楀蕉鏉╀胶些娑撳氦顫夐敚鍐ㄥ閵?
        const target = MODEL_MIGRATION_MAP[raw];
        if (target) return target;
        return normalizeModelId(raw);
    });

    // 2. Filter, Remove Duplicates & Apply Strict Whitelist
    const unique = Array.from(new Set(normalized)).filter(id => {
        // Always filter explicit blacklist (malformed previews)
        if (shouldFilterModel(id)) return false;

        // Strict check: ONLY for official Google provider
        // If it looks like a Google image model, it MUST be in the whitelist
        if (isOfficialGoogle) {
            const isGoogleImageLike = id.includes('image') || id.includes('nano') || id.includes('banana') || id.includes('imagen');
            if (isGoogleImageLike && !GOOGLE_IMAGE_WHITELIST.includes(id)) {
                return false;
            }
        }

        // Fix: If it is 'nano-banana' (which shouldn't exist after step 1), kill it.
        if (id === 'nano-banana' || id === 'nano-banana-pro') return false;

        return true;
    });

    return unique;
}

// 皎眳?Strict Whitelist for Google Image Models
export const GOOGLE_IMAGE_WHITELIST = [
    'gemini-2.5-flash-image',
    'gemini-3-pro-image-preview',
    'gemini-3.1-flash-image-preview',
    'imagen-4.0-generate-001',
    'imagen-4.0-ultra-generate-001',
    'imagen-4.0-fast-generate-001'
];

// 皎眳?Video Model Whitelist
export const VIDEO_MODEL_WHITELIST = [
    'runway-gen3',
    'luma-video',
    'kling-v1',
    'sv3d',
    'vidu',
    'minimax-video',
    'wan-v1'
];

// 皎眳?Advanced Image Editing Whitelist
export const ADVANCED_IMAGE_MODEL_WHITELIST = [
    'flux-kontext-max',
    'recraft-v3-svg',
    'ideogram-v2'
];

// 皎眳?Audio Model Whitelist
export const AUDIO_MODEL_WHITELIST = [
    'suno-v3.5',
    'minimax-t2a-01'
];

const isGoogleOfficialModelId = (modelId: string): boolean => {
    const id = String(modelId || '').replace(/^models\//, '').toLowerCase();
    return id.startsWith('gemini-') || id.startsWith('imagen-') || id.startsWith('veo-');
};

// 姒涙か顓?Google 濡€崇€佛珨勬銆冮敍鍫滅矌闀欑缁〨emini濡€崇€烽敍?
export const DEFAULT_GOOGLE_MODELS = [
    // Gemini 3.1 缁鍨敍鍫熸付閺備即顣╃憴鍫㈠閿?
    'gemini-3.1-pro-preview',
    // Gemini 3 缁鍨敍鍫ヮ暕鐟欏牏澧楅敍? 闀靛﹤銇?
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
    // Gemini 2.5 缁鍨敍鍫⑶旂€规氨澧楅敍? 闀靛﹤銇?
    'gemini-2.5-flash',

    // Strict Image Models
    ...GOOGLE_IMAGE_WHITELIST,

    // Veo 鐟欏棝顣堕悽鐔稿灇
    'veo-3.1-generate-preview',
    'veo-3.1-fast-generate-preview'
];

const GOOGLE_HEADER_NAME = 'x-goog-api-key';

const isLegacyGoogleModelList = (models: string[]) => {
    if (models.length !== LEGACY_GOOGLE_MODELS.length) return false;
    return models.every(m => LEGACY_GOOGLE_MODELS.includes(m));
};

type GlobalModelType = 'chat' | 'image' | 'video' | 'image+chat' | 'audio'; // multimodal support

const GOOGLE_CHAT_MODELS = [
    // Gemini 2.5 series - best value
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', icon: '\u{1F9E0}', description: '\u6700\u5F3A\u63A8\u7406\u6A21\u578B\uFF0C\u64C5\u957F\u4EE3\u7801\u3001\u6570\u5B66\u3001STEM \u590D\u6742\u4EFB\u52A1' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', icon: '\u26A1', description: '\u901F\u5EA6\u4F18\u5148\uFF0C\u9002\u5408\u9AD8\u5E76\u53D1\u4E0E\u5FEB\u901F\u54CD\u5E94\u573A\u666F' },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', icon: '\u{1F539}', description: '\u4F4E\u6210\u672C\u5FEB\u901F\u6A21\u578B\uFF0C\u9002\u5408\u8F7B\u91CF\u4EFB\u52A1' },
    // Gemini 3 / 3.1 series - advanced reasoning
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro \u9884\u89C8', icon: '\u{1F48E}', description: '\u9002\u5408\u9700\u8981\u5E7F\u6CDB\u4E16\u754C\u77E5\u8BC6\u4E0E\u8DE8\u6A21\u6001\u9AD8\u7EA7\u63A8\u7406\u7684\u590D\u6742\u4EFB\u52A1' },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro \u9884\u89C8', icon: '\u{1F680}', description: '\u66F4\u5F3A\u63A8\u7406\u4E0E\u590D\u6742\u4EFB\u52A1\u80FD\u529B\uFF0C\u9002\u5408\u4E13\u4E1A\u5DE5\u4F5C\u6D41' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash \u9884\u89C8', icon: '\u26A1', description: '\u65B0\u4E00\u4EE3 Flash\uFF0C\u5E73\u8861\u8D28\u91CF\u4E0E\u901F\u5EA6' },
    // Multimodal models
    { id: 'gemini-3.1-flash-image-preview', name: 'Gemini 3.1 Flash Image', icon: '\u{1F5BC}\uFE0F', description: '\u56FE\u50CF\u751F\u6210\u6A21\u578B\uFF0C\u9002\u5408\u901A\u7528\u521B\u4F5C\u573A\u666F' },
    { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image (Preview)', icon: '\u{1F3A8}', description: '\u9AD8\u8D28\u91CF\u56FE\u50CF\u751F\u6210\uFF0C\u9002\u5408\u4E13\u4E1A\u521B\u4F5C' },
    { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image', icon: '\u{1F34C}', description: '\u5FEB\u901F\u56FE\u50CF\u6A21\u578B\uFF0C\u9002\u5408\u9AD8\u9891\u51FA\u56FE\u573A\u666F' },
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

// Mark Gemini image models as multimodal
MODEL_TYPE_MAP.set('gemini-2.5-flash-image', 'image+chat');
MODEL_TYPE_MAP.set('gemini-3.1-flash-image-preview', 'image+chat');
MODEL_TYPE_MAP.set('gemini-3-pro-image-preview', 'image+chat');

// Set Imagen 4.0 model types
MODEL_TYPE_MAP.set('imagen-4.0-generate-001', 'image');
MODEL_TYPE_MAP.set('imagen-4.0-ultra-generate-001', 'image');
MODEL_TYPE_MAP.set('imagen-4.0-fast-generate-001', 'image');

// Set Veo 3.1 model types
MODEL_TYPE_MAP.set('veo-3.1-generate-preview', 'video');
MODEL_TYPE_MAP.set('veo-3.1-fast-generate-preview', 'video');

MODEL_PRESETS.filter(preset => preset.provider === 'Google').forEach(preset => {
    if (!GOOGLE_MODEL_METADATA.has(preset.id)) {
        GOOGLE_MODEL_METADATA.set(preset.id, { name: preset.label, description: preset.description });
    }
});

// Add Imagen 4.0 / Veo 3.1 metadata
GOOGLE_MODEL_METADATA.set('imagen-4.0-generate-001', { name: 'Imagen 4.0 \u6807\u51C6\u7248', icon: '\u{1F3A8}', description: 'Google \u5B98\u65B9\u56FE\u50CF\u6A21\u578B\uFF08\u6807\u51C6\u7248\uFF09' });
GOOGLE_MODEL_METADATA.set('imagen-4.0-ultra-generate-001', { name: 'Imagen 4.0 Ultra', icon: '\u{1F48E}', description: 'Google \u7684\u9AD8\u4FDD\u771F\u56FE\u50CF\u6A21\u578B\uFF08Ultra\uFF09' });
GOOGLE_MODEL_METADATA.set('imagen-4.0-fast-generate-001', { name: 'Imagen 4.0 \u5FEB\u901F\u7248', icon: '\u26A1', description: 'Google \u5B98\u65B9\u56FE\u50CF\u6A21\u578B\uFF08\u5FEB\u901F\u7248\uFF09' });
GOOGLE_MODEL_METADATA.set('veo-3.1-generate-preview', { name: 'Veo 3.1', icon: '\u{1F3AC}', description: '\u6700\u65B0\u89C6\u9891\u751F\u6210\u6A21\u578B\uFF08\u9884\u89C8\u7248\uFF09' });
GOOGLE_MODEL_METADATA.set('veo-3.1-fast-generate-preview', { name: 'Veo 3.1 Fast', icon: '\u{1F3AC}', description: 'Veo 3.1 \u5FEB\u901F\u7248' });

// Custom name overrides for whitelisted models
GOOGLE_MODEL_METADATA.set('gemini-2.5-flash-image', { name: 'Nano Banana', icon: '\u{1F34C}', description: 'Gemini 2.5 Flash Image (Custom)' });
GOOGLE_MODEL_METADATA.set('gemini-3.1-flash-image-preview', { name: 'Nano Banana 2', icon: '\u{1F34C}', description: 'Gemini 3.1 Flash Image Preview (Custom)' });
GOOGLE_MODEL_METADATA.set('gemini-3-pro-image-preview', { name: 'Nano Banana Pro', icon: '\u{1F34C}', description: 'Gemini 3 Pro Image (Custom)' });

export const getModelMetadata = (modelId: string) => {
    const exactId = String(modelId || '').trim();
    if (exactId) {
        const exactModel = keyManager.getGlobalModelList().find(model => model.id === exactId);
        if (exactModel) {
            return {
                name: exactModel.name,
                icon: exactModel.icon,
                description: exactModel.description
            };
        }
    }

    const baseId = exactId.split('@')[0];
    const exactAdminModel = adminModelService.getModel(exactId);
    if (exactAdminModel) {
        return {
            name: exactAdminModel.displayName,
            description: exactAdminModel.advantages
        };
    }

    return GOOGLE_MODEL_METADATA.get(baseId);
};

function buildStableSystemRouteId(baseModelId: string, providerId?: string, fallbackIndex?: number): string {
    const normalizedBaseId = String(baseModelId || '').trim();
    const normalizedProviderId = String(providerId || '').trim();
    if (!normalizedProviderId) {
        return fallbackIndex && fallbackIndex > 1
            ? `${normalizedBaseId}@system_${fallbackIndex}`
            : `${normalizedBaseId}@system`;
    }
    return `${normalizedBaseId}@system_${encodeURIComponent(normalizedProviderId)}`;
}

function buildUserSlotRouteId(baseModelId: string, slotId: string): string {
    return `${String(baseModelId || '').trim()}@slot_${encodeURIComponent(String(slotId || '').trim())}`;
}

function buildProviderRouteId(baseModelId: string, providerId: string): string {
    const normalizedProviderId = String(providerId || '').trim();
    const routeProviderId = normalizedProviderId.startsWith('provider_')
        ? normalizedProviderId
        : `provider_${normalizedProviderId}`;
    return `${String(baseModelId || '').trim()}@${encodeURIComponent(routeProviderId)}`;
}

const inferModelType = (modelId: string): GlobalModelType => {
    const id = modelId.toLowerCase();

    // OpenRouter Specific: "provider/model" format usually implies chat unless "flux", "sd", "ideogram" etc.
    const isOpenRouter = id.includes('/') && !id.startsWith('models/');

    const isVideo = id.includes('video') || id.includes('veo') || id.includes('kling') ||
        id.includes('runway') || id.includes('gen-3') || id.includes('gen-2') ||
        id.includes('luma') || id.includes('sora') || id.includes('pika') ||
        id.includes('minimax-video') || id.includes('wan') || id.includes('pixverse') ||
        id.includes('hailuo') || id.includes('seedance') || id.includes('viggle') ||
        id.includes('higgsfield') || id.includes('vidu') || id.includes('ray-') ||
        id.includes('jimeng') || id.includes('cogvideo') || id.includes('hunyuanvideo');
    if (isVideo) return 'video';

    // 皎眳?娴兼ˇ鍘涘Λ鈧晢銉ユ禈閻楀洤鍙ч槍顔跨槤,闃嗗灝鍘?gemini-*-image 鐞氼偉顕ゐ珨勩倓璐?chat
    const isImage = id.includes('imagen') || id.includes('image') || id.includes('img') ||
        id.includes('dall-e') || id.includes('dalle') || id.includes('midjourney') ||
        id.includes('mj') || id.includes('nano') || id.includes('banana') ||
        id.includes('flux') || id.includes('stable') || id.includes('sd-') ||
        id.includes('stable-diffusion') || id.includes('diffusion') ||
        id.includes('painting') || id.includes('draw') || id.includes('ideogram') ||
        id.includes('recraft') || id.includes('seedream');
    if (isImage) return 'image';

    const isAudio = id.includes('lyria') || id.includes('audio') || id.includes('music') ||
        id.includes('suno') || id.includes('voicemod') || id.includes('elevenlabs') ||
        id.includes('fish-audio');
    if (isAudio) return 'audio';

    const isChat = id.includes('gemini') || id.includes('gpt') || id.includes('claude') ||
        id.includes('deepseek') || id.includes('qwen') || id.includes('llama') ||
        id.includes('mistral') || id.includes('yi-') || id.includes(':free') ||
        id.includes('moonshot') || id.includes('doubao');
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
    private cloudSyncBackoffUntil = 0;

    // 棣冩畬 濡€崇€佛珨勬銆冪紓鎻跨摠
    private globalModelListCache: {
        models: any[];
        slotsHash: string;
        timestamp: number;
    } | null = null;
    private readonly CACHE_TTL = 5000; // 5缁夋帞绱︾€?

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

        this.loadProviders();
        this.providers.forEach((provider) => {
            this.syncLegacySlotsWithProvider(provider);
        });

        // 棣冩畬 Subscribe to admin model changes
        adminModelService.subscribe(() => {
            console.log('[KeyManager] Admin models updated, notifying listeners');
            this.notifyListeners();
        });
    }

    private getStorageKey(): string {
        if (!this.userId) return STORAGE_KEY; // Default global key for anon
        return `${STORAGE_KEY}_${this.userId}`;
    }

    /**
     * Add token usage to a key and update cost
     * 妫板嫮鐣婚挜妤€鏁栭暈鎯板殰閿枫劌鐨?key 缁夎鍩岄槖鐔峰灙閾绢偄鐔?
     */
    addUsage(keyId: string, tokens: number): void {
        const slot = this.state.slots.find(s => s.id === keyId);
        if (slot) {
            slot.usedTokens = (slot.usedTokens || 0) + tokens;
            slot.updatedAt = Date.now(); // Update timestamp

            // Check budget - 妫板嫮鐣婚挜妤€鏁栭暈鎯板殰閿枫劏鐤嗛幑?
            if (slot.budgetLimit > 0 && slot.totalCost >= slot.budgetLimit) {
                console.log(`[KeyManager] API ${slot.name} 妫板嫮鐣诲鑼垛偓妤€鏁?($${slot.totalCost.toFixed(2)}/$${slot.budgetLimit})`);
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
                    const keyType = determineKeyType(provider, baseUrl);
                    const format = normalizeApiProtocolFormat(
                        s.format,
                        provider === 'Google' && keyType === 'official' ? 'gemini' : 'auto'
                    );
                    const runtime = resolveProviderRuntime({
                        provider,
                        baseUrl,
                        format,
                        authMethod: s.authMethod,
                        headerName: s.headerName,
                        compatibilityMode: s.compatibilityMode,
                    });
                    const authMethod = runtime.authMethod as AuthMethod;
                    const shouldOverrideHeader = !s.headerName || (
                        s.headerName === GOOGLE_HEADER_NAME &&
                        provider !== 'Google' &&
                        !baseUrl.toLowerCase().includes('google')
                    );
                    const headerName = shouldOverrideHeader ? runtime.headerName : s.headerName;
                    const rawModels = Array.isArray(s.supportedModels) ? s.supportedModels : [];
                    // 皎眳?瓞瀛樺复娴ｈ法鏁ょ€涙ˇ鍋嶉晞鍕侀崹瀚斿灙鐞?娴ｅ棗顩ч弸娌фЦ Google Provider, 闀婎亜濮╃悰銉ュ弿缂傚搫銇戦晞鍕堥弬瑙勀侀崹?
                    let supportedModels = provider === 'Google' && rawModels.length === 0
                        ? [...DEFAULT_GOOGLE_MODELS]
                        : rawModels;

                    // 皎眳?闀婎亜濮╃悰銉ュ弿: 婵″倹鐏夐弰?Google Key,绾喕缂崠鍛儓鐎规ɑ鏌熷Ο鈥崇€烽敍灞借嫙閸撴棃娅庨棻鐐拆堥弬瑙勀侀崹?
                    if (provider === 'Google') {
                        supportedModels = supportedModels.filter((m: string) => isGoogleOfficialModelId(parseModelString(m).id));
                        const missingDefaults = DEFAULT_GOOGLE_MODELS.filter(m => !supportedModels.includes(m));
                        if (missingDefaults.length > 0) {
                            console.log(`[KeyManager] Auto-adding missing official models to key ${s.name}:`, missingDefaults);
                            supportedModels = [...supportedModels, ...missingDefaults];
                        }
                    }

                    // 皎眳?闀婎亜濮╅暀鈩冾劀濡€崇€佛珨勬銆冮敍鍩氱殺闀炑勀侀崹瀣讣缁夎鍩岄弬鐗埬侀崹?& 閾″鍚ㄩ敍? CRITICAL FIX for Deduplication
                    supportedModels = normalizeModelList(supportedModels, provider);

                    return {
                        ...s,
                        name: s.name || 'Unnamed Channel',
                        provider: (provider as Provider),
                        totalCost: s.totalCost || 0,
                        budgetLimit: s.budgetLimit !== undefined ? s.budgetLimit : -1,
                        tokenLimit: s.tokenLimit !== undefined ? s.tokenLimit : -1, // Default unlimited
                        type: s.type || keyType,
                        format,
                        baseUrl,
                        authMethod,
                        headerName,
                        compatibilityMode: runtime.compatibilityMode,
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
                        type: 'official', // 皎眳?Default to official for old keys
                        format: 'gemini',
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
            // 棣冩晙 Security Update:
            // 婵″倹鐏夐悽銊﹀煕瀹歌尙姗辫ぐ鏇捍娑撳秴鍟€娣囸８ｇ摠皤攧鐗堟拱閸?localStorage閿涘矂妲诲銏＄鏆楀眰鈧?
            // 娴犲懍缂€涙ˇ婀崘鍛摠娑擃叏绾撮獮璺烘倱濮濄儱鍩屾禍鎴狀伂閵?
            if (this.userId) {
                console.log('[KeyManager] 瀹夊叏妯″紡锛氱櫥褰曠敤鎴峰啓鍏ヤ簯绔紝璺宠繃鏈湴鏄庢枃瀛樺偍');
                // Optional: Clear existing local storage just in case
                localStorage.removeItem(key);

                // Sync to cloud
                if (!this.isSyncing) {
                    await this.saveToCloud(toSave);
                }
            } else {
                // Anonymous users persist only to local storage.
                localStorage.setItem(key, JSON.stringify(toSave));
                console.log('[KeyManager] Anonymous local state saved:', key);
            }

        } catch (e) {
            console.error('[KeyManager] Failed to save state:', e);
        }
    }

    /**
     * Get current user ID
     */
    getUserId(): string | null {
        return this.userId;
    }

    /**
     * Set user ID and sync with cloud
     */
    async setUserId(userId: string | null) {
        this.unsubscribeRealtime();

        this.userId = userId;

        if (userId) {
            console.log('[KeyManager] User login:', userId);

            // Prime local cache first for responsive UI.
            const localState = this.loadState();
            if (localState.slots.length > 0) {
                console.log('[KeyManager] Local cache loaded:', localState.slots.length, 'slots');
                this.state = localState;
                this.notifyListeners();
            }

            // Then hydrate cloud state asynchronously.
            setTimeout(() => {
                this.loadFromCloud().then(() => {
                    this.subscribeRealtime(userId);
                });
            }, 100);
        } else {
            console.log('[KeyManager] User logout');
            this.state = this.loadState();
            this.notifyListeners();
        }
    }

    private realtimeChannel: any = null;

    private subscribeRealtime(userId: string) {
        console.log('[KeyManager] Connecting realtime sync channel...');
        this.realtimeChannel = supabase.channel(`profiles:${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                    filter: `id=eq.${userId}`
                },
                async (payload) => {
                    console.log('[KeyManager] Cloud update received:', payload);
                    if (!this.isSyncing) {
                        await this.loadFromCloud();
                    }
                }
            )
            .subscribe();
    }

    private unsubscribeRealtime() {
        if (this.realtimeChannel) {
            console.log('[KeyManager] Disconnect realtime sync channel');
            supabase.removeChannel(this.realtimeChannel);
            this.realtimeChannel = null;
        }
    }

    /**
     * Load state from Supabase (Cloud is Source of Truth)
     */
    /**
     * Load state from Supabase (Cloud is Source of Truth)
     */
    private async loadFromCloud() {
        if (!this.userId) return;

        if (this.userId.startsWith('dev-user-')) return;

        try {
            this.isSyncing = true;
            console.log('[KeyManager] Loading cloud state...');

            const { data, error } = await supabase
                .from('profiles')
                .select('user_apis')
                .eq('id', this.userId)
                .single();

            if (error) {
                if (error.code !== 'PGRST116') {
                    console.warn('[KeyManager] Cloud fetch failed:', error);
                }
                // Empty cloud state: do not force-merge local keys.
                return;
            }

            if (data && data.user_apis) {
                let cloudSlots = data.user_apis as KeySlot[];
                if (Array.isArray(cloudSlots)) {
                    cloudSlots = cloudSlots.map(s => {
                        const provider = (s.provider as Provider) || 'Google';
                        const keyType = determineKeyType(provider, s.baseUrl);
                        const format = normalizeApiProtocolFormat(
                            (s as any).format,
                            provider === 'Google' && keyType === 'official' ? 'gemini' : 'auto'
                        );
                        const runtime = resolveProviderRuntime({
                            provider,
                            baseUrl: s.baseUrl,
                            format,
                            authMethod: s.authMethod,
                            headerName: s.headerName,
                            compatibilityMode: s.compatibilityMode,
                        });
                        const authMethod = runtime.authMethod as AuthMethod;

                        return {
                            ...s,
                            name: s.name || 'Cloud Key',
                            provider,
                            totalCost: s.totalCost || 0,
                            budgetLimit: s.budgetLimit !== undefined ? s.budgetLimit : -1,
                            tokenLimit: s.tokenLimit !== undefined ? s.tokenLimit : -1,
                            disabled: s.disabled || false,
                            createdAt: s.createdAt || Date.now(),
                            failCount: s.failCount || 0,
                            successCount: s.successCount || 0,
                            lastUsed: s.lastUsed || null,
                            lastError: s.lastError || null,
                            status: s.status || 'unknown',
                            weight: s.weight || 50,
                            timeout: s.timeout || 30000,
                            maxRetries: s.maxRetries || 2,
                            retryDelay: s.retryDelay || 1000,
                            type: keyType,
                            format,
                            authMethod,
                            headerName: s.headerName || runtime.headerName,
                            compatibilityMode: runtime.compatibilityMode,
                        };
                    });

                    cloudSlots = cloudSlots.map(s => {
                        const isGoogle = s.provider === 'Google' || (s.provider as string) === 'Gemini';
                        let newProvider = s.provider;
                        if ((s.provider as string) === 'Gemini' && !s.baseUrl) newProvider = 'Google' as Provider;
                        if (s.provider === 'Google' && s.baseUrl && !s.baseUrl.includes('googleapis.com')) newProvider = 'Custom' as Provider;

                        if (isGoogle) {
                            const currentModels = (s.supportedModels || []).filter((m: string) => isGoogleOfficialModelId(parseModelString(m).id));
                            const missingDefaults = DEFAULT_GOOGLE_MODELS.filter(m => !currentModels.includes(m));

                            if (missingDefaults.length > 0 || newProvider !== s.provider) {
                                console.log(`[KeyManager] Cloud Sync: Auto-adding models/fixing provider for key ${s.name}`);
                                return {
                                    ...s,
                                    provider: 'Google',
                                    supportedModels: [...currentModels, ...missingDefaults]
                                };
                            }
                        }
                        return s;
                    });

                    this.state.slots = cloudSlots;
                    console.log('[KeyManager] Cloud sync completed (overwrite mode). Keys:', this.state.slots.length);
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
            console.log('[KeyManager] Skip cloud upload (missing userId or dev user)');
            return;
        }

        if (Date.now() < this.cloudSyncBackoffUntil) {
            return;
        }

        try {
            console.log('[KeyManager] Uploading to Supabase...', {
                userId: this.userId,
                slotCount: state.slots.length
            });

            const { data: { user }, error: authError } = await supabase.auth.getUser();

            if (authError || !user) {
                console.error('[KeyManager] User auth invalid or session expired!', authError);
                return;
            }

            console.log('[KeyManager] User validation succeeded:', user.id);

            if (user.id !== this.userId) {
                console.error('[KeyManager] userId mismatch:', {
                    expected: this.userId,
                    actual: user.id
                });
                this.userId = user.id;
            }

            const uploadData = {
                id: user.id,
                user_apis: state.slots,
                updated_at: new Date().toISOString()
            };

            console.log('[KeyManager] Running update...', {
                id: uploadData.id,
                model_count: state.slots[0]?.supportedModels?.length
            });

            const { error } = await supabase
                .from('profiles')
                .update({
                    user_apis: uploadData.user_apis,
                    updated_at: uploadData.updated_at
                })
                .eq('id', user.id);

            if (error) {
                const isNetworkError = error.message?.includes('fetch') || error.message?.includes('Network');
                if (isNetworkError) {
                    console.warn('[KeyManager] \u7F51\u7EDC\u5F02\u5E38\uFF0C\u8DF3\u8FC7\u672C\u6B21 Supabase \u66F4\u65B0\uFF0C\u7A0D\u540E\u91CD\u8BD5');
                    this.cloudSyncBackoffUntil = Date.now() + 30_000;
                    return;
                }

                console.error('[KeyManager] Supabase update failed!', {
                    code: error.code,
                    message: error.message,
                    details: error.details,
                    hint: error.hint
                });
                if (error.code === '42501' || error.message.includes('policy')) {
                    console.error('[KeyManager] RLS policy blocked update. Check Supabase RLS settings.');
                    this.cloudSyncBackoffUntil = Date.now() + 5 * 60_000;
                    return;
                }
                throw error;
            }

            console.log('[KeyManager] Supabase upload succeeded!');
            this.cloudSyncBackoffUntil = 0;

            const { forceSync } = await import('../billing/costService');
            forceSync().catch(console.error);
        } catch (e: any) {
            const isNetworkError = e.message?.includes('fetch') || e.message?.includes('Network');
            if (!isNetworkError) {
                console.error('[KeyManager] saveToCloud failed:', e);
            }
        }
    }

    /**
     * Notify all listeners of state change
     */
    private notifyListeners(): void {
        // 棣冩畬 濞撳懘娅庡Ο鈥崇€佛珨勬銆冪紓鎻跨摠閿涘澃lots 閸欐垹鏁氶崣妗﹀闀炶绾?
        this.globalModelListCache = null;
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
     * 棣冩畬 濞撳懘娅庨崗銊ョ湰濡€崇€佛珨勬銆冪紓鎻跨摠閿涘煔皤焺 adminModelService 閺佺増宓佹棆瀛樻煀闀炴儼黏線閻㈩煉绾?
     */
    clearGlobalModelListCache(): void {
        this.globalModelListCache = null;
        console.log('[KeyManager] Global model list cache cleared');
    }

    /**
     * 棣冩畬 瀵搫鍩楅槂姘辩叀闀撯偓閾惧顓归槖鍛扳偓鍜冪焊瑜?adminModelService 閺佺増宓佹棆瀛樻煀闀炴儼黏線閻㈩煉绾?
     */
    forceNotify(): void {
        console.log('[KeyManager] Force notifying all listeners');
        this.notifyListeners();
    }

    /**
     * Test a potential channel connection
     */
    async testChannel(
        url: string,
        key: string,
        provider?: Provider | string,
        authMethod?: AuthMethod,
        headerName?: string,
        format?: ApiProtocolFormat
    ): Promise<{ success: boolean, message?: string }> {
        try {
            // Sanitize input key before connectivity test
            const cleanKey = key.replace(/[^\x00-\x7F]/g, "").trim();
            if (!cleanKey) return { success: false, message: 'API Key \u65E0\u6548\uFF08\u4EC5\u652F\u6301 ASCII / \u82F1\u6587\u5B57\u7B26\uFF09' };

            let targetUrl = url;
            const headers: Record<string, string> = {};

            // Pre-process URL
            const cleanUrl = url.replace(/\/chat\/completions$/, '').replace(/\/$/, '');

            const runtime = resolveProviderRuntime({
                provider,
                baseUrl: cleanUrl,
                format,
                authMethod,
                headerName,
            });
            const resolvedAuthMethod = runtime.authMethod as AuthMethod;
            const resolvedHeader = runtime.headerName;

            if (runtime.geminiNative || runtime.resolvedFormat === 'gemini') {
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
                    targetUrl = `${targetUrl}?key=${cleanKey}`;
                } else {
                    headers[resolvedHeader] = cleanKey;
                }
                // headers['Content-Type'] = 'application/json'; // Not strictly triggered for GET
            } else {
                // OpenAI Compatible Logic - 棣冩畬 [Fix] Use /v1/models for proxy compatibility
                const cleanBaseUrl = cleanUrl.replace(/\/v1$/, '').replace(/\/v1\/models$/, '').replace(/\/models$/, '');
                targetUrl = `${cleanBaseUrl}/v1/models`;
                const headerValue = resolvedHeader.toLowerCase() === 'authorization'
                    ? formatAuthorizationHeaderValue(cleanKey, runtime.authorizationValueFormat)
                    : cleanKey;
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
    async fetchRemoteModels(
        baseUrl: string,
        key: string,
        authMethod?: AuthMethod,
        headerName?: string,
        provider?: Provider | string,
        format?: ApiProtocolFormat
    ): Promise<string[]> {
        try {
            const cleanUrl = baseUrl.replace(/\/chat\/completions$/, '').replace(/\/$/, '');
            const runtime = resolveProviderRuntime({
                provider,
                baseUrl: cleanUrl,
                format,
                authMethod,
                headerName,
            });
            const resolvedAuthMethod = runtime.authMethod as AuthMethod;
            const resolvedHeader = runtime.headerName;
            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

            if (resolvedAuthMethod !== 'query') {
                headers[resolvedHeader] = resolvedHeader.toLowerCase() === 'authorization'
                    ? formatAuthorizationHeaderValue(key, runtime.authorizationValueFormat)
                    : key;
            }

            // OpenRouter CORS Fix
            if (cleanUrl.includes('openrouter.ai')) {
                headers['HTTP-Referer'] = window.location.origin; // Required by OpenRouter
                headers['X-Title'] = 'KK Studio'; // Optional
            }

            if (runtime.geminiNative || runtime.resolvedFormat === 'gemini') {
                const response = await fetch(
                    buildGeminiModelsEndpoint(cleanUrl, key, resolvedAuthMethod, typeof provider === 'string' ? provider : undefined),
                    {
                        method: 'GET',
                        headers: buildGeminiHeaders(resolvedAuthMethod, key, resolvedHeader, runtime.authorizationValueFormat),
                    }
                );

                if (!response.ok) {
                    return [];
                }

                const data = await response.json();
                const geminiModels: any[] = data.models || data.data || [];
                return geminiModels
                    .map((model: any) => String(model?.name || model?.id || model?.model || '').replace(/^models\//i, ''))
                    .filter(Boolean);
            }

            let targetUrls = [
                cleanUrl.endsWith('/models') ? cleanUrl : `${cleanUrl}/models`,
            ];

            if (!cleanUrl.match(/\/v1\/?$/) && !cleanUrl.match(/\/v1beta\/?$/)) {
                targetUrls.push(`${cleanUrl}/v1/models`);
                targetUrls.push(`${cleanUrl}/v1beta/models`);
            }

            targetUrls = [...new Set(targetUrls)];

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

                            // 棣冩畬 Add System Internal Models (Built-in Credits)
                            Object.entries(MODEL_REGISTRY).forEach(([id, m]) => {
                                // [Fix] Filter system internal models to only include specific "Banana" ones
                                const isTargetBanana = id === 'gemini-3.1-flash-image-preview' || id === 'gemini-3-pro-image-preview';

                                if (m.isSystemInternal && isTargetBanana) {
                                    // Add to the list of models, ensuring it's not duplicated
                                    const modelIdWithSuffix = `${id}@system`;
                                    if (!models.includes(modelIdWithSuffix)) {
                                        models.push(modelIdWithSuffix);
                                    }
                                }
                            });

                            // 鉁?[NEW] 灏濊瘯闈欓粯鑾峰彇 /pricing 绔偣骞跺姩鎬佹洿鏂板叏灞€浠锋牸
                            try {
                                const pricingUrl = cleanUrl.endsWith('/v1') ? cleanUrl.replace(/\/v1$/, '') + '/pricing' : cleanUrl + '/pricing';
                                // We don't want to block the models return, so do this asynchronously but catch errors locally.
                                // It runs in the background.
                                fetch(pricingUrl, {
                                    method: 'GET',
                                    headers: headers
                                }).then(async (pricingRes) => {
                                    if (pricingRes.ok) {
                                        const pricingData = await pricingRes.json();
                                        if (pricingData && (pricingData.data || Array.isArray(pricingData))) {
                                            const { mergeModelPricingOverrides } = await import('../model/modelPricing');
                                            mergeModelPricingOverrides(pricingData);
                                        }
                                    }
                                }).catch(e => {
                                    console.log('[KeyManager] Silent pricing fetch failed or unsupported:', e);
                                });
                            } catch (e) {
                                console.log('[KeyManager] Silent pricing fetch setup failed:', e);
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
    getNextKey(modelId: string, preferredKeyId?: string): KeySlot | null {
        // Parse the requested ID to separate base model and suffix
        // Format: modelId@Suffix or just modelId
        const [baseIdPart, suffix] = modelId.split('@');

        // Normalize the requested model ID and apply migration mapping
        let normalizedModelId = baseIdPart.replace(/^models\//, '');
        // 鍏煎 UI/鍘嗗彶鏁版嵁閲屽彲鑳藉嚭鐜扮殑灞曠ず鍚嶄綔涓?modelId
        const lowerRequested = normalizedModelId.toLowerCase();
        // 浠呬慨姝ｂ€滃睍绀哄悕杈撳叆鈥濆満鏅紙绌烘牸褰㈠紡锛夛紝涓嶆敼鍐欐爣鍑嗘ā鍨婭D锛堣繛瀛楃褰㈠紡锛夈€?
        // 杩炲瓧绗﹀舰寮忓彲鑳芥槸鍒嗗彂娓犻亾鐨勭湡瀹炴ā鍨嬪悕锛堜緥濡?nano-banana-2锛夈€?
        if (lowerRequested === 'nano banana pro') {
            normalizedModelId = 'gemini-3-pro-image-preview';
        } else if (lowerRequested === 'nano banana') {
            normalizedModelId = 'gemini-2.5-flash-image';
        } else if (lowerRequested === 'nano banana 2') {
            normalizedModelId = 'gemini-3.1-flash-image-preview';
        }

        // 鏈夊悗缂€鏃朵唬琛ㄥ己缁戝畾鏌愪釜娓犻亾锛園xxx锛夛紝浼樺厛灏婇噸璇ユ笭閬撶殑鍘熷妯″瀷ID锛?
        // 閬垮厤鎶婃笭閬撳唴鍒悕寮哄埗杩佺Щ涓哄畼鏂笽D瀵艰嚧鈥滄棤鍙敤娓犻亾鈥濄€?
        if (!suffix && MODEL_MIGRATION_MAP[normalizedModelId]) {
            normalizedModelId = MODEL_MIGRATION_MAP[normalizedModelId];
        }

        // 馃殌 [Model-Driven Logic]
        // 妫€娴嬫槸鍚︿负鈥滅Н鍒嗘ā鍨嬧€濓紙鍗冲唴缃ā鍨嬶紝濡?Nano Banana 绯诲垪锛?
        // 杩欎簺妯″瀷濡傛灉娌℃湁鎸囧畾鍚庣紑锛岄粯璁よ蛋鍐呯疆 PROXY 绾胯矾
        const isCreditModel = normalizedModelId.includes('nano-banana') ||
            normalizedModelId.includes('gemini-3.1-flash-image') ||
            normalizedModelId.includes('gemini-3-pro-image') ||
            normalizedModelId === 'gemini-2.5-flash-image' ||
            normalizedModelId.includes('lyria');

        // --- SEPARATION STRATEGY ---
        // 1. 濡傛灉鏈夋樉绀哄悗缂€ (@Suffix)锛屽己鍒跺鎵惧搴旈閬?
        // 2. 濡傛灉鏃犲悗缂€锛?
        //    - 濡傛灉鏄Н鍒嗘ā鍨?(Nano Banana 绛? -> 璧板唴缃?PROXY
        //    - 濡傛灉鏄櫘閫氭ā鍨?(Gemini 1.5 绛? -> 璧扮敤鎴烽厤缃殑 Google Key

        // 馃殌 [Fix] 灏?providers 杞崲涓轰复鏃剁殑 KeySlot 浠ヤ究缁熶竴璋冨害
        this.loadProviders();
        const providerSlots: KeySlot[] = this.providers.filter(p => p.isActive).map(p => {
            const provider = (['Google', 'OpenAI', 'Anthropic', 'Volcengine', 'Aliyun', 'Tencent', 'SiliconFlow', '12AI'].includes(p.name) ? p.name : 'Custom') as Provider;
            const format = normalizeApiProtocolFormat(p.format, 'auto');
            const runtime = resolveProviderRuntime({
                provider,
                baseUrl: p.baseUrl,
                format,
            });
            const authMethod = runtime.authMethod as AuthMethod;

            return {
                id: p.id,
                key: p.apiKey,
                name: p.name,
                provider,
                baseUrl: p.baseUrl,
                format,
                authMethod,
                headerName: runtime.headerName,
                group: p.group,
                status: 'valid',
                budgetLimit: -1,
                totalCost: 0,
                successCount: 0,
                failCount: 0,
                supportedModels: p.models,
                type: 'third-party',
                lastUsed: 0,
                lastError: null,
                disabled: false,
                createdAt: 0,
                proxyConfig: {
                    serverUrl: p.baseUrl,
                    serverName: p.name,
                    isEnabled: true
                }
            };
        });

        const effectiveUserSlots = this.state.slots.map((slot) => {
            const linkedProvider = this.findLinkedProviderForSlot(slot);
            if (!linkedProvider) return slot;

            const effectiveSlot = this.buildEffectiveSlotFromProvider(slot, linkedProvider);
            if (String(effectiveSlot.key || '').trim() !== String(slot.key || '').trim()) {
                console.log(
                    `[KeyManager] Overriding legacy slot at runtime from provider ${linkedProvider.name}: ${slot.name}[${slot.id}] -> ${linkedProvider.id}`
                );
            }
            return effectiveSlot;
        });

        const allSlots = [...effectiveUserSlots, ...providerSlots];

        const modelSupportedBySlot = (slot: KeySlot) => {
            const supported = slot.supportedModels || [];
            if (supported.includes('*')) return true;
            return supported.some(m => {
                const parts = parseModelString(m);
                const id = parts.id.replace(/^models\//, '');
                return id === normalizedModelId;
            });
        };

        const isSlotHealthy = (slot: KeySlot) => {
            if (slot.disabled) return false;
            if (slot.budgetLimit > 0 && slot.totalCost >= slot.budgetLimit) return false;
            return true;
        };

        const matchesRequestedRoute = (slot: KeySlot) => {
            // 鏃犲悗缂€ = 瀹樻柟鐩磋繛锛屽彧鍏佽 Google
            if (!suffix) {
                return slot.provider === 'Google';
            }

            return matchesSlotRouteSuffix(slot, suffix);
        };

        // [Note] 绉垎妯″瀷寮哄埗璺敱宸茬Щ闄?

        if (preferredKeyId) {
            const normalizedPreferredKeyId = String(preferredKeyId).trim().toLowerCase();
            const preferredRouteTarget = extractSlotRouteTarget(normalizedPreferredKeyId);
            const preferred = allSlots.find(s => {
                const slotIdLower = String(s.id || '').trim().toLowerCase();
                return slotIdLower === normalizedPreferredKeyId || (!!preferredRouteTarget && slotIdLower === preferredRouteTarget);
            });
            if (preferred && isSlotHealthy(preferred) && modelSupportedBySlot(preferred) && matchesRequestedRoute(preferred)) {
                return this.prepareKeyResult(preferred);
            }
            if (!suffix) {
                console.warn(`[KeyManager] Preferred key unavailable for model=${normalizedModelId}, fallback to normal routing. preferredKeyId=${preferredKeyId}`);
            }
        }

        let candidates: KeySlot[] = [];

        if (!suffix) {
            // [No Suffix Case]

            // [Note] 绉垎妯″瀷浼樺厛閫昏緫宸茬Щ闄?

            // B. 闈炵Н鍒嗘ā鍨嬶細瀵绘壘鐢ㄦ埛鑷繁鐨?Google 瀹樻柟 Key (鐩磋繛妯″紡)
            candidates = allSlots.filter(s => s.provider === 'Google' || (s.provider as string) === 'Gemini');
            let strictCandidates = candidates.filter(s => modelSupportedBySlot(s));

            if (strictCandidates.length > 0) {
                candidates = strictCandidates;
            } else {
                console.warn(`[KeyManager] 鎵句笉鍒板畼鏂?Key: ${normalizedModelId}`);
            }

        } else {
            // [Proxy / Channel Connection]
            // Strategy: find keys matching the selected suffix.
            const normalizedSuffix = String(suffix || '').trim().toLowerCase();
            const isSystemRoute = normalizedSuffix.startsWith('system') || normalizedSuffix === 'systemproxy';
            const proxyAliasSet = new Set(['custom', 'proxy', 'proxied', 'system', 'builtin']);
            if (isSystemRoute) {
                // 棣冩畬 [Fix] 閿枫劍鈧胶鏁氶幋鎰娑?SystemProxy 闀勫嫯娅勷ò?KeySlot 娴溿倗鏁?LLMService 鐟欙絾鐎?
                // 閿茬姳璐熺粻锛勬倞閿绘﹢鍘嗙純顔炬畱缁崵绮虹粔顖氬瀻濡€崇€锋稉宥呭晙鐎涙ˇ鍙嗛摼顒€婀撮悽銊﹀煕闀愪胶娈?slots 娑?
                return this.prepareKeyResult({
                    id: `backend_proxy_${normalizedModelId}`,
                    key: 'system-proxy-managed-key',
                    name: 'System Internal',
                    provider: 'SystemProxy',
                    status: 'valid',
                    budgetLimit: -1,
                    totalCost: 0,
                    successCount: 0,
                    failCount: 0,
                    supportedModels: [normalizedModelId],
                    type: 'proxy',
                    lastUsed: Date.now(),
                    lastError: null,
                    disabled: false,
                    createdAt: Date.now()
                } as KeySlot);

                // 鐠哄疇缁烽挅搴ｇ敾閽粈鍞悶鍡楀焼閽栧秴娲栭槂鈧珨勯鎹㈤晵蹇涙姜Google濞撶娀浜鹃挰婵堟畱闃冩槒绶?
            } else {

                // Step 1: 缁墽鈥橀挅宀栃為崠褰掑巻
                const routeTarget = extractSlotRouteTarget(normalizedSuffix);
                const nameMatchedCandidates = allSlots.filter(s => {
                    if (routeTarget) {
                        return String(s.id || '').trim().toLowerCase() === routeTarget;
                    }

                    return matchesSlotRouteSuffix(s, normalizedSuffix);
                });

                // Step 2: 鐎电懓鎮曠粔鏉垮爱闁板矕娈戠偧穑棆鈧绻樼悰灞灸侀崹瀣环濠?
                let modelFilteredCandidates = nameMatchedCandidates.filter(s => modelSupportedBySlot(s));

                // Step 3: 婵″倹鐏夐挅宀栃為崠褰掑巻闀撴儳鍩屾禍鍡涱暥闃嗘墤绲惧Ο鈥崇€锋潻鍥ㄦ姢閽栧簼璐熺粚鐚寸捍
                // 娣団€叉崲閽栧矕袨閸栧綊鍘?閽?鐠囥儵顣堕槅鎻垮建閼宠棄濮╅晲浣规暜闀屼焦娲挎径穑睗膩閸ㄥ绲鹃摼顒€婀答珨勬銆冮摼顏勬倱濮?
                if (nameMatchedCandidates.length > 0 && modelFilteredCandidates.length === 0) {
                    console.log(`[KeyManager] Name-matched candidates for suffix '${normalizedSuffix}' but model filter rejected '${normalizedModelId}', fallback to name matches.`);
                    candidates = nameMatchedCandidates;
                } else if (modelFilteredCandidates.length > 0) {
                    candidates = modelFilteredCandidates;
                } else {
                    candidates = [];
                }

                // Step 4: 婵″倹鐏夊▽鈩冩箒娴犺缍嶉挅宀栃為崠褰掑巻閿涘奔绗栭挅搴ｇ磻鐏炵偘绨槂姘辨暏娴狅絿鎮婐珨勵偄鎮曢敍?
                // 閿蹭负鈧偓皤攧?娴犵粯鍓伴棻婵璷ogle闃冩岸浜炬稉顓熸暜闀屼浇顕氬Ο鈥崇€烽晞?濡€崇汉
                if (candidates.length === 0 && proxyAliasSet.has(normalizedSuffix)) {
                    candidates = allSlots.filter(s => {
                        if (s.provider === 'Google') return false;
                        return modelSupportedBySlot(s);
                    });
                }

                // [Note] system/builtin 閽栧海绱戞径鍕倞瀹歌尙些闂?

                console.log(
                    `[KeyManager] Suffix='${normalizedSuffix}', routeTarget='${routeTarget || ''}', NameMatched=${nameMatchedCandidates.length}, ModelFiltered=${modelFilteredCandidates.length}, FinalCandidates=${candidates.length}` +
                    (candidates.length > 0
                        ? ` -> ${candidates.map(c => `${c.name}[${c.id}]@${String(c.baseUrl || '').trim() || 'no-base-url'}`).join(', ')}`
                        : '')
                );
            }
        }

        // --- DIAGNOSTICS & FILTERING ---
        // Now filter candidates by HEALTH (Status, Budget, Disabled)

        const validCandidates: KeySlot[] = [];
        const budgetExhausted: KeySlot[] = [];
        const disabled: KeySlot[] = [];

        for (const s of candidates) {
            if (s.disabled) {
                disabled.push(s);
                continue;
            }
            if (s.budgetLimit > 0 && (s.totalCost || 0) >= s.budgetLimit) {
                budgetExhausted.push(s);
                continue;
            }
            validCandidates.push(s);
        }

        if (validCandidates.length === 0) {
            // 皎眳?JIT Auto-Repair (Official Only)
            if (!suffix && (normalizedModelId.startsWith('gemini-') || normalizedModelId.startsWith('imagen-') || normalizedModelId.startsWith('veo-'))) {

                // Find any healthy Google key
                const healingCandidates = this.state.slots.filter(s =>
                    (s.provider === 'Google' || (s.provider as string) === 'Gemini') &&
                    !s.disabled &&
                    (s.budgetLimit < 0 || (s.totalCost || 0) < s.budgetLimit)
                );

                if (healingCandidates.length > 0) {
                    console.log(`[KeyManager] JIT Healing: Valid Google key found, auto-authorizing ${normalizedModelId}`);
                    const selected = healingCandidates[0];

                    // Auto-fix
                    if (!selected.supportedModels) selected.supportedModels = [];
                    if (!selected.supportedModels.includes(normalizedModelId)) {
                        selected.supportedModels.push(normalizedModelId);
                        this.saveState();
                    }
                    return this.prepareKeyResult(selected);
                }
            }

            // [Note] 閸愬懐鐤嗛摼宥呭 Fallback 瀹歌尙些闂?

            return null;
        }

        // 3. Apply Strategy
        // Common Sort: Valid > Unknown > Rate Limited
        const now = Date.now();
        const cooldownFiltered = validCandidates.filter(s => {
            // 棣冩畬 [Fix] 閸愬懐鐤嗛敺鐘烩偓鐔告箛閿?缁夘垰鍨庡Ο鈥崇€锋稉稹簝铔嬬€广垺鍩涚粩顖氥枮閸楄揪绾撮悽鍗炴倵缁旑垳绮烘稉鈧粻锛勬倞
            if (s.provider === 'SystemProxy' || s.id?.startsWith('backend_proxy')) return true;
            if (s.cooldownUntil && now < s.cooldownUntil) return false;
            if (s.status !== 'rate_limited') return true;
            if (!s.lastUsed) return false;
            return now - s.lastUsed >= RATE_LIMIT_COOLDOWN_MS;
        });

        const healthy = cooldownFiltered.filter(s => s.status !== 'invalid' && s.status !== 'rate_limited');
        let usable = healthy.length > 0 ? healthy : cooldownFiltered; // prefer non-rate-limited and cooldown-passed keys

        // If all matching keys are still in cooldown, fallback to original candidate list (degraded mode)
        if (usable.length === 0) {
            const blocked = validCandidates.filter(s =>
                (s.status === 'rate_limited' && s.lastUsed && (now - s.lastUsed < RATE_LIMIT_COOLDOWN_MS)) ||
                (!!s.cooldownUntil && now < s.cooldownUntil)
            );
            if (blocked.length > 0) {
                const shortestWaitMs = Math.min(...blocked.map(s => {
                    const rateLimitWait = s.lastUsed ? Math.max(0, RATE_LIMIT_COOLDOWN_MS - (now - s.lastUsed)) : RATE_LIMIT_COOLDOWN_MS;
                    const explicitWait = s.cooldownUntil ? Math.max(0, s.cooldownUntil - now) : 0;
                    return Math.max(rateLimitWait, explicitWait);
                }));
                console.warn(`[KeyManager] All matching keys are in rate-limit cooldown. Fallback enabled. Earliest retry in ~${Math.ceil(shortestWaitMs / 1000)}s`);
            }
            usable = validCandidates;
        }

        if (usable.length === 0) return null;

        usable.sort((a, b) => {
            // Prefer Valid
            if (a.status === 'valid' && b.status !== 'valid') return -1;
            if (a.status !== 'valid' && b.status === 'valid') return 1;
            return 0;
        });

        // Determine Selection
        const strategy = this.state.rotationStrategy || 'round-robin';
        let winner: KeySlot;

        if (strategy === 'sequential') {
            winner = usable[0];
        } else {
            // Round Robin: Pick random from top tier
            const topStatus = usable[0].status;
            const topTier = usable.filter(s => s.status === topStatus);
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
    private prepareKeyResult(slot: KeySlot): KeySlot {
        // Update last used timestamp (skip for built-in proxy to avoid concurrent request issues)
        if (slot.provider !== 'SystemProxy' && !slot.id?.startsWith('backend_proxy')) {
            const actualSlot = this.state.slots.find(s => s.id === slot.id);
            if (actualSlot) {
                actualSlot.lastUsed = Date.now();
                this.saveState();
            }
        }

        const baseUrl = slot.baseUrl || GOOGLE_API_BASE;
        const runtime = resolveProviderRuntime({
            provider: slot.provider,
            baseUrl,
            format: slot.format,
            authMethod: slot.authMethod || getDefaultAuthMethod(baseUrl, {
                provider: slot.provider,
                format: slot.format,
            }),
            headerName: slot.headerName,
            compatibilityMode: slot.compatibilityMode,
        });

        return {
            ...slot,
            id: slot.id,
            key: slot.key,
            name: slot.name || slot.provider || 'Unnamed Channel',
            baseUrl,
            format: normalizeApiProtocolFormat(slot.format, runtime.resolvedFormat),
            authMethod: runtime.authMethod as AuthMethod,
            headerName: runtime.headerName,
            compatibilityMode: runtime.compatibilityMode,
            group: slot.group,
            provider: slot.provider || 'Google',
            timeout: slot.timeout,
            customHeaders: slot.customHeaders,
            customBody: slot.customBody,
            cooldownUntil: slot.cooldownUntil
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
            slot.cooldownUntil = undefined;
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

            const lowerError = String(error || '').toLowerCase();
            const isRateLimit =
                lowerError.includes('429') ||
                lowerError.includes('rate limit') ||
                lowerError.includes('too many requests') ||
                lowerError.includes('quota exceeded');

            const isAuthError =
                hasAuthErrorMarkers(error) ||
                lowerError.includes('authentication') ||
                lowerError.includes('permission denied') ||
                lowerError.includes('permission_denied');

            // 棣冩畬 [Fix] 閸愬懐鐤嗛敺鐘烩偓鐔告箛閿?缁夘垰鍨庡Ο鈥崇€锋稉稹簝铔嬬€广垺鍩涚粩顖氥枮閸楀瓨甯︷珨勮绾撮悽鍗炴倵缁旑垳绮烘稉鈧粻锛勬倞
            if (slot.provider === 'SystemProxy' || slot.id?.startsWith('backend_proxy')) {
                // 娴犲懓顔囪ぐ鏇㈡晩鐠囶垽绾存稉宥嗘暭閸欐濮搁晲渚婄焊閽栧海顏紒鐔剁缁狅紕鎮婇敍?
                console.warn(`[KeyManager] SystemProxy error reported but not changing cooldown state: ${error}`);
            } else if (isRateLimit) {
                slot.status = 'rate_limited';
                slot.cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
            } else if (isAuthError) {
                slot.status = 'invalid';
                slot.cooldownUntil = undefined;
            } else {
                // 閻㈢喐鍨氭径杈Е/缂冩垹绮堕繑鏍уЗ/娑撳﹥鐖跺鍌氱埗娑撳秴绨插闀愮畽闀欏洨瀛╂稉?invalid閿涘苯娲栶珨?unknown 閸忎浇顔忛挅搴ｇ敾闀婎亜濮╅晣銏狀槻
                slot.status = 'unknown';
                const transientBackoff = Math.min(15000, 2000 * Math.max(1, slot.failCount));
                slot.cooldownUntil = Date.now() + transientBackoff;
            }

            this.saveState();
            this.notifyListeners();
        }
    }
    /**
     * Toggle disabled state for manual pause/resume
     * 皎睂鍌氫粻闀?key 娴兼氨些皤攧浼淬€庢惔蹇涙Е皤攧妤佹堡鐏?
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
                slot.cooldownUntil = undefined;
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
        const slot = this.state.slots.find((s) => s.id === keyId);
        if (!slot) return;

        const previousCost = slot.totalCost || 0;
        slot.totalCost = previousCost + cost;

        if (slot.budgetLimit > 0) {
            const usageRatio = slot.totalCost / slot.budgetLimit;
            const previousRatio = previousCost / slot.budgetLimit;

            if (usageRatio >= 0.9 && previousRatio < 0.9) {
                import('../system/notificationService').then(({ notify }) => {
                    notify.warning(
                        'Budget warning',
                        `API Key "${slot.name}" is using ${(usageRatio * 100).toFixed(0)}% of its budget ($${slot.totalCost.toFixed(2)} / $${slot.budgetLimit}).`
                    );
                });
            }

            if (usageRatio >= 1.0 && previousRatio < 1.0) {
                import('../system/notificationService').then(({ notify }) => {
                    notify.error(
                        'Budget exhausted',
                        `API Key "${slot.name}" reached its budget limit. Recharge or increase the budget to continue.`
                    );
                });
            }
        }

        this.saveState();
        this.notifyListeners();
    }

    /**
     * Reset usage statistics for a key.
     */
    resetUsage(keyId: string): void {
        const slot = this.state.slots.find((s) => s.id === keyId);
        if (!slot) return;

        slot.totalCost = 0;
        slot.failCount = 0;
        slot.successCount = 0;
        slot.status = 'unknown';
        this.saveState();
        this.notifyListeners();
        console.log(`[KeyManager] Usage reset for key ${slot.name} (${keyId})`);
    }

    /**
     * Clear all keys (for example on user switch).
     */
    clearAll(): void {
        this.state.slots = [];
        this.state.currentIndex = 0;
        this.saveState();
        this.notifyListeners();
    }

    /**
     * Reorder slots for manual sorting.
     */
    reorderSlots(fromIndex: number, toIndex: number): void {
        if (
            fromIndex < 0
            || fromIndex >= this.state.slots.length
            || toIndex < 0
            || toIndex >= this.state.slots.length
        ) {
            return;
        }

        const slots = [...this.state.slots];
        const [moved] = slots.splice(fromIndex, 1);
        slots.splice(toIndex, 0, moved);

        this.state.slots = slots;
        this.saveState();
        this.notifyListeners();
    }

    async addKey(key: string, options?: {
        name?: string;
        provider?: Provider | string;
        baseUrl?: string;
        format?: ApiProtocolFormat;
        authMethod?: AuthMethod;
        headerName?: string;
        compatibilityMode?: 'standard' | 'chat';
        supportedModels?: string[];
        budgetLimit?: number;
        tokenLimit?: number;
        creditCost?: number;
        type?: 'official' | 'proxy' | 'third-party';
        proxyConfig?: { serverName?: string };
        customHeaders?: Record<string, string>;
        customBody?: Record<string, any>;
    }): Promise<{ success: boolean; error?: string; id?: string }> {
        // 皎眳?Sanitize input key: trim and remove non-ASCII chars
        const trimmedKey = key.replace(/[^\x00-\x7F]/g, "").trim();

        if (!trimmedKey) {
            return { success: false, error: '请输入有效的 API Key（仅保留 ASCII 字符）。' };
        }

        // Check for duplicates
        if (this.state.slots.some(s => s.key === trimmedKey && s.baseUrl === options?.baseUrl)) {
            return { success: false, error: '该 API Key 已存在，请勿重复添加。' };
        }

        const baseUrl = options?.baseUrl || '';
        const keyType = determineKeyType(options?.provider || 'Custom', baseUrl);
        const format = normalizeApiProtocolFormat(
            options?.format,
            options?.provider === 'Google' && keyType === 'official' ? 'gemini' : 'auto'
        );
        const runtime = resolveProviderRuntime({
            provider: options?.provider || 'Custom',
            baseUrl,
            format,
            authMethod: options?.authMethod,
            headerName: options?.headerName,
            compatibilityMode: options?.compatibilityMode,
        });
        const authMethod = runtime.authMethod as AuthMethod;
        const headerName = runtime.headerName;

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

        // 皎眳?闀婎亜濮╅暀鈩冾劀濡€崇€佛珨勬銆冮敍鍩氱殺闀炑勀侀崹瀣讣缁夎鍩岄弬鐗埬侀崹瀣剁骇
        supportedModels = normalizeModelList(supportedModels, options?.provider);

        const newSlot: KeySlot = {
            id: `key_${Date.now()}`,
            key: trimmedKey,
            name: options?.name || 'My Channel',
            // Default provider logic
            provider: (options?.provider as Provider) || 'Custom',
            // Default type logic using helper
            type: options?.type || keyType,
            format,
            baseUrl,
            authMethod,
            headerName,
            compatibilityMode: runtime.compatibilityMode,
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
            creditCost: options?.creditCost,
            proxyConfig: options?.proxyConfig,
            customHeaders: options?.customHeaders,
            customBody: options?.customBody,
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
        console.log('[KeyManager] updateKey invoked:', {
            id,
            updates,
            supportedModelsBefore: this.state.slots.find(s => s.id === id)?.supportedModels
        });
        const slot = this.state.slots.find(s => s.id === id);
        if (slot) {
            Object.assign(slot, updates);
            if ((updates.provider || updates.baseUrl !== undefined) && !updates.type) {
                slot.type = determineKeyType(slot.provider, slot.baseUrl);
            }
            if (
                updates.format !== undefined
                || updates.provider !== undefined
                || updates.baseUrl !== undefined
                || updates.authMethod !== undefined
                || updates.headerName !== undefined
                || updates.compatibilityMode !== undefined
            ) {
                slot.format = normalizeApiProtocolFormat(
                    updates.format ?? slot.format,
                    slot.provider === 'Google' && determineKeyType(slot.provider, slot.baseUrl) === 'official' ? 'gemini' : 'auto'
                );
                const runtime = resolveProviderRuntime({
                    provider: slot.provider,
                    baseUrl: slot.baseUrl,
                    format: slot.format,
                    authMethod: updates.authMethod || slot.authMethod,
                    headerName: updates.headerName || slot.headerName,
                    compatibilityMode: updates.compatibilityMode || slot.compatibilityMode,
                });
                slot.authMethod = runtime.authMethod as AuthMethod;
                slot.headerName = runtime.headerName;
                slot.compatibilityMode = runtime.compatibilityMode;
            }
            if (updates.supportedModels) {
                slot.supportedModels = normalizeModelList(updates.supportedModels, slot.provider);
            }
            slot.updatedAt = Date.now();
            await this.saveState();
            this.notifyListeners();
        }
    }


    /**
     * Validate an API key by making a test request
     */
    /**
     * Validate an API key by making a test request.
     * @param syncModels If true, also fetches and returns the latest model list from the API.
     */
    async validateKey(key: string, provider: string = 'Gemini', syncModels: boolean = false): Promise<{ valid: boolean; error?: string; models?: string[] }> {
        if (provider !== 'Gemini' && provider !== 'Google' && provider !== 'Custom' && provider !== 'OpenAI') {
            // Other OpenAI-compatible providers are validated in refreshKey with baseUrl context.
            return { valid: true };
        }

        try {
            let isValid = false;
            let errorMsg = undefined;
            let fetchedModels: string[] | undefined = undefined;

            if (provider === 'Gemini' || provider === 'Google') {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
                    { method: 'GET' }
                );

                const limitRequests = response.headers.get('x-ratelimit-limit-requests');
                const remainingRequests = response.headers.get('x-ratelimit-remaining-requests');
                const resetRequests = response.headers.get('x-ratelimit-reset-requests');

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
                    isValid = true;
                } else if (response.status === 429) {
                    isValid = true;
                    errorMsg = '\u6709\u6548\u4F46\u5DF2\u9650\u6D41';
                } else if (response.status === 401 || response.status === 403) {
                    isValid = false;
                    errorMsg = 'API Key \u65E0\u6548';
                } else {
                    isValid = false;
                    errorMsg = `HTTP ${response.status}`;
                }

                if (isValid && syncModels) {
                    fetchedModels = await fetchGoogleModels(key);
                }
            } else {
                return { valid: true };
            }

            return { valid: isValid, error: errorMsg, models: fetchedModels };
        } catch (e: any) {
            return { valid: false, error: e.message || '\u7F51\u7EDC\u9519\u8BEF' };
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

    public getEffectiveKey(id: string): KeySlot | undefined {
        const slot = this.state.slots.find((item) => item.id === id);
        if (!slot) return undefined;

        const linkedProvider = this.findLinkedProviderForSlot(slot);
        return linkedProvider ? this.buildEffectiveSlotFromProvider(slot, linkedProvider) : slot;
    }
    /**
     * Refresh a single key
     * 棣冩畬 Now also synchronizes model list!
     */
    async refreshKey(id: string): Promise<void> {
        const slot = this.state.slots.find(s => s.id === id);
        if (slot) {
            console.log(`[KeyManager] Refreshing key ${id} (Syncing models: YES)`);

            // 1. Validation phase
            // We pass syncModels=true for Google.
            // For Proxy/OpenAI, validateKey lacks baseUrl, so we handle model fetching manually here if valid.
            const result = await this.validateKey(slot.key, slot.provider, true);

            slot.status = result.valid ? 'valid' : 'invalid';
            slot.lastError = result.error || null;

            if (result.valid) {
                slot.disabled = false;
                slot.failCount = 0;
                const resolvedFormat = resolveApiProtocolFormat(slot.format, slot.baseUrl);

                // 2. Model Synchronization Phase
                let newModels: string[] = result.models || [];

                // If validateKey didn't return models (e.g. Proxy/Custom where it needs BaseURL), fetch them now
                if (!newModels.length && slot.baseUrl) {
                    if (resolvedFormat === 'gemini' || slot.provider === 'Google') {
                        // Fallback if validateKey missed it
                        newModels = await fetchGeminiCompatModels(slot.key, slot.baseUrl);
                    } else {
                        // Proxy / OpenAI
                        newModels = await fetchOpenAICompatModels(slot.key, slot.baseUrl);
                    }
                }

                // 3. Update Slot Models (Overwrite logic)
                if (newModels.length > 0) {
                    console.log(`[KeyManager] Sync success for ${id}. Overwriting models.`, {
                        old: slot.supportedModels?.length,
                        new: newModels.length
                    });

                    // Helper to merge if strictly required (e.g. Google defaults),
                    // but fetchGoogleModels already handles whitelisting/defaults.
                    // fetchOpenAICompatModels returns raw list.
                    // normalizeModelList handles deduplication.

                    if (slot.provider === 'Google') {
                        // Google models must remain official only
                        slot.supportedModels = normalizeModelList(newModels, 'Google')
                            .filter((m: string) => isGoogleOfficialModelId(parseModelString(m).id));
                    } else {
                        // For proxies, we just take what they give us (plus normalization)
                        slot.supportedModels = normalizeModelList(newModels, slot.provider);
                    }
                } else {
                    console.warn(`[KeyManager] Refresh valid but no models found for ${id}. Keeping old list.`);
                }
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
            // We do NOT sync models during background revalidateAll to save bandwidth/latency,
            // unless we want to? Users requested "Reflects API capabilities", usually implies explicit action.
            // Let's keep revalidateAll light (connections only).
            // Only manual "refreshKey" does full sync.
            const result = await this.validateKey(slot.key, slot.provider, false);
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
     * 棣冩畬 [New] 閿枫劍鈧椒绗傞繑銉у殠鐠侯垵黏線閻劎绮ㄩ弸?
     * 閻㈤亶鈧倿鍘嗛崳銊ユ躬鐠囬攱鐪扮紒鎾存将閽栧氦黏線閻㈩煉绾撮悽銊ょ艾鐎圭偞妞傛棆瀛樻煀閸忋劑鍣虹痪鑳熅闀勫嫬浠存惔椋庡Ц闀?
     */
    public reportCallResult(id: string, success: boolean, error?: string): void {
        const slot = this.state.slots.find(s => s.id === id);
        if (!slot) return;

        slot.lastUsed = Date.now();

        if (success) {
            slot.failCount = 0;
            slot.successCount++;
            slot.status = 'valid';
            slot.lastError = null;
        } else {
            slot.failCount++;
            slot.lastError = error || 'Unknown error';

            // 闀婎亜濮╃€瑰綊鏁婇槂鏄忕帆閿涙癌顩ч弸婊嗙箾缂侇厼銇戠拹銉︻偧閺佹媽绉存潻鍥鐐肩》绾撮暀鍥鳖唶娑?invalid
            if (slot.failCount >= (this.state.maxFailures || 5)) {
                slot.status = 'invalid';
                console.warn(`[KeyManager] Channel ${slot.name} (${id}) failed repeatedly and was marked invalid.`);
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
    getGlobalModelList(): {
        id: string;
        name: string;
        provider: string;
        providerLabel?: string;
        providerLogo?: string;
        isCustom: boolean;
        isSystemInternal?: boolean;
        type: GlobalModelType;
        icon?: string;
        description?: string;
        tags?: string[];
        tokenGroup?: string;
        billingType?: string;
        endpointType?: string;
        colorStart?: string; // 棣冩畬 [閺傛澘顤僝 缁狅紕鎮婇敾姗€鍘嗙純顔炬畱妫版粏澹?
        colorEnd?: string;
        colorSecondary?: string;
        textColor?: 'white' | 'black';
        creditCost?: number; // 棣冩畬 [閺傛澘顤僝 缁夘垰鍨庡☉鍫ｂ偓?
    }[] {
        // 棣冩畬 娴ｈ法鏁ょ紓鎻跨摠閿涙癌顩ч弸?slots 閸?adminModels 濞屸剝婀侀崣妗﹀閿涘瞼娲块幒銉ㄧ箲閿茬偟绱︾€?
        const activeSlots = this.state.slots.filter(s => !s.disabled && s.status !== 'invalid');
        const slotsHash = `${activeSlots.length}-${activeSlots.map(s => s.id).join(',')}`;

        // 馃殌 [Fix] 娣诲姞 adminModels 鍒扮紦瀛橀敭锛岀‘淇濈鐞嗗憳閰嶇疆鍙樺寲鏃剁紦瀛樺け鏁?
        const adminModels = [...adminModelService.getModels()].sort((left, right) => {
            const modelDiff = String(left.id || '').localeCompare(String(right.id || ''));
            if (modelDiff !== 0) return modelDiff;

            const priorityDiff = Number(right.priority || 0) - Number(left.priority || 0);
            if (priorityDiff !== 0) return priorityDiff;

            const weightDiff = Number(right.weight || 0) - Number(left.weight || 0);
            if (weightDiff !== 0) return weightDiff;

            return String(left.providerId || left.provider || '').localeCompare(
                String(right.providerId || right.provider || '')
            );
        });
        const adminHash = `${adminModels.length}-${adminModels
            .map(m => `${m.id}:${m.providerId || ''}:${m.providerName || ''}:${m.displayName}:${m.priority || 0}:${m.weight || 0}:${m.mixWithSameModel ? '1' : '0'}:${m.colorStart}:${m.colorEnd}:${m.colorSecondary || ''}:${m.textColor || ''}:${m.creditCost}`)
            .join(',')}`;

        // 馃殌 [Fix] 娣诲姞 providers 鍒扮紦瀛橀敭锛岀‘淇濅緵搴斿晢澧炲噺鏃舵ā鍨嬮€夋嫨绔嬪嵆鍝嶅簲
        this.loadProviders();
        const providerHash = `${this.providers.length}-${this.providers
            .map(p => `${p.id}:${p.isActive ? '1' : '0'}:${p.models.length}:${p.updatedAt}`)
            .join(',')}`;
        const combinedHash = `${slotsHash}|${adminHash}|${providerHash}`;

        const now = Date.now();

        if (this.globalModelListCache &&
            this.globalModelListCache.slotsHash === combinedHash &&
            now - this.globalModelListCache.timestamp < this.CACHE_TTL) {
            return this.globalModelListCache.models;
        }

        const uniqueModels = new Map<string, {
            id: string;
            name: string;
            provider: string;
            providerLabel?: string;
            providerLogo?: string;
            isCustom: boolean;
            isSystemInternal?: boolean;
            type: GlobalModelType;
            icon?: string;
            description?: string;
            tags?: string[];
            tokenGroup?: string;
            billingType?: string;
            endpointType?: string;
            colorStart?: string; // 棣冩畬 [閺傛澘顤僝 缁狅紕鎮婇敾姗€鍘嗙純顔炬畱妫版粏澹?
            colorEnd?: string;
            colorSecondary?: string;
            textColor?: 'white' | 'black';
            creditCost?: number; // 棣冩畬 [閺傛澘顤僝 缁夘垰鍨庡☉鍫ｂ偓?
        }>();
        const chatModelIds = new Set(GOOGLE_CHAT_MODELS.map(model => model.id));
        const normalizeUserSourceSignaturePart = (value?: string) =>
            String(value || '').trim().replace(/\/+$/, '').toLowerCase();
        const userSlotSourceSignatures = new Set(
            this.state.slots
                .filter(slot => !slot.disabled && slot.status !== 'invalid' && !!slot.key)
                .map(slot => [
                    normalizeUserSourceSignaturePart(slot.name || slot.proxyConfig?.serverName || slot.provider),
                    normalizeUserSourceSignaturePart(slot.baseUrl),
                    String(slot.key || '').trim(),
                ].join('|'))
                .filter(signature => signature !== '||')
        );

        // 1. Add models from all active keys (Proxies/Custom) - THESE GO FIRST
        this.state.slots.forEach(slot => {
            // 棣冩畬 [Strict Mode] Skip disabled, invalid OR empty key slots
            if (slot.disabled || slot.status === 'invalid' || !slot.key) return;

            if (slot.supportedModels && slot.supportedModels.length > 0) {
                let cleanModels = normalizeModelList(slot.supportedModels, slot.provider);

                cleanModels.forEach(rawModelStr => {
                    const { id, name, description } = parseModelString(rawModelStr);
                    // 鐠哄疇缁烽暈?ID
                    if (id === 'nano-banana' || id === 'nano-banana-pro') return;

                    let distinctId = id;
                    const suffix = slot.name || slot.proxyConfig?.serverName || slot.provider || 'Custom';
                    // 婵″倹鐏夋稉宥嗘Ц鐎规ɑ鏌熼摗鐔烘暁濞撶娀浜鹃敍灞藉繁皤攧璺虹敨閽栧海绱戦梾鏃楊瀲
                    if (slot.provider !== 'Google') {
                        distinctId = buildUserSlotRouteId(id, slot.id || suffix);
                    }

                    if (!uniqueModels.has(distinctId)) {
                        const meta = GOOGLE_MODEL_METADATA.get(id);
                        const registryInfo = (MODEL_REGISTRY as any)[id];
                        const displayProvider = slot.provider === 'Google' ? 'Google' : suffix;

                        uniqueModels.set(distinctId, {
                            id: distinctId,
                            name: name || registryInfo?.name || (meta ? meta.name : id),
                            provider: displayProvider,
                            providerLabel: slot.name || displayProvider,
                            isCustom: false,
                            isSystemInternal: false,
                            type: MODEL_TYPE_MAP.get(id) || inferModelType(id),
                            icon: registryInfo?.icon || meta?.icon,
                            description: description || registryInfo?.description || meta?.description || ''
                        });
                    }
                });
            }
        });

        // 1.5 Add active third-party provider models managed in API settings
        this.providers
            .filter(provider => provider.isActive && provider.apiKey && provider.baseUrl)
            .forEach(provider => {
                const providerSourceSignature = [
                    normalizeUserSourceSignaturePart(provider.name),
                    normalizeUserSourceSignaturePart(provider.baseUrl),
                    String(provider.apiKey || '').trim(),
                ].join('|');

                if (userSlotSourceSignatures.has(providerSourceSignature)) {
                    return;
                }

                const cleanModels = normalizeModelList(provider.models || [], 'Custom');

                cleanModels.forEach(rawModelStr => {
                    const { id, name, description } = parseModelString(rawModelStr);
                    if (!id || id === 'nano-banana' || id === 'nano-banana-pro') return;

                    const distinctId = buildProviderRouteId(id, provider.id || provider.name);
                    if (uniqueModels.has(distinctId)) return;

                    const meta = GOOGLE_MODEL_METADATA.get(id);
                    const registryInfo = (MODEL_REGISTRY as any)[id];
                    const pricingMeta = provider.pricingSnapshot?.modelMeta?.[id]
                        || provider.pricingSnapshot?.modelMeta?.[String(id || '').toLowerCase()]
                        || provider.pricingSnapshot?.rows?.find((row) => String(row?.model || '').trim().toLowerCase() === String(id || '').trim().toLowerCase());

                    uniqueModels.set(distinctId, {
                        id: distinctId,
                        name: name || registryInfo?.name || (meta ? meta.name : id),
                        provider: provider.name,
                        providerLabel: pricingMeta?.providerLabel || pricingMeta?.provider || provider.name,
                        providerLogo: pricingMeta?.providerLogo,
                        isCustom: false,
                        isSystemInternal: false,
                        type: MODEL_TYPE_MAP.get(id) || inferModelType(id),
                        icon: provider.icon || registryInfo?.icon || meta?.icon,
                        description: description || registryInfo?.description || meta?.description || '',
                        tags: Array.isArray(pricingMeta?.tags) ? pricingMeta.tags : undefined,
                        tokenGroup: pricingMeta?.tokenGroup,
                        billingType: pricingMeta?.billingType,
                        endpointType: pricingMeta?.endpointType,
                    });
                });
            });

        // 2. Add Standard Google Models (ONLY if valid keys exist for them)
        const googleSlots = this.state.slots.filter(s => s.provider === 'Google' && !s.disabled && s.status !== 'invalid' && !!s.key);
        if (googleSlots.length > 0) {
            GOOGLE_CHAT_MODELS.forEach(model => {
                // 棣冩畬 [Strict Check] 閸欘亝婀佽ぐ鎾舵暏閹撮娈?Key 绾喖鐤勯弨顖涘瘮鐠囥儲膩閸ㄥ妞傞晸宥嗗潑閿?
                if (!uniqueModels.has(model.id) && this.hasCustomKeyForModel(model.id)) {
                    uniqueModels.set(model.id, {
                        ...model,
                        provider: 'Google',
                        isCustom: false,
                        isSystemInternal: false,
                        type: MODEL_TYPE_MAP.get(model.id) || 'chat'
                    });
                }
            });
        }

        // 3. Add System Internal Models (Built-in 12AI Proxy) - 棣冩畬 [娣囶喗鏁糫 娴?adminModelService 閿风姾娴囩粻锛勬倞閿绘﹢鍘嗙純顔炬畱濡€崇€?
        // adminModels 瀹告彃婀稉濠囨簝婢圭増妲戦悽銊ょ艾缂傛徔鐡ㄩ槍顔款吀缁犳绾答煎瓨甯存担璺ㄦ暏
        // 棣冩畬 [Fix] 鐠虹喕閲滈挅灞肩 model_id 閸戣櫣骞囬晞鍕偧閺佸府绾存稉杞扮瑝閽栧矂鍘嗙純顔炬暁閹存劕鏁稉鈧晞鍕兇缂佺儺D
        const adminModelsByBaseId = new Map<string, typeof adminModels>();
        adminModels.forEach(adminModel => {
            const baseId = String(adminModel.id || '').trim();
            if (!baseId) return;
            if (!adminModelsByBaseId.has(baseId)) {
                adminModelsByBaseId.set(baseId, []);
            }
            adminModelsByBaseId.get(baseId)!.push(adminModel);
        });

        adminModelsByBaseId.forEach((routes, baseId) => {
            const hasMultipleRoutes = routes.length > 1;
            const mixedRoutes = routes.filter((route) => route.mixWithSameModel);
            const shouldExposeMixedOnly = mixedRoutes.length > 1;
            const primaryRoute = shouldExposeMixedOnly
                ? mixedRoutes[mixedRoutes.length - 1]
                : routes[0];
            const modelType = MODEL_TYPE_MAP.get(baseId) || (() => {
                const inferred = inferModelType(baseId);
                return (inferred === 'video' || inferred === 'audio') ? inferred : 'image';
            })();

            if (shouldExposeMixedOnly) {
                const mixedRouteId = `${baseId}@system`;
                if (!uniqueModels.has(mixedRouteId)) {
                    // 使用同组混合路由的统一名称和颜色，优先采用当前组最后一条混合配置。
                    const mixedColorStart = primaryRoute.colorStart || '#475569';
                    const mixedColorEnd = primaryRoute.colorEnd || '#334155';
                    const mixedColorSecondary = primaryRoute.colorSecondary || mixedColorEnd;
                    const mixedTextColor = primaryRoute.textColor || 'white';

                    uniqueModels.set(mixedRouteId, {
                        id: mixedRouteId,
                        name: primaryRoute.displayName || baseId,
                        provider: 'SystemProxy',
                        providerLogo: undefined,
                        providerLabel: 'Mixed Route',
                        isCustom: false,
                        isSystemInternal: true,
                        type: modelType,
                        icon: undefined,
                        description: primaryRoute.advantages || `Mixed routing enabled across ${mixedRoutes.length} matching routes`,
                        colorStart: mixedColorStart,
                        colorEnd: mixedColorEnd,
                        colorSecondary: mixedColorSecondary,
                        textColor: mixedTextColor,
                        creditCost: primaryRoute.creditCost,
                    });
                }

                // 🚀 [Fix] 只移除系统内部的同 baseId 路由，保留用户/供应商自定义条目
                for (const [modelId, modelData] of uniqueModels.entries()) {
                    const modelBaseId = String(modelData.id || '').split('@')[0];
                    const isSameBaseModel = modelBaseId === baseId;
                    const isOtherSystemRoute = modelData.isSystemInternal === true && modelData.id !== mixedRouteId;

                    if (isSameBaseModel && isOtherSystemRoute) {
                        uniqueModels.delete(modelId);
                    }
                }

                return;
            }

            routes.forEach((adminModel, index) => {
                const systemId = hasMultipleRoutes
                    ? buildStableSystemRouteId(baseId, adminModel.providerId, index + 1)
                    : `${baseId}@system`;

                if (!uniqueModels.has(systemId)) {
                    const routeProviderLabel = adminModel.providerName || adminModel.providerId || adminModel.provider || 'SystemProxy';

                    uniqueModels.set(systemId, {
                        id: systemId,
                        name: adminModel.displayName || adminModel.id,
                        provider: routeProviderLabel,
                        providerLabel: routeProviderLabel,
                        isCustom: false,
                        isSystemInternal: true,
                        type: modelType,
                        icon: undefined,
                        description: adminModel.advantages || 'System credit model route',
                        colorStart: adminModel.colorStart,
                        colorEnd: adminModel.colorEnd,
                        colorSecondary: adminModel.colorSecondary,
                        textColor: adminModel.textColor,
                        creditCost: adminModel.creditCost,
                    });
                }
            });
        });

        const result = Array.from(uniqueModels.values()).map((model) => {
            const baseId = String(model.id || '').split('@')[0];
            const relatedAdminRoutes = adminModelsByBaseId.get(baseId) || [];
            const isMixedRoute = model.provider === 'SystemProxy' && model.id === `${baseId}@system` && relatedAdminRoutes.length > 1;

            if (!isMixedRoute) {
                return model;
            }

            return {
                ...model,
                name: (relatedAdminRoutes.filter((route) => route.mixWithSameModel).slice(-1)[0]?.displayName)
                    || relatedAdminRoutes[0]?.displayName
                    || baseId,
                providerLabel: 'Mixed Route',
                description: (relatedAdminRoutes.filter((route) => route.mixWithSameModel).slice(-1)[0]?.advantages)
                    || relatedAdminRoutes[0]?.advantages
                    || `Mixed routing enabled across ${relatedAdminRoutes.length} matching routes`,
            };
        });

        // Refresh cache
        this.globalModelListCache = {
            models: result,
            slotsHash: combinedHash,
            timestamp: Date.now()
        };

        console.log('[keyManager.getGlobalModelList] Final model count:', result.length);
        return result;
    }

    /**
     * Get all key slots
     */
    getSlots(): KeySlot[] {
        return [...this.state.slots];
    }

    private buildChannelCapabilities(models: string[], pricingSupport: ChannelConfig['pricingSupport'], managementSupport: ChannelConfig['managementSupport']) {
        const normalizedModels = Array.isArray(models) ? models : [];
        const hasWildcard = normalizedModels.includes('*');
        const categorized = categorizeModels(normalizedModels.map((item) => parseModelString(item).id));
        const lowerModels = normalizedModels.map((item) => parseModelString(item).id.toLowerCase());

        return {
            chat: hasWildcard || categorized.chatModels.length > 0 || normalizedModels.length === 0,
            image: hasWildcard || categorized.imageModels.length > 0,
            video: hasWildcard || categorized.videoModels.length > 0,
            audio: hasWildcard || lowerModels.some((model) => /audio|tts|suno|lyria|minimax-t2a/i.test(model)),
            modelDiscovery: true,
            pricingDiscovery: pricingSupport === 'native',
            managementApi: managementSupport === 'native',
        };
    }

    private buildSlotChannelConfig(slot: KeySlot): ChannelConfig {
        const runtime = resolveProviderRuntime({
            provider: slot.provider,
            baseUrl: slot.baseUrl || GOOGLE_API_BASE,
            format: slot.format,
            authMethod: slot.authMethod,
            headerName: slot.headerName,
            compatibilityMode: slot.compatibilityMode,
        });
        const pricingSupport = runtime.pricingSupport === 'native' ? 'native' : runtime.pricingSupport === 'manual' ? 'manual' : 'none';
        const managementSupport = runtime.managementSupport === 'native' ? 'native' : runtime.managementSupport === 'external' ? 'external' : 'none';

        return {
            id: slot.id,
            name: slot.name || slot.provider || 'Unnamed Channel',
            baseUrl: slot.baseUrl || GOOGLE_API_BASE,
            apiKey: slot.key,
            provider: slot.provider,
            providerFamily: runtime.providerFamily,
            protocolHint: normalizeApiProtocolFormat(slot.format, runtime.resolvedFormat),
            authProfile: {
                authMethod: slot.authMethod || (runtime.authMethod as AuthMethod),
                headerName: slot.headerName || runtime.headerName,
                authorizationValueFormat: runtime.authorizationValueFormat,
            },
            capabilities: this.buildChannelCapabilities(slot.supportedModels || [], pricingSupport, managementSupport),
            pricingSupport,
            managementSupport,
            supportedModels: normalizeModelList(slot.supportedModels || [], slot.provider),
            group: slot.group,
            compatibilityMode: slot.compatibilityMode,
            source: slot.provider === 'SystemProxy' ? 'system' : 'user-slot',
        };
    }

    private buildProviderChannelConfig(provider: ThirdPartyProvider): ChannelConfig {
        const runtime = resolveProviderRuntime({
            provider: provider.name,
            baseUrl: provider.baseUrl,
            format: provider.format,
        });
        const pricingSupport = runtime.pricingSupport === 'native' ? 'native' : runtime.pricingSupport === 'manual' ? 'manual' : 'none';
        const managementSupport = runtime.managementSupport === 'native' ? 'native' : runtime.managementSupport === 'external' ? 'external' : 'none';

        return {
            id: provider.id,
            name: provider.name,
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            provider: runtime.uiProvider,
            providerFamily: runtime.providerFamily,
            protocolHint: normalizeApiProtocolFormat(provider.format, runtime.resolvedFormat),
            authProfile: {
                authMethod: runtime.authMethod as AuthMethod,
                headerName: runtime.headerName,
                authorizationValueFormat: runtime.authorizationValueFormat,
            },
            capabilities: this.buildChannelCapabilities(provider.models || [], pricingSupport, managementSupport),
            pricingSupport,
            managementSupport,
            supportedModels: normalizeModelList(provider.models || [], runtime.uiProvider),
            group: provider.group,
            compatibilityMode: runtime.compatibilityMode,
            source: 'provider',
        };
    }

    getChannelConfigs(options?: { includeDisabled?: boolean; includeProviders?: boolean }): ChannelConfig[] {
        const includeDisabled = options?.includeDisabled ?? true;
        const includeProviders = options?.includeProviders ?? true;
        const slotChannels = this.state.slots
            .filter((slot) => includeDisabled || !slot.disabled)
            .map((slot) => this.buildSlotChannelConfig(slot));

        if (!includeProviders) {
            return slotChannels;
        }

        this.loadProviders();
        const providerChannels = this.providers
            .filter((provider) => includeDisabled || provider.isActive)
            .map((provider) => this.buildProviderChannelConfig(provider));

        return [...slotChannels, ...providerChannels];
    }

    getChannelConfig(id: string): ChannelConfig | undefined {
        const slot = this.state.slots.find((item) => item.id === id);
        if (slot) {
            return this.buildSlotChannelConfig(slot);
        }

        this.loadProviders();
        const provider = this.providers.find((item) => item.id === id);
        return provider ? this.buildProviderChannelConfig(provider) : undefined;
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
     * 棣冩畬 [閺傛澘濮涢懗绲?濡偓闀嗐儲妲搁挅锕€鐡ㄩ崷銊ф暏閹寸柉鍤滅€规阿绠熼晞鍕箒閺佸牏娈?API Key 閺€顖涘瘮鐠囥儲膩閸?
     * 娑撳秴瀵橉ò绢剛閮寸紒鐔峰敶缂冾喚娈戦敺銊︹偓?PROXY 鐎靛棝鎸?
     */
    hasCustomKeyForModel(modelIdFull: string): boolean {
        const parts = (modelIdFull || '').split('@');
        const normalizedModelId = parts[0].toLowerCase().trim();
        const suffix = parts.length > 1 ? parts[1].toLowerCase().trim() : null;

        // 棣冩畬 [闀欑缁╂穱顔碱槻] 婵″倹鐏夊畞锔芥箒 @system/@system_2/@12ai/@systemproxy 閽栧海绱戦敍宀冾嚛閺勫孩妲稿铏圭拨鐎规氨閮寸紒鐔哄殠鐠侯垬鈧?
        // 鏉欘潚皎睄鍛枌娑撳绾寸紒婵呯瑝鎼存棁顕氶崠褰掑巻皤攧鎵暏閹寸柉鍤滅€规阿绠熼晞鍕堥弬?Key 闃冩槒绶妴?
        if (suffix?.startsWith('system') || suffix === '12ai' || suffix === 'systemproxy') {
            return false;
        }

        const hasValidSlot = this.state.slots.some(s => {
            if (s.disabled || s.status === 'invalid') return false;
            // Budget check: if budget is set and exhausted, it's effectively invalid
            if (s.budgetLimit > 0 && s.totalCost >= s.budgetLimit) return false;

            // Scenario 1: Exact model support in supportedModels array (or wildcard)
            const supported = s.supportedModels || [];
            if (supported.includes('*') || supported.includes(normalizedModelId)) return true;

            // Scenario 2: If model was selected with a provider suffix (e.g. @MyChannel)
            if (suffix) {
                if (matchesSlotRouteSuffix(s, suffix)) {
                    return true;
                }
            }

            return false;
        });

        if (hasValidSlot) return true;

        // 馃殌 [Fix] 涔熻妫€鏌?ThirdPartyProvider锛屽洜涓虹敤鎴峰湪璁剧疆閲屾坊鍔犵殑鑷畾涔?API 瀛樺湪浜?providers 涓?
        this.loadProviders();
        return this.providers.some(p => {
            if (!p.isActive) return false;

            // Check if model matches asterisk or specifically supported
            if (p.models.includes('*') || p.models.includes(normalizedModelId)) return true;

            // Check if suffix matches provider name
            if (suffix) {
                if (matchesProviderRouteSuffix(p, suffix)) return true;
            }

            return false;
        });
    }

    /**
     * Set max failures threshold
     */
    setMaxFailures(count: number): void {
        this.state.maxFailures = Math.max(1, count);
        this.saveState();
    }

    // =========================================================================
    // 棣冨晭 缁楊兛绗侀弬?API 閾惧秴濮熼崯鍡欘吀閻炲棙鏌熷▔?
    // =========================================================================

    private providers: ThirdPartyProvider[] = [];

    /**
     * 閵嘲褰囬晸鈧摼澶岊儑娑撳鏌熼摼宥呭閸?
     */
    getProviders(): ThirdPartyProvider[] {
        this.loadProviders();
        return [...this.providers];
    }

    /**
     * 閵嘲褰囬崡鏇氶嚋閾惧秴濮熼崯?
     */
    getProvider(id: string): ThirdPartyProvider | undefined {
        this.loadProviders();
        return this.providers.find(p => p.id === id);
    }

    getProviderForKeySlot(slotOrId: string | KeySlot): ThirdPartyProvider | undefined {
        this.loadProviders();

        if (typeof slotOrId === 'string') {
            const directProvider = this.providers.find((provider) => provider.id === slotOrId);
            if (directProvider) return directProvider;

            const slot = this.state.slots.find((entry) => entry.id === slotOrId);
            return slot ? this.findLinkedProviderForSlot(slot) || undefined : undefined;
        }

        return this.findLinkedProviderForSlot(slotOrId) || undefined;
    }

    /**
     * 濞ｈ濮為弬鎵畱缁楊兛绗侀弬瑙勬箛閿封€虫櫌
     */
    addProvider(config: Omit<ThirdPartyProvider, 'id' | 'usage' | 'status' | 'createdAt' | 'updatedAt'>): ThirdPartyProvider {
        this.loadProviders();

        const now = Date.now();
        const provider: ThirdPartyProvider = {
            ...config,
            format: normalizeApiProtocolFormat(config.format, 'auto'),
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
        this.syncLegacySlotsWithProvider(provider);
        this.globalModelListCache = null; // 馃殌 [Fix] 娓呴櫎妯″瀷缂撳瓨锛屼娇涓嬫媺妗嗙珛鍗冲埛鏂?
        this.notifyListeners();

        if (!provider.pricingSnapshot) {
            this.syncProviderPricing(provider.id);
        }

        return provider;
    }

    /**
     * 鏃嬪瓨鏌婇摼宥呭閸熷棝鍘嗙純?
     */
    updateProvider(id: string, updates: Partial<Omit<ThirdPartyProvider, 'id' | 'createdAt'>>): boolean {
        this.loadProviders();

        const index = this.providers.findIndex(p => p.id === id);
        if (index === -1) return false;

        const previousProvider = { ...this.providers[index] };

        this.providers[index] = {
            ...this.providers[index],
            ...updates,
            format: normalizeApiProtocolFormat(updates.format ?? this.providers[index].format, 'auto'),
            updatedAt: Date.now()
        };

        this.saveProviders();
        this.syncLegacySlotsWithProvider(this.providers[index], previousProvider);
        this.globalModelListCache = null; // 馃殌 [Fix] 娓呴櫎妯″瀷缂撳瓨锛屼娇涓嬫媺妗嗙珛鍗冲埛鏂?
        this.notifyListeners();

        if ((updates.baseUrl !== undefined || updates.apiKey !== undefined || updates.format !== undefined) && !updates.pricingSnapshot) {
            this.syncProviderPricing(id);
        }

        return true;
    }

    private syncLegacySlotsWithProvider(
        provider: ThirdPartyProvider,
        previousProvider?: Partial<ThirdPartyProvider>
    ): void {
        const candidateProviders = [provider, previousProvider]
            .filter((item): item is Partial<ThirdPartyProvider> => !!item && !!item.baseUrl)
            .map((item) => ({
                baseUrl: normalizeProviderLinkValue(item.baseUrl),
                apiKey: String(item.apiKey || '').trim(),
                name: normalizeProviderLinkValue(item.name),
            }))
            .filter((item) => !!item.baseUrl);

        if (candidateProviders.length === 0) return;

        const matchedSlots = this.state.slots.filter((slot) => {
            const slotBaseUrl = normalizeProviderLinkValue(slot.baseUrl);
            if (!slotBaseUrl) return false;

            return candidateProviders.some((candidate) => {
                if (slotBaseUrl !== candidate.baseUrl) return false;

                const slotKey = String(slot.key || '').trim();
                const slotName = normalizeProviderLinkValue(slot.name);

                if (candidate.apiKey && slotKey && slotKey === candidate.apiKey) return true;
                if (candidate.name && slotName && slotName === candidate.name) return true;
                return false;
            });
        });

        if (matchedSlots.length === 0) {
            const currentBaseUrl = normalizeProviderLinkValue(provider.baseUrl);
            if (currentBaseUrl) {
                const sameBaseUrlSlots = this.state.slots.filter((slot) => normalizeProviderLinkValue(slot.baseUrl) === currentBaseUrl);
                if (sameBaseUrlSlots.length === 1) {
                    matchedSlots.push(sameBaseUrlSlots[0]);
                }
            }
        }

        if (matchedSlots.length === 0) return;

        matchedSlots.forEach((slot) => {
            slot.key = String(provider.apiKey || '').trim();
            slot.name = provider.name;
            slot.baseUrl = provider.baseUrl;
            slot.group = provider.group;
            slot.disabled = !provider.isActive;
            slot.format = normalizeApiProtocolFormat(provider.format, slot.format || 'auto');
            if (provider.models?.length) {
                slot.supportedModels = normalizeModelList(provider.models, slot.provider);
            }
            slot.type = determineKeyType(slot.provider, slot.baseUrl);

            const runtime = resolveProviderRuntime({
                provider: slot.provider,
                baseUrl: slot.baseUrl,
                format: slot.format,
                authMethod: slot.authMethod,
                headerName: slot.headerName,
                compatibilityMode: slot.compatibilityMode,
            });

            slot.authMethod = runtime.authMethod as AuthMethod;
            slot.headerName = runtime.headerName;
            slot.compatibilityMode = runtime.compatibilityMode;
            slot.updatedAt = Date.now();
        });

        this.saveState();
        console.log(
            `[KeyManager] Synced ${matchedSlots.length} legacy slot(s) from provider ${provider.name}: ${matchedSlots.map((slot) => `${slot.name}[${slot.id}]`).join(', ')}`
        );
    }

    private findLinkedProviderForSlot(slot: KeySlot): ThirdPartyProvider | null {
        const slotBaseUrl = normalizeProviderLinkValue(slot.baseUrl);
        if (!slotBaseUrl) return null;

        const sameBaseProviders = this.providers.filter((provider) => {
            if (!provider.isActive) return false;
            return normalizeProviderLinkValue(provider.baseUrl) === slotBaseUrl;
        });

        if (sameBaseProviders.length === 0) return null;
        if (sameBaseProviders.length === 1) return sameBaseProviders[0];

        const slotName = normalizeProviderLinkValue(slot.name);
        const slotKey = String(slot.key || '').trim();

        return sameBaseProviders.find((provider) => {
            const providerName = normalizeProviderLinkValue(provider.name);
            const providerKey = String(provider.apiKey || '').trim();
            return (slotName && slotName === providerName) || (slotKey && slotKey === providerKey);
        }) || null;
    }

    private buildEffectiveSlotFromProvider(slot: KeySlot, provider: ThirdPartyProvider): KeySlot {
        const format = normalizeApiProtocolFormat(provider.format, slot.format || 'auto');
        const runtime = resolveProviderRuntime({
            provider: slot.provider,
            baseUrl: provider.baseUrl,
            format,
            authMethod: slot.authMethod,
            headerName: slot.headerName,
            compatibilityMode: slot.compatibilityMode,
        });

        return {
            ...slot,
            key: String(provider.apiKey || '').trim(),
            name: provider.name || slot.name,
            baseUrl: provider.baseUrl || slot.baseUrl,
            group: provider.group,
            disabled: !provider.isActive,
            format,
            supportedModels: provider.models?.length
                ? normalizeModelList(provider.models, slot.provider)
                : slot.supportedModels,
            type: determineKeyType(slot.provider, provider.baseUrl || slot.baseUrl),
            authMethod: runtime.authMethod as AuthMethod,
            headerName: runtime.headerName,
            compatibilityMode: runtime.compatibilityMode,
        };
    }

    /**
     * 皤攧鐘绘珟閾惧秴濮熼崯?
     */
    removeProvider(id: string): boolean {
        this.loadProviders();

        const index = this.providers.findIndex(p => p.id === id);
        if (index === -1) return false;

        this.providers.splice(index, 1);
        this.saveProviders();
        this.globalModelListCache = null; // 馃殌 [Fix] 娓呴櫎妯″瀷缂撳瓨锛屼娇涓嬫媺妗嗙珛鍗冲埛鏂?
        this.notifyListeners();
        return true;
    }

    /**
     * 鐠佹澘缍嶉摼宥呭閸熷棔濞囬悽銊╁櫤
     */
    addProviderUsage(providerId: string, tokens: number, cost: number): void {
        this.loadProviders();

        const provider = this.providers.find(p => p.id === providerId);
        if (!provider) return;

        // 濡偓闀嗐儲妲搁挅锕傛付鐟曚線鍚ㄧ純顔界柈闀炪儴顓搁弫甯焊濮ｅ繐銇?0 闀ｅ綊鍚ㄧ純顕嗙骇
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
     * 閵嘲褰囬摼宥呭閸熷棛绮虹拋鈥蹭繆闀?
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
     * 浠庨璁惧垱寤烘湇鍔″晢
     */
    createProviderFromPreset(presetKey: string, apiKey: string, customModels?: string[]): ThirdPartyProvider | null {
        const preset = PROVIDER_PRESETS[presetKey];
        if (!preset) return null;

        const provider = this.addProvider({
            name: preset.name,
            baseUrl: preset.baseUrl,
            apiKey,
            models: customModels || preset.models,
            format: preset.format,
            icon: preset.icon,
            isActive: true
        });

        // 鑷姩鎷夊彇瀹氫环
        this.syncProviderPricing(provider.id);

        return provider;
    }

    /**
     * 鑷姩浠庝緵搴斿晢鐨?/api/pricing 鎺ュ彛鎷夊彇浠锋牸琛ㄥ苟淇濆瓨蹇収
     */
    async syncProviderPricing(providerId: string): Promise<boolean> {
        this.loadProviders();
        const provider = this.providers.find(p => p.id === providerId);
        if (!provider || !provider.baseUrl) return false;

        try {
            const result = await fetchRawPricingCatalog(
                provider.baseUrl,
                provider.apiKey,
                normalizeApiProtocolFormat(provider.format, 'auto')
            );

            if (!result?.pricingData?.length) {
                console.warn(`[KeyManager] Pricing API not available for ${provider.name}`);
                return false;
            }

            console.log(`[KeyManager] Syncing pricing for ${provider.name} from ${result.endpointUrl}...`);

            const fetchedSnapshot = buildProviderPricingSnapshot(result.pricingData, result.groupRatio, {
                fetchedAt: Date.now(),
                note: `Synced from ${result.endpointUrl}`,
            });

            provider.pricingSnapshot = mergeProviderPricingSnapshot(fetchedSnapshot, provider.pricingSnapshot);

            this.saveProviders();
            this.notifyListeners();
            console.log(`[KeyManager] Successfully synced pricing for ${provider.name}. Models found: ${result.pricingData.length}`);
            return true;
        } catch (e) {
            console.warn(`[KeyManager] Failed or timed out syncing pricing for ${provider.name}:`, e);
            return false;
        }
    }

    /**
     * 閿风姾娴囬摼宥呭閸熷棗鍨悰?
     */
    private loadProviders(): void {
        if (this.providers.length > 0) return; // Already loaded

        try {
            const stored = localStorage.getItem(PROVIDERS_STORAGE_KEY);
            if (stored) {
                this.providers = JSON.parse(stored).map((provider: ThirdPartyProvider) => ({
                    ...provider,
                    format: normalizeApiProtocolFormat((provider as any).format, 'auto'),
                }));
            }
        } catch (e) {
            console.error('[KeyManager] Failed to load providers:', e);
            this.providers = [];
        }
    }

    /**
     * 娣囸８ｇ摠閾惧秴濮熼崯鍡楀灙鐞?
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
// Force Vite HMR Cache Invalidation: 2026-03-02-03-05

export default keyManager;

// ============================================================================
// 棣冨晭 闀婎亜濮╁Ο鈥崇€峰Λ鈧ù瀚旀嫲闁板矕鐤嗛敺鐔诲厴
// ============================================================================

/**
 * 濡偓濞村PI缁鐎?
 */
export function detectApiType(apiKey: string, baseUrl?: string): 'google-official' | 'openai' | 'proxy' | 'unknown' {
    // Google鐎规ɑ鏌烝PI
    if (apiKey.startsWith('AIza') || baseUrl?.includes('googleapis.com') || baseUrl?.includes('generativelanguage.googleapis.com')) {
        return 'google-official';
    }

    // OpenAI鐎规ɑ鏌烝PI
    if (apiKey.startsWith('sk-') && (!baseUrl || baseUrl.includes('api.openai.com'))) {
        return 'openai';
    }

    // 缁楊兛绗侀弬閫涘敩閻炲棴绾窷ewAPI/One API缁涘绾?
    if (baseUrl && !baseUrl.includes('googleapis.com') && baseUrl.length > 0) {
        return 'proxy';
    }

    return 'unknown';
}

/**
 * Fetch available Google models using the official models endpoint.
 */
export async function fetchGoogleModels(apiKey: string): Promise<string[]> {
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );

        if (!response.ok) {
            console.error('[KeyManager] Failed to fetch Google models:', response.status);
            const responseText = await response.text().catch(() => '');
            const failure = classifyApiFailure({
                status: response.status,
                responseText,
                fallbackMessage: `HTTP ${response.status}`
            });
            throw new Error(buildUserFacingApiErrorMessage(failure));
        }

        const data = await response.json();

        const models = data.models
            ?.map((m: any) => m.name.replace('models/', ''))
            .filter((rawModel: string) => {
                const modelId = rawModel.replace(/^models\//, '');
                const lower = modelId.toLowerCase();

                if (lower.includes('embedding') ||
                    lower.includes('audio') ||
                    lower.includes('robotics') ||
                    lower.includes('code-execution') ||
                    lower.includes('computer-use') ||
                    lower.includes('aqa')) {
                    return false;
                }

                if (lower.includes('tts')) return false;

                const allowedPatterns = [
                    ...GOOGLE_IMAGE_WHITELIST.map((id) => new RegExp(`^${id}$`)),
                    /^veo-3\.1-generate-preview$/,
                    /^veo-3\.1-fast-generate-preview$/,
                    /^gemini-2\.5-(flash|pro|flash-lite)$/,
                    /^gemini-3-(pro|flash)-preview$/,
                ];

                return allowedPatterns.some((pattern) => pattern.test(modelId));
            }) || [];

        console.log(`[KeyManager] Strict whitelist kept ${models.length} models:`, models);

        const finalModels = Array.from(new Set([
            ...DEFAULT_GOOGLE_MODELS,
            ...models
        ]));

        console.log('[KeyManager] Merged Google model list:', finalModels);
        return finalModels;
    } catch (error) {
        console.error('[KeyManager] Error fetching Google models:', error);
        const failure = classifyApiFailure({
            error,
            fallbackMessage: error instanceof Error ? error.message : 'Google models request failed'
        });
        throw new Error(buildUserFacingApiErrorMessage(failure));
    }
}

// 姒涙か顓籊oogle濡€崇€佛珨勬銆?婢跺洭鈧鏌熷?
function getDefaultGoogleModels(): string[] {
    return DEFAULT_GOOGLE_MODELS;
}

export async function fetchGeminiCompatModels(apiKey: string, baseUrl?: string): Promise<string[]> {
    const lowerBase = String(baseUrl || '').toLowerCase();
    if (!baseUrl || lowerBase.includes('googleapis.com') || lowerBase.includes('generativelanguage.googleapis.com')) {
        return fetchGoogleModels(apiKey);
    }

    try {
        const runtime = resolveProviderRuntime({
            baseUrl,
            format: 'gemini',
        });
        const authMethod = runtime.authMethod as AuthMethod;
        const response = await fetch(buildGeminiModelsEndpoint(baseUrl, apiKey, authMethod), {
            headers: buildGeminiHeaders(authMethod, apiKey, runtime.headerName, runtime.authorizationValueFormat)
        });

        if (!response.ok) {
            console.error('[KeyManager] Failed to fetch Gemini-compatible models:', response.status, response.statusText);
            const responseText = await response.text().catch(() => '');
            const failure = classifyApiFailure({
                status: response.status,
                responseText,
                fallbackMessage: `HTTP ${response.status}`
            });
            if (response.status === 404) {
                return [];
            }
            throw new Error(buildUserFacingApiErrorMessage(failure));
        }
        const data = await response.json();
        const rawModels: any[] = data.models || data.data || [];
        return Array.from(
            new Set(
                rawModels
                    .map((model: any) => String(model?.name || model?.id || model?.model || '').replace(/^models\//i, '').trim())
                    .filter(Boolean)
            )
        );
    } catch (error) {
        console.error('[KeyManager] Error fetching Gemini-compatible models:', error);
        const failure = classifyApiFailure({
            error,
            fallbackMessage: error instanceof Error ? error.message : 'Gemini-compatible models request failed'
        });
        throw new Error(buildUserFacingApiErrorMessage(failure));
    }
}

/**
 * 闀婎亜濮╅姰宄板絿OpenAI閸忕厧顔怉PI闀勫嫭膩閸ㄥ珨鍨悰?
 * 棣冩畬 [Enhancement] 闀婎亜濮╅摗濠氬惃閿涙氨些闂勩倕寮弫鏉挎倵缂傗偓閿涘苯褰ф穱婵堟殌閸烆垯绔撮晞鍕唨绾偓濡€崇€?
 */
export async function fetchOpenAICompatModels(apiKey: string, baseUrl: string): Promise<string[]> {
    try {
        const runtime = resolveProviderRuntime({
            baseUrl,
            format: 'openai',
        });
        const response = await fetch(buildOpenAIEndpoint(baseUrl, 'models'), {
            headers: buildProxyHeaders(runtime.authMethod as AuthMethod, apiKey, runtime.headerName, undefined, runtime.authorizationValueFormat)
        });

        if (!response.ok) {
            console.error('[KeyManager] Failed to fetch proxy models:', response.status, response.statusText);
            if (response.status === 401) {
                throw new Error('认证失败（401）：API Key 无效、已过期，或缺少访问权限。');
            }
            if (response.status === 403) {
                throw new Error('权限不足（403）：当前 API Key 无权访问模型列表接口。');
            }
            if (response.status === 404) {
                console.warn('[KeyManager] Provider does not expose /v1/models, returning an empty model list.');
                return [];
            }
            throw new Error(`获取模型列表失败（${response.status}）：${response.statusText || '请检查接口地址和 API Key。'}`);
        }

        const data = await response.json();
        const rawModels: any[] = data.data || [];

        console.log('[KeyManager] /v1/models response:', { count: rawModels.length, firstModel: rawModels.length > 0 ? rawModels[0]?.id || rawModels[0] : null, dataType: typeof data.data, hasObjectField: !!data.object });

        // 閾″鍚ㄧ粵鏍瑎╅敍?
        // - 皤攧鍛滈哺閻?鐠愩劑鍣?濮ｆ柧绶ラ挅搴ｇ磻鐟欏棔璐熼挰婊冨棘閺佹澘鐎烽挅搴ｇ磻閽８ｈ嫙榭旀ˇ褰?
        // - 韫囶偊鈧?閹便垽鈧?fast/slow)鐟欏棔璐熼挰婊嗗厴閿锋稑鐎烽挅搴ｇ磻閽８ｈ嫙娣囨繄鏆€
        const rawSet = new Set(rawModels.map(m => m.id));
        const deduped = new Map<string, string>(); // canonical -> chosen model string

        rawModels.forEach(m => {
            const modelId = m.id;
            const modelName = m.name || m.title || m.display_name || '';
            const modelProvider = m.owned_by || m.provider || '';

            const parsed = parseModelVariantMeta(modelId);
            const canonical = parsed.canonicalId || modelId;

            let formattedModel = modelId;
            if (modelName || modelProvider) {
                formattedModel = `${modelId}|${modelName}|${modelProvider}`;
            }

            // If canonical exists in provider response, prefer canonical (parameterized variants can be selected by UI options)
            if (rawSet.has(canonical)) {
                let formattedCanonical = canonical;
                const canonicalObj = rawModels.find(obj => obj.id === canonical);
                if (canonicalObj) {
                    const cName = canonicalObj.name || canonicalObj.title || canonicalObj.display_name || '';
                    const cProvider = canonicalObj.owned_by || canonicalObj.provider || '';
                    if (cName || cProvider) {
                        formattedCanonical = `${canonical}|${cName}|${cProvider}`;
                    }
                }
                deduped.set(canonical, formattedCanonical);
                return;
            }

            // Otherwise keep first concrete model id to avoid producing unsupported synthetic IDs
            if (!deduped.has(canonical)) {
                deduped.set(canonical, formattedModel);
            }
        });

        const result = Array.from(new Set(deduped.values()));
        console.log(`[KeyManager] Deduplicated down to ${result.length} unique models:`, result);
        return result;
    } catch (error) {
        console.error('[KeyManager] Error fetching proxy models:', error);
        return [];
    }
}

/**
 * 闀婎亜濮珨勫棛琚Ο鈥崇€?- 婢х偛宸遍悧?
 * 闀屽绱崗鍫㈤獓皤攧鍡欒: 閿叉儳鍎?閳?鐟欏棝顣?閳?闀靛﹤銇?閳?閸忔湹绮?
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

        // 娴兼ˇ鍘涚痪?: 鐟欏棝顣跺Ο鈥崇€?
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
        // 娴兼ˇ鍘涚痪?: 閿叉儳鍎氬Ο鈥崇€?
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
        // 娴兼ˇ鍘涚痪?: 闀靛﹤銇夊Ο鈥崇€?
        else if (lowerModel.includes('gemini') ||
            lowerModel.includes('gpt') ||
            lowerModel.includes('claude') ||
            lowerModel.includes('chat')) {
            categories.chatModels.push(model);
        }
        // 閸忔湹绮? 閾绢亜鍨庣猾缁樐侀崹?
        else {
            categories.otherModels.push(model);
        }
    });

    return categories;
}

/**
 * 闀婎亜濮╁Λ鈧ù瀚旇嫙闁板矕鐤咥PI闀勫嫭澧嶉摼澶嬆侀崹?
 */
export async function autoDetectAndConfigureModels(
    apiKey: string,
    baseUrl?: string,
    preferredFormat?: ApiProtocolFormat
): Promise<{
    success: boolean;
    models: string[];
    categories: ReturnType<typeof categorizeModels>;
    apiType: string;
}> {
    const apiType = detectApiType(apiKey, baseUrl);
    const resolvedFormat = resolveApiProtocolFormat(
        preferredFormat,
        baseUrl,
        apiType === 'google-official' ? 'gemini' : 'openai'
    );
    console.log('[KeyManager] 濡偓濞村珨鍩孉PI缁鐎?', apiType);

    let models: string[] = [];
    const runtime = resolveProviderRuntime({
        baseUrl,
        format: resolvedFormat === 'gemini' ? 'gemini' : preferredFormat,
    });

    if (runtime.strategyId === 'wuyinkeji' && baseUrl) {
        const catalog = selectWuyinCatalogModels(baseUrl, await fetchWuyinPricingCatalog(baseUrl));
        models = catalog.map((item) => item.modelId).filter(Boolean);
    } else if (resolvedFormat === 'gemini') {
        models = await fetchGeminiCompatModels(apiKey, baseUrl);
    } else if (apiType === 'google-official') {
        models = await fetchGoogleModels(apiKey);
    } else if (apiType === 'proxy' && baseUrl) {
        models = await fetchOpenAICompatModels(apiKey, baseUrl);
    } else if (apiType === 'openai') {
        // OpenAI鐎规ɑ鏌熼敍灞煎▏閻劌鍑￠惌銉δ侀崹瀚斿灙鐞?
        models = ['dall-e-3', 'dall-e-2', 'gpt-4o', 'gpt-4o-mini'];
    }

    // 鎼存棗鏁ゅΟ鈥崇€烽暀鈩冾劀
    const normalizedModels = normalizeModelList(models, resolvedFormat === 'gemini' ? 'Google' : 'Proxy');

    const categories = categorizeModels(normalizedModels);

    return {
        success: normalizedModels.length > 0,
        models: normalizedModels,
        categories,
        apiType: preferredFormat && preferredFormat !== 'auto' ? preferredFormat : apiType
    };
}

// Re-export ProxyModelConfig for convenience





