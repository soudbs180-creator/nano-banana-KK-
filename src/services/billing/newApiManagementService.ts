/**
 * NewAPI Management Service
 * 
 * 完整的 NewAPI / OneAPI 管理接口封装
 * 支持渠道、供应商、分组、令牌、模型等管理功能
 * 
 * 文档参考: https://docs.newapi.pro/zh/docs/api/management/
 */

import { notify } from '../system/notificationService';

// ============== 类型定义 ==============

export interface NewApiManagementConfig {
  baseUrl: string;
  accessToken: string;  // 系统访问令牌 (System Access Token)
  apiKey?: string;      // API 密钥 (可选，用于某些不需要管理权限的接口)
}

export interface Channel {
  id: number;
  name: string;
  type: number;        // 渠道类型 (1=OpenAI, 2=Azure 等)
  key: string;         // 渠道密钥 (通常脱敏显示)
  baseUrl?: string;    // 渠道基础 URL
  models: string[];    // 支持的模型列表
  group: string;       // 所属分组
  balance?: number;    // 渠道余额
  usedQuota?: number;  // 已用额度
  status: number;      // 状态 (1=启用, 2=禁用)
  responseTime?: number; // 响应时间
  priority?: number;   // 优先级
  weight?: number;     // 权重
}

export interface Supplier {
  id: number;
  name: string;
  baseUrl: string;
  apiKey?: string;
  balance?: number;    // 供应商余额
  usedQuota?: number;  // 已使用额度
  status: number;      // 状态
  modelCount?: number; // 模型数量
  channels?: Channel[];
}

export interface Group {
  id: string;          // 分组 ID
  name: string;        // 分组名称
  ratio: number;       // 分组倍率
  apiRate: number;     // API 调用倍率
  status?: number;     // 状态
  createdTime?: number;
}

export interface TokenUsage {
  id: number;
  name: string;
  key: string;         // 令牌密钥 (脱敏)
  status: number;
  usedQuota: number;   // 已用额度
  remainQuota: number; // 剩余额度
  unlimitedQuota: boolean; // 是否无限额度
  createdTime: number;
  expiredTime?: number;
  models?: string[];   // 允许的模型
  group?: string;      // 所属分组
}

export interface ModelMetadata {
  id: string;          // 模型 ID
  name: string;        // 模型名称
  description?: string;
  inputPrice?: number; // 输入价格 (每 1M tokens)
  outputPrice?: number; // 输出价格 (每 1M tokens)
  ratio?: number;      // 倍率
  groups?: string[];   // 支持的分组
  capabilities?: string[]; // 能力列表 (vision, tools, etc.)
  ownedBy?: string;    // 提供商
}

export interface PricingConfig {
  modelId: string;
  modelName: string;
  inputPrice: number;  // 每 1M tokens
  outputPrice: number; // 每 1M tokens
  groupRatio: number;  // 分组倍率
  currency: string;
  type: 'tokens' | 'times'; // 计费类型
}

export interface RateConfig {
  groupId: string;
  groupName: string;
  modelRates: {
    modelId: string;
    rate: number;      // 模型倍率
  }[];
}

export interface UsageStatistics {
  date: string;
  modelId: string;
  tokenCount: number;
  cost: number;
  groupId?: string;
  requestCount?: number;
}

// ============== 错误处理 ==============

class NewApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'NewApiError';
  }
}

// ============== 核心服务类 ==============

export class NewApiManagementService {
  private config: NewApiManagementConfig;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

  constructor(config: NewApiManagementConfig) {
    this.config = config;
  }

  // 更新配置
  updateConfig(config: Partial<NewApiManagementConfig>) {
    this.config = { ...this.config, ...config };
    this.clearCache();
  }

  // 清空缓存
  clearCache() {
    this.cache.clear();
  }

  // 获取基础 URL
  private getBaseUrl(): string {
    return this.config.baseUrl.replace(/\/$/, '');
  }

  // 获取请求头
  private getHeaders(useAccessToken: boolean = true): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // 优先使用 Access Token 进行身份验证
    if (useAccessToken && this.config.accessToken) {
      headers['Authorization'] = `Bearer ${this.config.accessToken}`;
    } else if (this.config.apiKey) {
      // 如果 Access Token 不可用，使用 API Key
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

    // 发送请求（带超时）
    private async request<T>(
        endpoint: string,
        options: RequestInit = {},
        useAccessToken: boolean = true,
        timeoutMs: number = 10000 // 默认10秒超时
    ): Promise<T> {
        const url = `${this.getBaseUrl()}${endpoint}`;
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            
            const response = await fetch(url, {
                ...options,
                headers: {
                    ...this.getHeaders(useAccessToken),
                    ...options.headers,
                },
                signal: controller.signal,
            });
            
            clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }
        
        throw new NewApiError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          errorData
        );
      }

      const data = await response.json();
      return data.data || data;
    } catch (error) {
      if (error instanceof NewApiError) {
        throw error;
      }
      throw new NewApiError(
        error instanceof Error ? error.message : 'Unknown error',
        undefined,
        error
      );
    }
  }

  // 带缓存的请求
  private async cachedRequest<T>(
    cacheKey: string,
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    const data = await this.request<T>(endpoint, options);
    this.cache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  }

  // ============== 渠道管理 (Channel) ==============

  /**
   * 获取所有渠道
   */
  async getAllChannels(): Promise<Channel[]> {
    return this.cachedRequest('channels', '/api/channel/');
  }

  /**
   * 更新渠道余额
   * 批量更新所有渠道的余额信息
   */
  async updateAllChannelsBalance(): Promise<Channel[]> {
    try {
      // 获取所有渠道
      const channels = await this.getAllChannels();
      
      // 批量更新余额 (NewAPI 通常提供批量更新接口)
      const updatedChannels = await this.request<Channel[]>(
        '/api/channel/balance',
        { method: 'GET' }
      );

      // 更新缓存
      this.cache.set('channels', { 
        data: updatedChannels, 
        timestamp: Date.now() 
      });

      return updatedChannels;
    } catch (error) {
      console.error('[NewApiManagement] 更新渠道余额失败:', error);
      throw error;
    }
  }

  /**
   * 获取单个渠道详情
   */
  async getChannel(id: number): Promise<Channel> {
    return this.request(`/api/channel/${id}`);
  }

  /**
   * 更新渠道
   */
  async updateChannel(id: number, channel: Partial<Channel>): Promise<Channel> {
    const result = await this.request<Channel>(
      `/api/channel/`,
      {
        method: 'PUT',
        body: JSON.stringify({ id, ...channel }),
      }
    );
    this.clearCache(); // 清除缓存
    return result;
  }

  // ============== 供应商管理 (Supplier) ==============

  /**
   * 获取所有供应商
   */
  async getAllSuppliers(): Promise<Supplier[]> {
    return this.cachedRequest('suppliers', '/api/supplier/');
  }

  /**
   * 搜索供应商
   */
  async searchSuppliers(keyword: string): Promise<Supplier[]> {
    const suppliers = await this.getAllSuppliers();
    if (!keyword.trim()) return suppliers;
    
    const lowerKeyword = keyword.toLowerCase();
    return suppliers.filter(s => 
      s.name.toLowerCase().includes(lowerKeyword) ||
      s.baseUrl.toLowerCase().includes(lowerKeyword)
    );
  }

  /**
   * 更新供应商
   */
  async updateSupplier(id: number, supplier: Partial<Supplier>): Promise<Supplier> {
    const result = await this.request<Supplier>(
      `/api/supplier/`,
      {
        method: 'PUT',
        body: JSON.stringify({ id, ...supplier }),
      }
    );
    this.clearCache();
    return result;
  }

  /**
   * 获取供应商余额
   */
  async getSupplierBalance(supplierId: number): Promise<number> {
    try {
      const supplier = await this.request<Supplier>(`/api/supplier/${supplierId}`);
      return supplier.balance || 0;
    } catch (error) {
      console.error(`[NewApiManagement] 获取供应商 ${supplierId} 余额失败:`, error);
      return 0;
    }
  }

  // ============== 分组管理 (Group) ==============

  /**
   * 获取所有分组
   */
  async getAllGroups(): Promise<Group[]> {
    return this.cachedRequest('groups', '/api/group/');
  }

  /**
   * 获取分组倍率配置
   */
  async getGroupRates(): Promise<RateConfig[]> {
    const groups = await this.getAllGroups();
    return groups.map(g => ({
      groupId: g.id,
      groupName: g.name,
      modelRates: [], // 需要单独获取每个分组的模型倍率
    }));
  }

  /**
   * 获取特定分组的模型倍率
   */
  async getGroupModelRates(groupId: string): Promise<RateConfig> {
    return this.request(`/api/group/${groupId}/rates`);
  }

  // ============== 令牌管理 (Token) ==============

  /**
   * 获取所有令牌
   */
  async getAllTokens(): Promise<TokenUsage[]> {
    return this.cachedRequest('tokens', '/api/token/');
  }

  /**
   * 获取令牌使用情况
   */
  async getTokenUsage(tokenId?: number): Promise<{
    tokens: TokenUsage[];
    totalUsed: number;
    totalRemain: number;
  }> {
    const tokens = await this.getAllTokens();
    
    if (tokenId) {
      const token = tokens.find(t => t.id === tokenId);
      if (token) {
        return {
          tokens: [token],
          totalUsed: token.usedQuota,
          totalRemain: token.unlimitedQuota ? Infinity : token.remainQuota,
        };
      }
    }

    const totalUsed = tokens.reduce((sum, t) => sum + t.usedQuota, 0);
    const totalRemain = tokens.reduce((sum, t) => 
      sum + (t.unlimitedQuota ? 0 : t.remainQuota), 0
    );

    return { tokens, totalUsed, totalRemain };
  }

  /**
   * 获取令牌消费统计
   */
  async getTokenConsumptionStats(
    startDate?: string,
    endDate?: string
  ): Promise<UsageStatistics[]> {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    
    return this.request(`/api/token/stats?${params.toString()}`);
  }

  // ============== 模型管理 (Model) ==============

  /**
   * 获取所有模型元数据
   */
  async getAllModels(): Promise<ModelMetadata[]> {
    return this.cachedRequest('models', '/api/model/');
  }

  /**
   * 获取模型详情
   */
  async getModelDetails(modelId: string): Promise<ModelMetadata> {
    return this.request(`/api/model/${modelId}`);
  }

  // ============== 定价信息 (Pricing) ==============

  /**
   * 获取所有定价信息
   */
  async getAllPricing(): Promise<PricingConfig[]> {
    return this.cachedRequest('pricing', '/api/pricing');
  }

  /**
   * 获取特定模型的定价
   */
  async getModelPricing(modelId: string): Promise<PricingConfig | null> {
    const pricing = await this.getAllPricing();
    return pricing.find(p => p.modelId === modelId) || null;
  }

  /**
   * 获取倍率配置 (包含分组倍率和模型倍率)
   */
  async getRateConfig(): Promise<{
    groups: Group[];
    models: ModelMetadata[];
    rates: RateConfig[];
  }> {
    const [groups, models, pricing] = await Promise.all([
      this.getAllGroups(),
      this.getAllModels(),
      this.getAllPricing(),
    ]);

    const rates: RateConfig[] = groups.map(g => ({
      groupId: g.id,
      groupName: g.name,
      modelRates: pricing
        .filter(p => p.groupRatio === g.ratio)
        .map(p => ({
          modelId: p.modelId,
          rate: p.groupRatio,
        })),
    }));

    return { groups, models, rates };
  }

  // ============== 综合统计 ==============

  /**
   * 获取完整的使用统计
   * 包含: 令牌使用、模型消耗、分组统计
   */
  async getFullStatistics(
    startDate?: string,
    endDate?: string
  ): Promise<{
    tokenUsage: { tokens: TokenUsage[]; totalUsed: number; totalRemain: number };
    modelStats: UsageStatistics[];
    groupStats: Record<string, { tokens: number; cost: number }>;
  }> {
    const [tokenUsage, modelStats] = await Promise.all([
      this.getTokenUsage(),
      this.getTokenConsumptionStats(startDate, endDate),
    ]);

    // 按分组统计
    const groupStats: Record<string, { tokens: number; cost: number }> = {};
    modelStats.forEach(stat => {
      const group = stat.groupId || 'default';
      if (!groupStats[group]) {
        groupStats[group] = { tokens: 0, cost: 0 };
      }
      groupStats[group].tokens += stat.tokenCount;
      groupStats[group].cost += stat.cost;
    });

    return { tokenUsage, modelStats, groupStats };
  }

  // ============== 测试连接 ==============

  /**
   * 测试管理 API 连接
   */
  async testConnection(): Promise<{
    success: boolean;
    message: string;
    userInfo?: {
      id: number;
      username: string;
      role: string;
    };
  }> {
    try {
      // 尝试获取当前用户信息来验证令牌
      const userInfo = await this.request<{
        id: number;
        username: string;
        role: string;
      }>('/api/user/self');

      return {
        success: true,
        message: `连接成功！用户: ${userInfo.username} (${userInfo.role})`,
        userInfo,
      };
    } catch (error) {
      if (error instanceof NewApiError) {
        if (error.statusCode === 401) {
          return {
            success: false,
            message: '认证失败：Access Token 无效或已过期',
          };
        }
        return {
          success: false,
          message: `连接失败: ${error.message}`,
        };
      }
      return {
        success: false,
        message: '连接失败：网络错误或服务器无响应',
      };
    }
  }
}

// ============== 单例导出 ==============

let globalService: NewApiManagementService | null = null;

export function getNewApiManagementService(
  config?: NewApiManagementConfig
): NewApiManagementService {
  if (config) {
    globalService = new NewApiManagementService(config);
  }
  if (!globalService) {
    throw new Error('NewApiManagementService 未初始化');
  }
  return globalService;
}

export function initNewApiManagementService(config: NewApiManagementConfig): void {
  globalService = new NewApiManagementService(config);
}

// ============== 辅助函数 ==============

/**
 * 格式化额度显示
 */
export function formatQuota(quota: number): string {
  if (quota === Infinity || quota === -1) {
    return '无限制';
  }
  if (quota >= 1000000) {
    return `${(quota / 1000000).toFixed(2)}M`;
  }
  if (quota >= 1000) {
    return `${(quota / 1000).toFixed(2)}K`;
  }
  return quota.toString();
}

/**
 * 格式化价格显示
 */
export function formatPrice(price: number, currency: string = 'USD'): string {
  if (price === 0) return '免费';
  return `${currency} $${price.toFixed(4)}/M tokens`;
}

/**
 * 获取渠道类型名称
 */
export function getChannelTypeName(type: number): string {
  const types: Record<number, string> = {
    1: 'OpenAI',
    2: 'Azure',
    3: 'Anthropic',
    5: 'Google Gemini',
    6: '百度文心',
    7: '智谱 AI',
    8: '阿里通义',
    14: 'AWS Bedrock',
    15: 'Azure OpenAI',
    17: 'Ollama',
    21: '讯飞星火',
  };
  return types[type] || `类型 ${type}`;
}
