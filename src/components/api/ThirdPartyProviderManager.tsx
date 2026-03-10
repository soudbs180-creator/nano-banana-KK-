/**
 * Third-Party Provider Manager (Enhanced with Management API)
 * 
 * 支持完整的 NewAPI / OneAPI 管理接口功能：
 * - 渠道管理（更新余额、获取渠道列表）
 * - 供应商管理（获取、更新、搜索）
 * - 分组管理（获取所有分组、倍率配置）
 * - 令牌管理（使用情况、消费统计）
 * - 模型管理（获取元数据、定价信息）
 */

import React, { useState, useEffect } from 'react';
import { 
    Plus, Settings, Trash2, Edit3, RefreshCw, 
    ChevronDown, ChevronUp, Server, Globe, 
    DollarSign, Sparkles, CheckCircle, AlertCircle,
    Copy, ExternalLink, Lock, Wallet, TrendingUp,
    BarChart3, Search, Database, CreditCard,
    Activity, Zap, Layers, Key, Tag,
    Info, AlertTriangle, X, Cpu, Coins
} from 'lucide-react';
import { fetchProviderPricing, fetchProviderModels, ModelPricingInfo } from '../../services/billing/newApiPricingService';
import { 
    NewApiManagementService, 
    Channel, Supplier, Group, TokenUsage, 
    ModelMetadata, PricingConfig, RateConfig,
    formatQuota, formatPrice, getChannelTypeName
} from '../../services/billing/newApiManagementService';
import { notify } from '../../services/system/notificationService';

// Preset providers
export const PRESET_PROVIDERS = [
    {
        id: 'openai',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com',
        apiFormat: 'openai' as const,
        description: 'OpenAI 官方 API',
        icon: 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons-static@latest/icons/openai.svg'
    },
    {
        id: 'anthropic',
        name: 'Anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiFormat: 'openai' as const,
        description: 'Claude 系列模型',
        icon: 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons-static@latest/icons/claude.svg'
    },
    {
        id: 'deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        apiFormat: 'openai' as const,
        description: 'DeepSeek V3 / R1',
        icon: 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons-static@latest/icons/deepseek.svg'
    },
    {
        id: 'siliconflow',
        name: '硅基流动',
        baseUrl: 'https://api.siliconflow.cn',
        apiFormat: 'openai' as const,
        description: '国内大模型聚合平台',
        icon: '🌊'
    },
    {
        id: 'moonshot',
        name: 'Moonshot',
        baseUrl: 'https://api.moonshot.cn',
        apiFormat: 'openai' as const,
        description: 'Kimi 大模型',
        icon: '🌙'
    },
    {
        id: 'zhipu',
        name: '智谱 AI',
        baseUrl: 'https://open.bigmodel.cn/api/paas',
        apiFormat: 'openai' as const,
        description: 'GLM-4 / ChatGLM',
        icon: '🔮'
    },
    {
        id: 'baidu',
        name: '百度千帆',
        baseUrl: 'https://qianfan.baidubce.com',
        apiFormat: 'openai' as const,
        description: '文心一言系列',
        icon: '🇧🇩'
    },
    {
        id: 'aliyun',
        name: '阿里云百炼',
        baseUrl: 'https://dashscope.aliyuncs.com',
        apiFormat: 'openai' as const,
        description: '通义千问系列',
        icon: '☁️'
    },
    {
        id: 'volcengine',
        name: '火山引擎',
        baseUrl: 'https://ark.cn-beijing.volces.com',
        apiFormat: 'openai' as const,
        description: '豆包大模型',
        icon: '🌋'
    },
    {
        id: 'aihubmix',
        name: 'AIHubMix',
        baseUrl: 'https://aihubmix.com',
        apiFormat: 'openai' as const,
        description: '海外模型聚合',
        icon: '🌐'
    }
];

// API 格式类型
export type ApiFormat = 'auto' | 'openai' | 'gemini' | 'claude';

// Provider configuration interface
export interface ThirdPartyProvider {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiFormat;
    streamingMode: boolean; // 流式模式开关，默认 false (非流式)
    isPreset: boolean;
    models: ProviderModel[];
    pricing?: ModelPricingInfo[];
    createdAt: string;
    enabled: boolean;
    
    // 管理 API 配置
    managementConfig?: {
        enabled: boolean;
        accessToken: string;
        managementUrl?: string; // 可选，默认使用 baseUrl
        lastSyncAt?: string;
        userInfo?: {
            id: number;
            username: string;
            role: string;
        };
    };
    
    // 缓存的管理数据
    managementData?: {
        channels?: Channel[];
        suppliers?: Supplier[];
        groups?: Group[];
        tokens?: TokenUsage[];
        modelMetadata?: ModelMetadata[];
        pricing?: PricingConfig[];
        rates?: RateConfig[];
        lastUpdated: string;
    };
}

export interface ProviderModel {
    id: string;
    name: string;
    description?: string;
    advantages?: string;
    colorStart?: string;
    colorEnd?: string;
    endpoint?: string;
    creditCost: number;
    isPerToken: boolean;
}

interface Props {
    onProvidersChange?: (providers: ThirdPartyProvider[]) => void;
}

type ManagementTab = 'overview' | 'channels' | 'suppliers' | 'groups' | 'tokens' | 'models' | 'pricing';

const ThirdPartyProviderManager: React.FC<Props> = ({ onProvidersChange }) => {
    const [providers, setProviders] = useState<ThirdPartyProvider[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isManagementModalOpen, setIsManagementModalOpen] = useState(false);
    const [managingProvider, setManagingProvider] = useState<ThirdPartyProvider | null>(null);
    const [managementTab, setManagementTab] = useState<ManagementTab>('overview');
    const [selectedPreset, setSelectedPreset] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [searchKeyword, setSearchKeyword] = useState('');

    // Form states
    const [formName, setFormName] = useState('');
    const [formBaseUrl, setFormBaseUrl] = useState('');
    const [formApiKey, setFormApiKey] = useState('');
    const [formApiFormat, setFormApiFormat] = useState<ApiFormat>('auto'); // 默认为自动模式
    const [formStreamingMode, setFormStreamingMode] = useState(false); // 默认为非流式模式
    
    // Management API form states
    const [formEnableManagement, setFormEnableManagement] = useState(false);
    const [formAccessToken, setFormAccessToken] = useState('');
    const [formManagementUrl, setFormManagementUrl] = useState('');

    useEffect(() => {
        loadProviders();
    }, []);

    const loadProviders = () => {
        try {
            const saved = localStorage.getItem('third_party_providers');
            if (!saved) {
                console.log('[ThirdPartyProviderManager] No saved providers found');
                setProviders([]);
                return;
            }
            
            const parsed = JSON.parse(saved);
            
            // 🚀 [Fix] Validate and migrate old data format
            if (!Array.isArray(parsed)) {
                console.error('[ThirdPartyProviderManager] Saved data is not an array');
                setProviders([]);
                return;
            }
            
            // Migrate old providers to new format
            const migratedProviders = parsed.map((provider: any) => ({
                ...provider,
                // Ensure new fields have defaults
                apiFormat: provider.apiFormat || 'auto',
                streamingMode: provider.streamingMode ?? false,
                // Ensure managementConfig exists
                managementConfig: provider.managementConfig || {
                    enabled: false,
                    accessToken: '',
                },
            }));
            
            console.log('[ThirdPartyProviderManager] Loaded', migratedProviders.length, 'providers');
            setProviders(migratedProviders);
            onProvidersChange?.(migratedProviders);
        } catch (e) {
            console.error('[ThirdPartyProviderManager] Failed to load providers:', e);
            setProviders([]);
        }
    };

    const saveProviders = (newProviders: ThirdPartyProvider[]) => {
        localStorage.setItem('third_party_providers', JSON.stringify(newProviders));
        setProviders(newProviders);
        onProvidersChange?.(newProviders);
    };

    const handleAddProvider = async () => {
        if (!formName || !formBaseUrl || !formApiKey) {
            notify.error('请填写完整信息', '名称、地址和密钥都是必填项');
            return;
        }

        setIsLoading(true);

        let pricing: ModelPricingInfo[] | undefined;
        let models: ProviderModel[] = [];

        // 如果启用了管理 API，使用管理 API 获取数据
        if (formEnableManagement && formAccessToken) {
            try {
                const service = new NewApiManagementService({
                    baseUrl: formManagementUrl || formBaseUrl,
                    accessToken: formAccessToken,
                    apiKey: formApiKey
                });

                // 测试连接
                const testResult = await service.testConnection();
                if (!testResult.success) {
                    notify.warning('管理 API 连接失败', testResult.message);
                } else {
                    notify.success('管理 API 连接成功', testResult.message);
                }

                // 获取定价信息
                try {
                    const pricingData = await service.getAllPricing();
                    pricing = pricingData.map(p => ({
                        modelId: p.modelId,
                        modelName: p.modelName,
                        inputPrice: p.inputPrice,
                        outputPrice: p.outputPrice,
                        isPerToken: p.type === 'tokens',
                        groupRatio: p.groupRatio,
                        currency: p.currency
                    }));
                } catch (e) {
                    console.log('Pricing fetch failed, using fallback');
                }

                // 获取模型列表
                try {
                    const modelData = await service.getAllModels();
                    models = modelData.map(m => ({
                        id: m.id,
                        name: m.name,
                        creditCost: pricing?.find(p => p.modelId === m.id)?.inputPrice || 1,
                        isPerToken: true
                    }));
                } catch (e) {
                    // 回退到标准 API 获取模型
                    const modelIds = await fetchProviderModels(formBaseUrl, formApiKey);
                    models = modelIds.map(id => ({
                        id,
                        name: id,
                        creditCost: pricing?.find(p => p.modelId === id)?.inputPrice || 1,
                        isPerToken: true
                    }));
                }
            } catch (e: any) {
                notify.warning('管理 API 初始化失败', e.message || '将使用标准 API 模式');
                // 回退到标准模式
                const modelIds = await fetchProviderModels(formBaseUrl, formApiKey);
                models = modelIds.map(id => ({
                    id,
                    name: id,
                    creditCost: 1,
                    isPerToken: true
                }));
            }
        } else {
            // 标准模式：使用 API Key 获取模型
            try {
                const modelIds = await fetchProviderModels(formBaseUrl, formApiKey);
                models = modelIds.map(id => ({
                    id,
                    name: id,
                    creditCost: 1,
                    isPerToken: true
                }));
            } catch (e) {
                models = [];
            }
        }

        const newProvider: ThirdPartyProvider = {
            id: Date.now().toString(),
            name: formName,
            baseUrl: formBaseUrl,
            apiKey: formApiKey,
            apiFormat: formApiFormat,
            streamingMode: formStreamingMode,
            isPreset: !!selectedPreset,
            models,
            pricing,
            createdAt: new Date().toISOString(),
            enabled: true,
            managementConfig: formEnableManagement ? {
                enabled: true,
                accessToken: formAccessToken,
                managementUrl: formManagementUrl || undefined,
            } : undefined
        };

        const newProviders = [...providers, newProvider];
        saveProviders(newProviders);
        
        setIsAddModalOpen(false);
        resetForm();
        setIsLoading(false);
        
        notify.success('添加成功', `已添加 ${formName}`);
    };

    const handleDeleteProvider = (id: string) => {
        if (!confirm('确定要删除此服务商吗？')) return;
        
        const newProviders = providers.filter(p => p.id !== id);
        saveProviders(newProviders);
        notify.success('删除成功', '服务商已移除');
    };

    const handleToggleProvider = (id: string) => {
        const newProviders = providers.map(p => 
            p.id === id ? { ...p, enabled: !p.enabled } : p
        );
        saveProviders(newProviders);
    };

    const openManagementModal = (provider: ThirdPartyProvider) => {
        setManagingProvider(provider);
        setManagementTab('overview');
        setIsManagementModalOpen(true);
        
        // 不再自动刷新数据，避免加载缓慢
        // 只在没有缓存数据且启用了管理 API 时提示用户手动刷新
        if (provider.managementConfig?.enabled && !provider.managementData) {
            notify.info('提示', '点击"刷新数据"按钮获取最新管理数据');
        }
    };

    const refreshManagementData = async (
        provider: ThirdPartyProvider,
        options?: { 
            silent?: boolean;
            timeout?: number;
        }
    ) => {
        if (!provider.managementConfig?.enabled || !provider.managementConfig.accessToken) {
            if (!options?.silent) {
                notify.error('未配置管理 API', '请先配置 Access Token');
            }
            return;
        }

        setIsLoading(true);
        const startTime = Date.now();
        const timeout = options?.timeout || 15000; // 默认15秒超时
        
        try {
            const service = new NewApiManagementService({
                baseUrl: provider.managementConfig.managementUrl || provider.baseUrl,
                accessToken: provider.managementConfig.accessToken,
                apiKey: provider.apiKey
            });

            // 使用 Promise.race 实现超时控制
            const fetchWithTimeout = async <T,>(promise: Promise<T>, name: string): Promise<T | undefined> => {
                const timeoutPromise = new Promise<undefined>((_, reject) => 
                    setTimeout(() => reject(new Error(`${name} 请求超时`)), timeout)
                );
                try {
                    const result = await Promise.race([promise, timeoutPromise]);
                    return result;
                } catch (error: any) {
                    console.warn(`[Management] ${name} 获取失败:`, error.message);
                    return undefined;
                }
            };

            // 优先获取内核数据（渠道、分组）
            notify.info('正在刷新...', '获取渠道和分组信息');
            
            const [channels, groups, pricing] = await Promise.all([
                fetchWithTimeout(service.getAllChannels(), '渠道'),
                fetchWithTimeout(service.getAllGroups(), '分组'),
                fetchWithTimeout(service.getAllPricing(), '定价'),
            ]);

            // 次要数据（供应商、令牌、模型）
            notify.info('正在刷新...', '获取供应商和令牌信息');
            
            const [suppliers, tokens, modelMetadata] = await Promise.all([
                fetchWithTimeout(service.getAllSuppliers(), '供应商'),
                fetchWithTimeout(service.getAllTokens(), '令牌'),
                fetchWithTimeout(service.getAllModels(), '模型'),
            ]);

            const duration = Date.now() - startTime;

            const updatedProvider: ThirdPartyProvider = {
                ...provider,
                managementData: {
                    channels,
                    suppliers,
                    groups,
                    tokens,
                    modelMetadata,
                    pricing,
                    rates: undefined, // 简化：从 pricing 计算
                    lastUpdated: new Date().toISOString()
                }
            };

            const newProviders = providers.map(p => 
                p.id === provider.id ? updatedProvider : p
            );
            saveProviders(newProviders);
            setManagingProvider(updatedProvider);
            
            if (!options?.silent) {
                notify.success('刷新完成', `耗时 ${duration}ms`);
            }
            
            return updatedProvider;
        } catch (error: any) {
            console.error('[Management] 刷新失败:', error);
            if (!options?.silent) {
                notify.error('刷新失败', error.message || '无法获取管理数据');
            }
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const updateChannelsBalance = async (provider: ThirdPartyProvider) => {
        if (!provider.managementConfig?.enabled) return;
        
        setIsLoading(true);
        try {
            const service = new NewApiManagementService({
                baseUrl: provider.managementConfig.managementUrl || provider.baseUrl,
                accessToken: provider.managementConfig.accessToken,
                apiKey: provider.apiKey
            });

            const updatedChannels = await service.updateAllChannelsBalance();
            
            const updatedProvider = {
                ...provider,
                managementData: {
                    ...provider.managementData,
                    channels: updatedChannels,
                    lastUpdated: new Date().toISOString()
                }
            };

            const newProviders = providers.map(p => 
                p.id === provider.id ? updatedProvider : p
            );
            saveProviders(newProviders);
            setManagingProvider(updatedProvider);
            
            notify.success('余额更新成功', `已更新 ${updatedChannels.length} 个渠道`);
        } catch (error: any) {
            notify.error('更新失败', error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setFormName('');
        setFormBaseUrl('');
        setFormApiKey('');
        setFormApiFormat('auto'); // 重置为自动模式
        setFormStreamingMode(false); // 重置为非流式模式
        setFormEnableManagement(false);
        setFormAccessToken('');
        setFormManagementUrl('');
        setSelectedPreset('');
    };

    const selectPreset = (presetId: string) => {
        const preset = PRESET_PROVIDERS.find(p => p.id === presetId);
        if (preset) {
            setSelectedPreset(presetId);
            setFormName(preset.name);
            setFormBaseUrl(preset.baseUrl);
            // 预设供应商默认使用自动模式，让用户自行选择或保持自动
            setFormApiFormat('auto');
        }
    };

    // 渲染管理概览
    const renderManagementOverview = (provider: ThirdPartyProvider) => {
        const data = provider.managementData;
        if (!data) {
            return (
                <div className="flex flex-col items-center justify-center py-12 text-white/40">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                        <Database size={32} className="text-white/20" />
                    </div>
                    <p className="text-white/60 font-medium mb-1">暂无管理数据</p>
                    <p className="text-sm text-white/40 mb-4">点击下方按钮获取最新数据</p>
                    <button
                        onClick={() => refreshManagementData(provider)}
                        disabled={isLoading}
                        className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                    >
                        {isLoading ? '获取中...' : '获取数据'}
                    </button>
                </div>
            );
        }

        return (
            <div className="space-y-5">
                {/* 统计卡片 - 高端玻璃拟态 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 hover:border-indigo-500/40 transition-colors group">
                        <div className="flex items-center gap-2 text-indigo-400 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                                <Server size={16} />
                            </div>
                            <span className="text-xs font-medium">渠道</span>
                        </div>
                        <div className="text-2xl font-bold text-white group-hover:scale-105 transition-transform origin-left">
                            {data.channels?.length || 0}
                        </div>
                    </div>
                    
                    <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 hover:border-emerald-500/40 transition-colors group">
                        <div className="flex items-center gap-2 text-emerald-400 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                <Layers size={16} />
                            </div>
                            <span className="text-xs font-medium">分组</span>
                        </div>
                        <div className="text-2xl font-bold text-white group-hover:scale-105 transition-transform origin-left">
                            {data.groups?.length || 0}
                        </div>
                    </div>
                    
                    <div className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/20 rounded-xl p-4 hover:border-amber-500/40 transition-colors group">
                        <div className="flex items-center gap-2 text-amber-400 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                                <Key size={16} />
                            </div>
                            <span className="text-xs font-medium">令牌</span>
                        </div>
                        <div className="text-2xl font-bold text-white group-hover:scale-105 transition-transform origin-left">
                            {data.tokens?.length || 0}
                        </div>
                    </div>
                    
                    <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20 rounded-xl p-4 hover:border-purple-500/40 transition-colors group">
                        <div className="flex items-center gap-2 text-purple-400 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                <Zap size={16} />
                            </div>
                            <span className="text-xs font-medium">模型</span>
                        </div>
                        <div className="text-2xl font-bold text-white group-hover:scale-105 transition-transform origin-left">
                            {data.modelMetadata?.length || 0}
                        </div>
                    </div>
                </div>

                {/* 最后更新时间 */}
                {data.lastUpdated && (
                    <div className="flex items-center justify-between text-xs text-white/50 bg-white/[0.03] border border-white/5 rounded-xl p-3">
                        <span className="flex items-center gap-2">
                            <Activity size={12} className="text-emerald-400" />
                            最后更新: {new Date(data.lastUpdated).toLocaleString()}
                        </span>
                        <button
                            onClick={() => refreshManagementData(provider)}
                            disabled={isLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-colors text-xs font-medium"
                        >
                            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                            刷新
                        </button>
                    </div>
                )}

                {/* 快捷操作 - 高端卡片 */}
                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={() => updateChannelsBalance(provider)}
                        disabled={isLoading}
                        className="group flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all text-left"
                    >
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Wallet size={20} className="text-indigo-400" />
                        </div>
                        <div>
                            <div className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">更新渠道余额</div>
                            <div className="text-xs text-white/40">获取最新余额信息</div>
                        </div>
                    </button>

                    <button
                        onClick={() => setManagementTab('pricing')}
                        className="group flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all text-left"
                    >
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <DollarSign size={20} className="text-emerald-400" />
                        </div>
                        <div>
                            <div className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors">查看定价信息</div>
                            <div className="text-xs text-white/40">模型价格与倍率</div>
                        </div>
                    </button>
                </div>
            </div>
        );
    };

    // 渲染渠道列表
    const renderChannels = (provider: ThirdPartyProvider) => {
        const channels = provider.managementData?.channels;
        if (!channels?.length) {
            return (
                <div className="text-center py-8 text-gray-500 dark:text-zinc-500">
                    <Server size={48} className="mx-auto mb-3 opacity-30" />
                    <p>暂无渠道数据</p>
                </div>
            );
        }

        return (
            <div className="space-y-2">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                        共 {channels.length} 个渠道
                    </span>
                    <button
                        onClick={() => updateChannelsBalance(provider)}
                        disabled={isLoading}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                        更新余额
                    </button>
                </div>

                {channels.map(channel => (
                    <div
                        key={channel.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]"
                    >
                        <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${channel.status === 1 ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                            <div>
                                <div className="font-medium text-gray-900 dark:text-zinc-100 text-sm">
                                    {channel.name}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-zinc-500">
                                    {getChannelTypeName(channel.type)} • {channel.group}
                                </div>
                            </div>
                        </div>

                        <div className="text-right">
                            {channel.balance !== undefined && (
                                <div className="text-sm font-medium text-gray-900 dark:text-zinc-100">
                                    余额: {formatQuota(channel.balance)}
                                </div>
                            )}
                            {channel.usedQuota !== undefined && (
                                <div className="text-xs text-gray-500 dark:text-zinc-500">
                                    已用: {formatQuota(channel.usedQuota)}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    // 渲染供应商列表
    const renderSuppliers = (provider: ThirdPartyProvider) => {
        const suppliers = provider.managementData?.suppliers;
        if (!suppliers?.length) {
            return (
                <div className="text-center py-8 text-gray-500 dark:text-zinc-500">
                    <Globe size={48} className="mx-auto mb-3 opacity-30" />
                    <p>暂无供应商数据</p>
                </div>
            );
        }

        const filteredSuppliers = searchKeyword
            ? suppliers.filter(s => 
                s.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                s.baseUrl.toLowerCase().includes(searchKeyword.toLowerCase())
            )
            : suppliers;

        return (
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchKeyword}
                            onChange={(e) => setSearchKeyword(e.target.value)}
                            placeholder="搜索供应商..."
                            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] text-sm"
                        />
                    </div>
                </div>

                <div className="text-sm text-gray-500 dark:text-zinc-500">
                    共 {filteredSuppliers.length} 个供应商
                </div>

                {filteredSuppliers.map(supplier => (
                    <div
                        key={supplier.id}
                        className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]"
                    >
                        <div className="flex items-center justify-between">
                            <div className="font-medium text-gray-900 dark:text-zinc-100">
                                {supplier.name}
                            </div>
                            {supplier.balance !== undefined && (
                                <div className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                                    余额: {formatQuota(supplier.balance)}
                                </div>
                            )}
                        </div>
                        
                        <div className="text-xs text-gray-500 dark:text-zinc-500 mt-1">
                            {supplier.baseUrl}
                        </div>

                        {supplier.modelCount !== undefined && (
                            <div className="text-xs text-gray-500 dark:text-zinc-500 mt-1">
                                {supplier.modelCount} 个模型
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    };

    // 渲染分组列表
    const renderGroups = (provider: ThirdPartyProvider) => {
        const groups = provider.managementData?.groups;
        if (!groups?.length) {
            return (
                <div className="text-center py-8 text-gray-500 dark:text-zinc-500">
                    <Layers size={48} className="mx-auto mb-3 opacity-30" />
                    <p>暂无分组数据</p>
                </div>
            );
        }

        return (
            <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-3">
                    共 {groups.length} 个分组
                </div>

                {groups.map(group => (
                    <div
                        key={group.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]"
                    >
                        <div>
                            <div className="font-medium text-gray-900 dark:text-zinc-100 text-sm">
                                {group.name}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-zinc-500">
                                ID: {group.id}
                            </div>
                        </div>

                        <div className="text-right">
                            <div className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                                倍率: {group.ratio}x
                            </div>
                            {group.apiRate !== undefined && (
                                <div className="text-xs text-gray-500 dark:text-zinc-500">
                                    API倍率: {group.apiRate}x
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    // 渲染令牌列表
    const renderTokens = (provider: ThirdPartyProvider) => {
        const tokens = provider.managementData?.tokens;
        if (!tokens?.length) {
            return (
                <div className="text-center py-8 text-gray-500 dark:text-zinc-500">
                    <Key size={48} className="mx-auto mb-3 opacity-30" />
                    <p>暂无令牌数据</p>
                </div>
            );
        }

        const totalUsed = tokens.reduce((sum, t) => sum + t.usedQuota, 0);
        const totalRemain = tokens.reduce((sum, t) => 
            sum + (t.unlimitedQuota ? 0 : t.remainQuota), 0
        );

        return (
            <div className="space-y-4">
                {/* 总计 */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3">
                        <div className="text-xs text-red-600 dark:text-red-400 mb-1">总消耗</div>
                        <div className="text-lg font-bold text-gray-900 dark:text-white">
                            {formatQuota(totalUsed)}
                        </div>
                    </div>
                    
                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3">
                        <div className="text-xs text-emerald-600 dark:text-emerald-400 mb-1">总剩余</div>
                        <div className="text-lg font-bold text-gray-900 dark:text-white">
                            {totalRemain === 0 ? '无限制' : formatQuota(totalRemain)}
                        </div>
                    </div>
                </div>

                {/* 令牌列表 */}
                <div className="space-y-2">
                    {tokens.map(token => (
                        <div
                            key={token.id}
                            className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]"
                        >
                            <div className="flex items-center justify-between">
                                <div className="font-medium text-gray-900 dark:text-zinc-100 text-sm">
                                    {token.name}
                                </div>
                                <div className={`text-xs px-2 py-0.5 rounded ${token.status === 1 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-gray-500/10 text-gray-600'}`}>
                                    {token.status === 1 ? '启用' : '禁用'}
                                </div>
                            </div>

                            <div className="text-xs text-gray-500 dark:text-zinc-500 mt-1 font-mono">
                                {token.key}
                            </div>

                            <div className="flex items-center gap-4 mt-2 text-xs">
                                <span className="text-red-600 dark:text-red-400">
                                    已用: {formatQuota(token.usedQuota)}
                                </span>
                                {!token.unlimitedQuota && (
                                    <span className="text-emerald-600 dark:text-emerald-400">
                                        剩余: {formatQuota(token.remainQuota)}
                                    </span>
                                )}
                                {token.unlimitedQuota && (
                                    <span className="text-indigo-600 dark:text-indigo-400">
                                        无限额度
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // 渲染定价信息
    const renderPricing = (provider: ThirdPartyProvider) => {
        const pricing = provider.managementData?.pricing;
        if (!pricing?.length) {
            return (
                <div className="text-center py-8 text-gray-500 dark:text-zinc-500">
                    <DollarSign size={48} className="mx-auto mb-3 opacity-30" />
                    <p>暂无定价数据</p>
                </div>
            );
        }

        return (
            <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-3">
                    共 {pricing.length} 个模型定价
                </div>

                {pricing.map(p => (
                    <div
                        key={p.modelId}
                        className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]"
                    >
                        <div>
                            <div className="font-medium text-gray-900 dark:text-zinc-100 text-sm">
                                {p.modelName}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-zinc-500 font-mono">
                                {p.modelId}
                            </div>
                        </div>

                        <div className="text-right">
                            <div className="text-sm text-gray-900 dark:text-zinc-100">
                                {formatPrice(p.inputPrice, p.currency)}
                            </div>
                            {p.outputPrice > 0 && (
                                <div className="text-xs text-gray-500 dark:text-zinc-500">
                                    输出: {formatPrice(p.outputPrice, p.currency)}
                                </div>
                            )}
                            {p.groupRatio !== 1 && (
                                <div className="text-xs text-indigo-600 dark:text-indigo-400">
                                    分组倍率: {p.groupRatio}x
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    // 刷新所有厂商的管理数据
    const refreshAllProviders = async () => {
        const managementProviders = providers.filter(p => p.managementConfig?.enabled);
        if (managementProviders.length === 0) {
            notify.info('提示', '没有配置管理 API 的厂商');
            return;
        }

        setIsLoading(true);
        let successCount = 0;
        let failCount = 0;

        // 串行刷新，避免并发请求过多
        for (const provider of managementProviders) {
            try {
                await refreshManagementData(provider, { silent: true, timeout: 10000 });
                successCount++;
            } catch (error) {
                failCount++;
                console.error(`[Management] 刷新 ${provider.name} 失败:`, error);
            }
        }

        setIsLoading(false);
        
        if (failCount === 0) {
            notify.success('刷新完成', `成功刷新 ${successCount} 个厂商`);
        } else {
            notify.warning('刷新完成', `成功 ${successCount} 个，失败 ${failCount} 个`);
        }
    };

    return (
        <div className="space-y-4">
            {/* Header - 高端玻璃拟态设计 */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center">
                        <Server className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">
                            第三方服务商
                            {providers.length > 0 && (
                                <span className="ml-2 text-sm font-normal text-white/50">
                                    ({providers.length} 个)
                                </span>
                            )}
                        </h3>
                        <p className="text-xs text-white/40">管理和配置 API 服务商</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {providers.filter(p => p.managementConfig?.enabled).length > 0 && (
                        <button
                            onClick={refreshAllProviders}
                            disabled={isLoading}
                            className="group flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium text-white/80 transition-all duration-200 disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                            title="刷新所有管理数据"
                        >
                            <RefreshCw size={16} className={`transition-transform ${isLoading ? 'animate-spin' : 'group-hover:rotate-180'}`} />
                            刷新全部
                        </button>
                    )}
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="group flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white rounded-xl text-sm font-medium transition-all duration-200 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <Plus size={16} className="transition-transform group-hover:rotate-90" />
                        添加服务商
                    </button>
                    {providers.length > 0 && (
                        <>
                            <button
                                onClick={() => {
                                    const dataStr = JSON.stringify(providers, null, 2);
                                    const blob = new Blob([dataStr], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `api-providers-${new Date().toISOString().split('T')[0]}.json`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                    notify.success('导出成功', `已导出 ${providers.length} 个厂商配置`);
                                }}
                                className="group flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium text-white/80 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                                title="导出配置"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:-translate-y-0.5">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                    <polyline points="7 10 12 15 17 10"/>
                                    <line x1="12" y1="15" x2="12" y2="3"/>
                                </svg>
                                导出
                            </button>
                            <label className="group flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium text-white/80 transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-[0.98]" title="导入配置">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-y-0.5">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                    <polyline points="17 8 12 3 7 8"/>
                                    <line x1="12" y1="3" x2="12" y2="15"/>
                                </svg>
                                导入
                                <input
                                    type="file"
                                    accept=".json"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        
                                        const reader = new FileReader();
                                        reader.onload = (event) => {
                                            try {
                                                const imported = JSON.parse(event.target?.result as string);
                                                if (!Array.isArray(imported)) {
                                                    notify.error('导入失败', '文档格式错误');
                                                    return;
                                                }
                                                
                                                // Merge with existing providers (avoid duplicates by id)
                                                const existingIds = new Set(providers.map(p => p.id));
                                                const newProviders = imported.filter((p: any) => !existingIds.has(p.id));
                                                
                                                if (newProviders.length === 0) {
                                                    notify.info('提示', '所有厂商已存在，未导入新数据');
                                                    return;
                                                }
                                                
                                                const merged = [...providers, ...newProviders];
                                                saveProviders(merged);
                                                notify.success('导入成功', `已导入 ${newProviders.length} 个厂商配置`);
                                            } catch (err) {
                                                notify.error('导入失败', '无法解析文档');
                                            }
                                        };
                                        reader.readAsText(file);
                                        e.target.value = ''; // Reset input
                                    }}
                                />
                            </label>
                        </>
                    )}
                </div>
            </div>

            {/* Preset Providers Quick Add - 高端卡片设计 */}
            <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl p-5 border border-white/10 shadow-xl">
                <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    <h4 className="text-sm font-medium text-white/90">
                        预设服务商
                    </h4>
                    <span className="text-xs text-white/40 ml-1">快速添加常用服务商</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {PRESET_PROVIDERS.map((preset, idx) => (
                        <button
                            key={preset.id}
                            onClick={() => {
                                selectPreset(preset.id);
                                setIsAddModalOpen(true);
                            }}
                            className="group relative flex flex-col items-center gap-2 p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.08] hover:border-indigo-500/30 transition-all duration-300 text-center hover:-translate-y-0.5"
                            style={{ animationDelay: `${idx * 50}ms` }}
                        >
                            <div className="relative">
                                {preset.icon.startsWith('http') ? (
                                    <img src={preset.icon} alt={preset.name} className="w-7 h-7 object-contain" />
                                ) : (
                                    <span className="text-2xl group-hover:scale-110 transition-transform duration-300">{preset.icon}</span>
                                )}
                            </div>
                            <span className="text-xs font-medium text-white/80 group-hover:text-white transition-colors">
                                {preset.name}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Provider List - 高端列表设计 */}
            <div className="space-y-3">
                {providers.length === 0 ? (
                    <div className="text-center py-12 bg-gradient-to-br from-white/[0.05] to-transparent backdrop-blur-sm rounded-2xl border border-white/5">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
                            <Server size={32} className="text-white/20" />
                        </div>
                        <p className="text-white/60 font-medium mb-1">暂无第三方服务商</p>
                        <p className="text-sm text-white/40 mb-4">点击上方按钮添加您的第一个服务商</p>
                        <button
                            onClick={() => {
                                loadProviders();
                                notify.info('已刷新', '尝试重新加载本地存储的厂商数据');
                            }}
                            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                            重新加载数据
                        </button>
                    </div>
                ) : (
                    providers.map((provider, idx) => (
                        <div
                            key={provider.id}
                            className={`group bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border transition-all duration-300 overflow-hidden ${
                                provider.enabled 
                                    ? 'border-white/10 hover:border-white/20 hover:shadow-lg hover:shadow-indigo-500/10' 
                                    : 'border-white/5 opacity-60 hover:opacity-80'
                            }`}
                            style={{ animationDelay: `${idx * 50}ms` }}
                        >
                            {/* Provider Header */}
                            <div 
                                className="flex items-center justify-between p-5 cursor-pointer"
                                onClick={() => setExpandedId(expandedId === provider.id ? null : provider.id)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-3 h-3 rounded-full transition-all duration-300 ${provider.enabled ? 'bg-emerald-400 shadow-lg shadow-emerald-500/30' : 'bg-white/20'}`} />
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-semibold text-white group-hover:text-indigo-300 transition-colors">
                                                {provider.name}
                                            </h4>
                                            {/* 管理 API 徽章 */}
                                            {provider.managementConfig?.enabled && (
                                                <span className="px-2.5 py-0.5 bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs rounded-full font-medium flex items-center gap-1">
                                                    <Settings size={10} />
                                                    管理API
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-white/40 font-mono mt-0.5 truncate max-w-[300px]">
                                            {provider.baseUrl}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-xs px-3 py-1 rounded-full bg-white/5 text-white/60 border border-white/5">
                                        {provider.models.length} 个模型
                                    </span>
                                    <div className={`w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center transition-all duration-300 ${expandedId === provider.id ? 'rotate-180 bg-indigo-500/20' : ''}`}>
                                        <ChevronDown size={18} className="text-white/50" />
                                    </div>
                                </div>
                            </div>

                            {/* Expanded Content - 高端展开内容 */}
                            {expandedId === provider.id && (
                                <div className="px-5 pb-5 border-t border-white/5">
                                    {/* Actions */}
                                    <div className="flex items-center gap-2 py-4">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleToggleProvider(provider.id);
                                            }}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                                                provider.enabled
                                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25'
                                                    : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                                            }`}
                                        >
                                            {provider.enabled ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                                            {provider.enabled ? '已启用' : '已禁用'}
                                        </button>
                                        
                                        {provider.managementConfig?.enabled && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openManagementModal(provider);
                                                }}
                                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/25 transition-all duration-200"
                                            >
                                                <Settings size={14} />
                                                管理
                                            </button>
                                        )}
                                        
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteProvider(provider.id);
                                            }}
                                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-all duration-200"
                                        >
                                            <Trash2 size={14} />
                                            删除
                                        </button>
                                    </div>

                                    {/* Models List */}
                                    {provider.models.length > 0 && (
                                        <div className="space-y-3 mt-3">
                                            <div className="flex items-center gap-2">
                                                <Layers className="w-3.5 h-3.5 text-white/40" />
                                                <h5 className="text-xs font-medium text-white/60">
                                                    模型列表
                                                </h5>
                                            </div>
                                            <div className="grid gap-2">
                                                {provider.models.map(model => (
                                                    <div
                                                        key={model.id}
                                                        className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5 text-sm hover:bg-white/[0.05] transition-colors"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                                                                <Cpu size={14} className="text-indigo-400" />
                                                            </div>
                                                            <div>
                                                                <span className="font-medium text-white/90 block">
                                                                    {model.name}
                                                                </span>
                                                                <span className="text-xs text-white/40 font-mono">
                                                                    {model.id}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                            <Coins size={12} />
                                                            {model.creditCost} 积分
                                                            {model.isPerToken ? '/1M tokens' : '/次'}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Add Modal - 高端模态框 */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10003] p-4">
                    <div className="bg-gradient-to-br from-[#1a1f2e] to-[#0f1419] border border-white/10 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/50">
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center">
                                    <Plus className="w-5 h-5 text-indigo-400" />
                                </div>
                                <h3 className="text-lg font-bold text-white">
                                    添加第三方服务商
                                </h3>
                            </div>

                            {/* Preset Selection */}
                            <div className="mb-5">
                                <label className="block text-sm font-medium text-white/80 mb-2">
                                    选择预设（可选）
                                </label>
                                <select
                                    value={selectedPreset}
                                    onChange={(e) => selectPreset(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white text-sm focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                >
                                    <option value="" className="bg-[#1a1f2e]">自定义服务商</option>
                                    {PRESET_PROVIDERS.map(p => (
                                        <option key={p.id} value={p.id} className="bg-[#1a1f2e]">{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Form Fields */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">
                                        服务商名称 <span className="text-indigo-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formName}
                                        onChange={(e) => setFormName(e.target.value)}
                                        placeholder="例如：我的 OpenAI 代理"
                                        className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white text-sm placeholder:text-white/30 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">
                                        API 地址 <span className="text-indigo-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formBaseUrl}
                                        onChange={(e) => setFormBaseUrl(e.target.value)}
                                        placeholder="https://api.example.com"
                                        className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white text-sm placeholder:text-white/30 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-mono"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">
                                        API 密钥 <span className="text-indigo-400">*</span>
                                    </label>
                                    <input
                                        type="password"
                                        value={formApiKey}
                                        onChange={(e) => setFormApiKey(e.target.value)}
                                        placeholder="sk-..."
                                        className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white text-sm placeholder:text-white/30 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-mono"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">
                                        API 格式
                                        <span className="ml-2 text-xs text-white/40 font-normal">(自动模式会根据模型自动选择)</span>
                                    </label>
                                    <select
                                        value={formApiFormat}
                                        onChange={(e) => setFormApiFormat(e.target.value as ApiFormat)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white text-sm focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                    >
                                        <option value="auto" className="bg-[#1a1f2e]">🔄 自动模式 (推荐)</option>
                                        <option value="openai" className="bg-[#1a1f2e]">🤖 OpenAI 兼容格式</option>
                                        <option value="gemini" className="bg-[#1a1f2e]">✨ Google Gemini 格式</option>
                                        <option value="claude" className="bg-[#1a1f2e]">🧠 Claude 原生格式</option>
                                    </select>
                                </div>

                                {/* 流式模式切换 - 高端样式 */}
                                <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.03]">
                                    <div>
                                        <label className="block text-sm font-medium text-white/90 flex items-center gap-2">
                                            <Zap size={14} className="text-amber-400" />
                                            流式输出模式
                                        </label>
                                        <p className="text-xs text-white/40 mt-1">
                                            开启后使用流式传输，适合长文本生成
                                        </p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formStreamingMode}
                                            onChange={(e) => setFormStreamingMode(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-white/10 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-white/20 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500">
                                        </div>
                                    </label>
                                </div>

                                {/* Management API Settings - 高端样式 */}
                                <div className="border-t border-white/10 pt-4 mt-4">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-sm font-medium text-white/90 flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                                                <Settings size={12} className="text-indigo-400" />
                                            </div>
                                            管理 API 集成
                                        </h4>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formEnableManagement}
                                                onChange={(e) => setFormEnableManagement(e.target.checked)}
                                                className="sr-only peer"
                                            />
                                            <div className="w-9 h-5 bg-white/10 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-white/20 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                                        </label>
                                    </div>

                                    {formEnableManagement && (
                                        <div className="space-y-4 p-4 bg-gradient-to-br from-indigo-500/10 to-purple-500/5 rounded-xl border border-indigo-500/20">
                                            <div className="flex items-start gap-3 text-xs text-indigo-300 bg-indigo-500/10 p-3 rounded-lg">
                                                <Info size={14} className="mt-0.5 flex-shrink-0 text-indigo-400" />
                                                <span>
                                                    启用管理 API 后可自动同步渠道余额、分组倍率、模型定价等信息。
                                                    在服务商后台的「个人设置 - 安全设置 - 系统访问令牌」中生成 Access Token。
                                                </span>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-medium text-white/70 mb-2">
                                                    Access Token <span className="text-indigo-400">*</span>
                                                </label>
                                                <input
                                                    type="password"
                                                    value={formAccessToken}
                                                    onChange={(e) => setFormAccessToken(e.target.value)}
                                                    placeholder="用于管理 API 的身份验证..."
                                                    className="w-full px-4 py-2.5 rounded-xl border border-indigo-500/30 bg-white/5 text-white text-sm placeholder:text-white/30 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-mono"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-medium text-white/70 mb-2">
                                                    管理 API 地址（可选）
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formManagementUrl}
                                                    onChange={(e) => setFormManagementUrl(e.target.value)}
                                                    placeholder="留空则使用 Base URL"
                                                    className="w-full px-4 py-2.5 rounded-xl border border-indigo-500/30 bg-white/5 text-white text-sm placeholder:text-white/30 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                                />
                                                <p className="text-xs text-white/40 mt-2">
                                                    如果管理 API 地址与 API 地址不同，请单独配置
                                                </p>
                                            </div>

                                            <div className="space-y-2 pt-2">
                                                {['渠道余额自动同步', '分组倍率信息获取', 'Tokens 消耗校准', '消费记录查询'].map((item, i) => (
                                                    <div key={i} className="flex items-center gap-2 text-xs text-white/60">
                                                        <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                                            <CheckCircle size={10} className="text-emerald-400" />
                                                        </div>
                                                        <span>{item}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => {
                                        setIsAddModalOpen(false);
                                        resetForm();
                                    }}
                                    className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-white/70 text-sm font-medium hover:bg-white/5 transition-all duration-200"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleAddProvider}
                                    disabled={isLoading}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isLoading ? (
                                        <>
                                            <RefreshCw size={16} className="animate-spin" />
                                            处理中...
                                        </>
                                    ) : (
                                        '添加服务商'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Management Modal - 高端管理模态框 */}
            {isManagementModalOpen && managingProvider && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10004] p-4"
                onClick={(e) => {
                    if (e.target === e.currentTarget) {
                        setIsManagementModalOpen(false);
                    }
                }}
            >
                    <div className="bg-gradient-to-br from-[#1a1f2e] to-[#0f1419] border border-white/10 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl shadow-black/50">
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center">
                                    <Settings className="w-5 h-5 text-indigo-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">
                                        管理 {managingProvider.name}
                                    </h3>
                                    <p className="text-sm text-white/40 font-mono">
                                        {managingProvider.baseUrl}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsManagementModalOpen(false)}
                                className="p-2 hover:bg-white/10 rounded-xl transition-colors group"
                            >
                                <X size={20} className="text-white/50 group-hover:text-white/80" />
                            </button>
                        </div>

                        <div className="flex h-[70vh]">
                            {/* Sidebar - 高端导航 */}
                            <div className="w-52 border-r border-white/10 bg-white/[0.02]">
                                <nav className="p-3 space-y-1">
                                    {[
                                        { id: 'overview', label: '概览', icon: BarChart3 },
                                        { id: 'channels', label: '渠道', icon: Server },
                                        { id: 'suppliers', label: '供应商', icon: Globe },
                                        { id: 'groups', label: '分组', icon: Layers },
                                        { id: 'tokens', label: '令牌', icon: Key },
                                        { id: 'pricing', label: '定价', icon: DollarSign },
                                    ].map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setManagementTab(tab.id as ManagementTab)}
                                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                                                managementTab === tab.id
                                                    ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-white border border-indigo-500/30'
                                                    : 'text-white/60 hover:bg-white/5 hover:text-white/90'
                                            }`}
                                        >
                                            <tab.icon size={16} className={managementTab === tab.id ? 'text-indigo-400' : ''} />
                                            {tab.label}
                                        </button>
                                    ))}
                                </nav>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-br from-white/[0.02] to-transparent">
                                {managementTab === 'overview' && renderManagementOverview(managingProvider)}
                                {managementTab === 'channels' && renderChannels(managingProvider)}
                                {managementTab === 'suppliers' && renderSuppliers(managingProvider)}
                                {managementTab === 'groups' && renderGroups(managingProvider)}
                                {managementTab === 'tokens' && renderTokens(managingProvider)}
                                {managementTab === 'pricing' && renderPricing(managingProvider)}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ThirdPartyProviderManager;
