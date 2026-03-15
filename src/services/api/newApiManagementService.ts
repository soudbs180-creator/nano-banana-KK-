import {
    NewApiManagementService as BillingNewApiManagementService,
    type Channel,
    type PricingConfig,
    type TokenUsage,
} from '../billing/newApiManagementService';

const DEFAULT_BASE_URL = 'https://ai.newapi.pro';

export interface NewAPIChannel {
    id: number;
    type: number;
    name: string;
    models: string;
    key: string;
    base_url?: string;
    status: number;
    priority: number;
    weight: number;
}

export interface NewAPIModel {
    id: string;
    displayName: string;
    billingType: 'token' | 'per_request' | 'multiplier';
    inputPrice?: number;
    outputPrice?: number;
    perRequestPrice?: number;
    multiplier?: number;
    group?: string;
}

export interface NewAPIToken {
    id: number;
    name: string;
    key: string;
    created_time: number;
    expired_time?: number;
    remain_quota: number;
    unlimited_quota: boolean;
}

function formatModelName(id: string): string {
    return String(id || '')
        .split('/')
        .pop()!
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (match) => match.toUpperCase());
}

function createService(baseUrl: string, accessToken: string): BillingNewApiManagementService {
    return new BillingNewApiManagementService({
        baseUrl: (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, ''),
        accessToken,
    });
}

function extractModelIds(channel: Channel): string[] {
    const models = (channel as any)?.models;
    if (Array.isArray(models)) {
        return models.map((item) => String(item || '').trim()).filter(Boolean);
    }
    return String(models || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

class NewApiManagementFacade {
    async verifyAccessToken(accessToken: string, baseUrl?: string): Promise<{
        success: boolean;
        data?: {
            quota: number;
            usage: number;
            remain_quota: number;
        };
        error?: string;
    }> {
        const cleanBaseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');

        try {
            const dashboardResponse = await fetch(`${cleanBaseUrl}/api/user/dashboard`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!dashboardResponse.ok) {
                const errorText = await dashboardResponse.text().catch(() => '');
                return {
                    success: false,
                    error: errorText || `Token verification failed: ${dashboardResponse.status}`,
                };
            }

            const dashboardData = await dashboardResponse.json().catch(() => ({}));
            return {
                success: true,
                data: dashboardData?.data,
            };
        } catch (error: any) {
            const result = await createService(cleanBaseUrl, accessToken).testConnection().catch(() => null);
            if (result?.success) {
                return { success: true };
            }
            return {
                success: false,
                error: error?.message || result?.message || 'Token verification failed',
            };
        }
    }

    async listChannels(accessToken: string, baseUrl?: string): Promise<NewAPIChannel[]> {
        const channels = await createService(baseUrl || DEFAULT_BASE_URL, accessToken).getAllChannels();
        return channels.map((channel) => ({
            id: channel.id,
            type: channel.type,
            name: channel.name,
            models: extractModelIds(channel).join(','),
            key: channel.key,
            base_url: channel.baseUrl,
            status: channel.status,
            priority: channel.priority || 0,
            weight: channel.weight || 0,
        }));
    }

    async listTokens(accessToken: string, baseUrl?: string): Promise<NewAPIToken[]> {
        const tokens = await createService(baseUrl || DEFAULT_BASE_URL, accessToken).getAllTokens();
        return tokens.map((token: TokenUsage) => ({
            id: token.id,
            name: token.name,
            key: token.key,
            created_time: token.createdTime,
            expired_time: token.expiredTime,
            remain_quota: token.remainQuota,
            unlimited_quota: token.unlimitedQuota,
        }));
    }

    async getPricing(accessToken: string, baseUrl?: string): Promise<PricingConfig[]> {
        return createService(baseUrl || DEFAULT_BASE_URL, accessToken).getAllPricing();
    }

    async fetchAdminModels(accessToken: string, baseUrl?: string): Promise<NewAPIModel[]> {
        const service = createService(baseUrl || DEFAULT_BASE_URL, accessToken);
        const [channels, pricing] = await Promise.all([
            service.getAllChannels(),
            service.getAllPricing().catch(() => [] as PricingConfig[]),
        ]);

        const pricingMap = new Map<string, PricingConfig>();
        pricing.forEach((item) => {
            pricingMap.set(item.modelId, item);
        });

        const modelMap = new Map<string, NewAPIModel>();
        channels.forEach((channel) => {
            extractModelIds(channel).forEach((modelId) => {
                if (modelMap.has(modelId)) return;

                const pricingItem = pricingMap.get(modelId);
                modelMap.set(modelId, {
                    id: modelId,
                    displayName: pricingItem?.modelName || formatModelName(modelId),
                    billingType: pricingItem?.type === 'times'
                        ? 'per_request'
                        : pricingItem?.groupRatio && pricingItem.groupRatio !== 1
                            ? 'multiplier'
                            : 'token',
                    inputPrice: pricingItem?.inputPrice,
                    outputPrice: pricingItem?.outputPrice,
                    perRequestPrice: pricingItem?.type === 'times' ? pricingItem.inputPrice : undefined,
                    multiplier: pricingItem?.groupRatio,
                    group: (channel as any)?.group || channel.name,
                });
            });
        });

        return Array.from(modelMap.values());
    }
}

export const newApiManagementService = new NewApiManagementFacade();
