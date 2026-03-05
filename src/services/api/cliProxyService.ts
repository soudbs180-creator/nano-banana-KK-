/**
 * CLIProxyAPI 服务
 * 封装 CLIProxyAPI/RouterForMe 代理服务的管理功能
 * 文档: https://help.router-for.me/cn/management/api.html
 */

// CLIProxyAPI 配置接口
export interface CLIProxyConfig {
    id: string;
    name: string;
    baseUrl: string;  // 例如: http://127.0.0.1:8045
    managementKey: string;  // 管理密钥
    isActive: boolean;
    status: 'connected' | 'disconnected' | 'checking' | 'error';
    lastChecked?: string;
    version?: string;
}

// Usage 统计接口
export interface CLIProxyUsage {
    total_requests: number;
    success_count: number;
    failure_count: number;
    total_tokens: number;
    requests_by_day: Record<string, number>;
    requests_by_hour: Record<string, number>;
    tokens_by_day: Record<string, number>;
    tokens_by_hour: Record<string, number>;
    apis: Record<string, APIUsage>;
}

export interface APIUsage {
    total_requests: number;
    total_tokens: number;
    models: Record<string, ModelUsage>;
}

export interface ModelUsage {
    total_requests: number;
    total_tokens: number;
    details: RequestDetail[];
}

export interface RequestDetail {
    timestamp: string;
    source: string;
    auth_index: string;
    tokens: {
        input_tokens: number;
        output_tokens: number;
        reasoning_tokens: number;
        cached_tokens: number;
        total_tokens: number;
    };
    failed: boolean;
}

export interface UsageResponse {
    usage: CLIProxyUsage;
    failed_requests: number;
}

// 存储键
const STORAGE_KEY = 'cliproxy_configs';

class CLIProxyService {
    private configs: CLIProxyConfig[] = [];

    constructor() {
        this.loadConfigs();
    }

    // 加载配置
    private loadConfigs(): void {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                this.configs = JSON.parse(stored);
            }
        } catch (error) {
            console.error('[CLIProxyService] 加载配置失败:', error);
            this.configs = [];
        }
    }

    // 保存配置
    private saveConfigs(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.configs));
        } catch (error) {
            console.error('[CLIProxyService] 保存配置失败:', error);
        }
    }

    // 获取所有配置
    getConfigs(): CLIProxyConfig[] {
        return [...this.configs];
    }

    // 获取激活的配置
    getActiveConfig(): CLIProxyConfig | undefined {
        return this.configs.find(c => c.isActive);
    }

    // 添加配置
    addConfig(config: Omit<CLIProxyConfig, 'id' | 'status'>): CLIProxyConfig {
        const newConfig: CLIProxyConfig = {
            ...config,
            id: Date.now().toString(),
            status: 'checking',
            isActive: this.configs.length === 0,  // 第一个自动激活
        };
        this.configs.push(newConfig);
        this.saveConfigs();
        return newConfig;
    }

    // 删除配置
    removeConfig(id: string): void {
        const index = this.configs.findIndex(c => c.id === id);
        if (index !== -1) {
            const wasActive = this.configs[index].isActive;
            this.configs.splice(index, 1);
            // 如果删除的是激活配置，激活第一个
            if (wasActive && this.configs.length > 0) {
                this.configs[0].isActive = true;
            }
            this.saveConfigs();
        }
    }

    // 更新配置
    updateConfig(id: string, updates: Partial<CLIProxyConfig>): void {
        const index = this.configs.findIndex(c => c.id === id);
        if (index !== -1) {
            this.configs[index] = { ...this.configs[index], ...updates };
            this.saveConfigs();
        }
    }

    // 设置激活配置
    setActive(id: string): void {
        this.configs.forEach(c => {
            c.isActive = c.id === id;
        });
        this.saveConfigs();
    }

    // 构建请求头
    private buildHeaders(managementKey: string): HeadersInit {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${managementKey}`,
            'X-Management-Key': managementKey,
        };
    }

    // 测试连接 - 支持标准 OpenAI 代理和 CLIProxyAPI
    async testConnection(config: CLIProxyConfig): Promise<{ success: boolean; message: string; version?: string; hasManagementApi?: boolean }> {
        try {
            // 第一步：尝试标准 OpenAI /v1/models 端点（所有代理都支持）
            const modelsResponse = await fetch(`${config.baseUrl}/v1/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${config.managementKey}`,
                    'Content-Type': 'application/json',
                },
            });

            if (modelsResponse.ok) {
                // 连接成功，检查是否支持管理API
                let hasManagementApi = false;
                let version: string | undefined;

                try {
                    const usageResponse = await fetch(`${config.baseUrl}/v0/management/usage`, {
                        method: 'GET',
                        headers: this.buildHeaders(config.managementKey),
                    });
                    hasManagementApi = usageResponse.ok;

                    if (hasManagementApi) {
                        // 尝试获取版本
                        const versionResponse = await fetch(`${config.baseUrl}/v0/management/version`, {
                            method: 'GET',
                            headers: this.buildHeaders(config.managementKey),
                        });
                        if (versionResponse.ok) {
                            const versionData = await versionResponse.json();
                            version = versionData.version || versionData.latest_version;
                        }
                    }
                } catch {
                    // 管理API不可用，但代理连接正常
                }

                this.updateConfig(config.id, {
                    status: 'connected',
                    lastChecked: new Date().toISOString(),
                    version
                });
                return {
                    success: true,
                    message: hasManagementApi ? '连接成功（支持管理API）' : '连接成功',
                    version,
                    hasManagementApi
                };
            } else if (modelsResponse.status === 401 || modelsResponse.status === 403) {
                this.updateConfig(config.id, { status: 'error', lastChecked: new Date().toISOString() });
                return { success: false, message: '认证失败，请检查API密钥' };
            } else {
                this.updateConfig(config.id, { status: 'error', lastChecked: new Date().toISOString() });
                return { success: false, message: `连接失败: ${modelsResponse.status} ${modelsResponse.statusText}` };
            }
        } catch (error) {
            this.updateConfig(config.id, { status: 'disconnected', lastChecked: new Date().toISOString() });
            return { success: false, message: `网络错误: ${error instanceof Error ? error.message : '未知错误'}` };
        }
    }

    // 获取 Usage 统计
    async getUsage(configId?: string): Promise<UsageResponse | null> {
        const config = configId
            ? this.configs.find(c => c.id === configId)
            : this.getActiveConfig();

        if (!config) {
            console.warn('[CLIProxyService] 未找到配置');
            return null;
        }

        try {
            const response = await fetch(`${config.baseUrl}/v0/management/usage`, {
                method: 'GET',
                headers: this.buildHeaders(config.managementKey),
            });

            if (response.ok) {
                return await response.json();
            } else {
                console.error('[CLIProxyService] 获取 Usage 失败:', response.status);
                return null;
            }
        } catch (error) {
            console.error('[CLIProxyService] 获取 Usage 错误:', error);
            return null;
        }
    }

    // 导出 Usage 统计
    async exportUsage(configId?: string): Promise<{ version: number; exported_at: string; usage: CLIProxyUsage } | null> {
        const config = configId
            ? this.configs.find(c => c.id === configId)
            : this.getActiveConfig();

        if (!config) return null;

        try {
            const response = await fetch(`${config.baseUrl}/v0/management/usage/export`, {
                method: 'GET',
                headers: this.buildHeaders(config.managementKey),
            });

            if (response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            console.error('[CLIProxyService] 导出 Usage 错误:', error);
            return null;
        }
    }

    // 获取代理服务器 URL（用于 API 调用）
    getProxyUrl(configId?: string): string | null {
        const config = configId
            ? this.configs.find(c => c.id === configId)
            : this.getActiveConfig();

        if (!config) return null;
        return `${config.baseUrl}/v1`;
    }

    // 获取可用的 API Key（用于代理请求）
    getProxyApiKey(configId?: string): string | null {
        const config = configId
            ? this.configs.find(c => c.id === configId)
            : this.getActiveConfig();

        if (!config) return null;
        // CLIProxyAPI 使用管理密钥或专用的代理 API Key
        return config.managementKey;
    }
}

// 导出单例
export const cliProxyService = new CLIProxyService();

// 便捷方法
export const getProxyUrl = () => cliProxyService.getProxyUrl();
export const getProxyApiKey = () => cliProxyService.getProxyApiKey();
