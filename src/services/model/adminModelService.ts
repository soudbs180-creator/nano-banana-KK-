import { supabase } from '../../lib/supabase';

function darkenColor(hex: string, percent: number): string {
  const hslMatch = hex.match(/hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/i);
  if (hslMatch) {
    const h = parseInt(hslMatch[1], 10);
    const s = parseInt(hslMatch[2], 10);
    const l = Math.max(0, Math.floor((parseInt(hslMatch[3], 10) * (100 - percent)) / 100));
    return `hsl(${h}, ${s}%, ${l}%)`;
  }

  if (!hex.startsWith('#')) return hex;

  let color = hex.replace('#', '');
  if (color.length === 3) {
    color = color
      .split('')
      .map((item) => item + item)
      .join('');
  }

  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  const factor = (100 - percent) / 100;

  const nr = Math.max(0, Math.floor(r * factor));
  const ng = Math.max(0, Math.floor(g * factor));
  const nb = Math.max(0, Math.floor(b * factor));

  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb
    .toString(16)
    .padStart(2, '0')}`;
}

export interface AdminModelConfig {
  id: string;
  displayName: string;
  provider: string;
  colorStart: string;
  colorEnd: string;
  creditCost: number;
  billingType: 'token' | 'per_request' | 'multiplier';
  endpoint: string;
  advantages?: string;
  isSystemModel: boolean;
  isSystemInternal?: boolean;
}

export interface AdminProvider {
  id: string;
  providerId: string;
  name: string;
  baseUrl: string;
  apiKeys: string[];
  models: AdminModelConfig[];
}

interface FlatModelRow {
  id?: string;
  provider_id?: string;
  provider_name?: string;
  base_url?: string;
  api_keys?: string[] | null;
  model_id?: string;
  display_name?: string;
  description?: string | null;
  color?: string | null;
  endpoint_type?: string | null;
  credit_cost?: number | null;
  is_active?: boolean | null;
}

class AdminModelService {
  private providers: AdminProvider[] = [];
  private models: AdminModelConfig[] = [];
  private listeners: Array<() => void> = [];
  private loadingPromise: Promise<void> | null = null;
  private lastLoadAttemptAt = 0;

  private static readonly LOAD_RETRY_INTERVAL_MS = 15000;

  async loadAdminModels(force = false): Promise<void> {
    const now = Date.now();

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    if (!force && now - this.lastLoadAttemptAt < AdminModelService.LOAD_RETRY_INTERVAL_MS) {
      return;
    }

    this.lastLoadAttemptAt = now;
    return this.doLoad();
  }

  async forceLoadAdminModels(): Promise<void> {
    return this.loadAdminModels(true);
  }

  private async readFromView(): Promise<FlatModelRow[] | null> {
    const result = await supabase
      .from('public_credit_models')
      // Keep this list minimal for cross-version compatibility.
      .select('provider_id, model_id, display_name, endpoint_type, credit_cost, is_active')
      .order('provider_id', { ascending: true });

    if (result.error || !Array.isArray(result.data)) {
      return null;
    }

    return result.data as FlatModelRow[];
  }

  private async readFromRpc(): Promise<FlatModelRow[]> {
    const rpcResult = await supabase.rpc('get_active_credit_models');
    if (rpcResult.error) {
      throw rpcResult.error;
    }

    const grouped = (rpcResult.data || []) as Array<{
      provider_id: string;
      provider_name: string;
      base_url: string;
      api_keys: string[] | null;
      models: Array<any>;
    }>;

    return grouped.flatMap((provider) =>
      (provider.models || []).map((model) => ({
        id: model.id,
        provider_id: provider.provider_id,
        provider_name: provider.provider_name,
        base_url: provider.base_url,
        api_keys: provider.api_keys || [],
        model_id: model.model_id,
        display_name: model.display_name,
        description: model.description,
        color: model.color,
        endpoint_type: model.endpoint_type,
        credit_cost: model.credit_cost,
        is_active: true,
      }))
    );
  }

  private normalizeColor(input?: string | null): { colorStart: string; colorEnd: string } {
    let color = (input || '#3B82F6').trim();

    if (/^[A-Fa-f0-9]{3,8}$/.test(color)) {
      color = `#${color}`;
    }

    const colorStart = color;
    const colorEnd = darkenColor(color, 20);
    return { colorStart, colorEnd };
  }

  private async doLoad(): Promise<void> {
    this.loadingPromise = (async () => {
      try {
        const fromView = await this.readFromView();
        let rows: FlatModelRow[] = fromView || [];

        if (!rows || rows.length === 0) {
          try {
            rows = await this.readFromRpc();
          } catch (rpcError) {
            console.warn('[AdminModelService] RPC fallback unavailable:', rpcError);
            rows = [];
          }
        }

        const grouped = new Map<string, AdminProvider>();

        rows
          .filter((row) => row.is_active !== false)
          .forEach((row) => {
            const providerId = (row.provider_id || '').trim();
            const modelId = (row.model_id || '').trim();
            if (!providerId || !modelId) return;

            if (!grouped.has(providerId)) {
              grouped.set(providerId, {
                id: providerId,
                providerId,
                name: (row.provider_name || providerId).trim(),
                baseUrl: (row.base_url || '').trim(),
                apiKeys: (row.api_keys || []).filter(Boolean) as string[],
                models: [],
              });
            }

            const provider = grouped.get(providerId)!;
            const colors = this.normalizeColor(row.color);

            provider.models.push({
              id: modelId,
              displayName: (row.display_name || modelId).trim(),
              provider: providerId,
              colorStart: colors.colorStart,
              colorEnd: colors.colorEnd,
              creditCost: Number(row.credit_cost || 0),
              billingType: 'token',
              endpoint: (row.endpoint_type || 'openai').trim(),
              advantages: row.description || '',
              isSystemModel: true,
              isSystemInternal: true,
            });
          });

        this.providers = Array.from(grouped.values());

        const dedupe = new Map<string, AdminModelConfig>();
        this.providers.forEach((provider) => {
          provider.models.forEach((model) => {
            const key = `${provider.providerId}|${model.id}`;
            if (!dedupe.has(key)) {
              dedupe.set(key, model);
            }
          });
        });

        this.models = Array.from(dedupe.values());

        const { keyManager } = await import('../auth/keyManager');
        keyManager.clearGlobalModelListCache?.();
        keyManager.forceNotify?.();

        this.notifyListeners();
      } catch (error) {
        console.error('[AdminModelService] 加载管理员模型失败:', error);
      } finally {
        this.loadingPromise = null;
      }
    })();

    return this.loadingPromise;
  }

  getModels(): AdminModelConfig[] {
    return this.models;
  }

  getModelsByProvider(providerId: string): AdminModelConfig[] {
    return this.models.filter((model) => model.provider === providerId);
  }

  getModel(modelId: string): AdminModelConfig | undefined {
    // 1. 精确匹配
    const exact = this.models.find((model) => model.id === modelId);
    if (exact) return exact;

    // 2. 去掉 @后缀 再匹配（如 gemini-xxx@system -> gemini-xxx）
    const baseId = modelId.split('@')[0];
    if (baseId !== modelId) {
      return this.models.find((model) => model.id === baseId);
    }

    return undefined;
  }

  getProvider(providerId: string): AdminProvider | undefined {
    return this.providers.find((provider) => provider.providerId === providerId);
  }

  getProviders(): AdminProvider[] {
    return this.providers;
  }

  isAdminModel(modelId: string): boolean {
    return !!this.getModel(modelId);
  }

  getModelCreditCost(modelId: string): number {
    return this.getModel(modelId)?.creditCost || 0;
  }

  getModelDisplayInfo(modelId: string) {
    const model = this.getModel(modelId);
    if (!model) return null;

    return {
      id: model.id,
      name: model.displayName,
      provider: model.provider,
      colorStart: model.colorStart,
      colorEnd: model.colorEnd,
      creditCost: model.creditCost,
      billingType: model.billingType,
      advantages: model.advantages,
      isSystemModel: true,
    };
  }

  subscribe(callback: () => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((listener) => listener !== callback);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener());
  }
}

export const adminModelService = new AdminModelService();
