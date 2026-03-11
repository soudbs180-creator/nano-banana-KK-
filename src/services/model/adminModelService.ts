import { supabase } from '../../lib/supabase';

import {
  type AdminModelQualityPricing,
  getAdminModelCreditCostForSize,
  isAdminQualityEnabled,
  normalizeAdminQualityPricing,
} from './adminModelQuality';

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
  providerId?: string;
  priority?: number;
  weight?: number;
  callCount?: number;
  colorStart: string;
  colorEnd: string;
  colorSecondary?: string;
  textColor?: 'white' | 'black';
  creditCost: number;
  advancedEnabled?: boolean;
  mixWithSameModel?: boolean;
  qualityPricing?: AdminModelQualityPricing;
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
  models: AdminModelConfig[];
}

interface FlatModelRow {
  id?: string;
  provider_id?: string;
  provider_name?: string;
  model_id?: string;
  display_name?: string;
  description?: string | null;
  color?: string | null;
  color_secondary?: string | null;
  text_color?: string | null;
  endpoint_type?: string | null;
  credit_cost?: number | null;
  priority?: number | null;
  weight?: number | null;
  is_active?: boolean | null;
  call_count?: number | null;
  advanced_enabled?: boolean | null;
  mix_with_same_model?: boolean | null;
  quality_pricing?: Record<string, any> | null;
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

  private async readFromRpc(): Promise<FlatModelRow[]> {
    const rpcResult = await supabase.rpc('get_active_credit_models');
    if (rpcResult.error) {
      throw rpcResult.error;
    }

    const grouped = (rpcResult.data || []) as Array<{
      provider_id: string;
      provider_name: string;
      models: Array<any>;
    }>;

    return grouped.flatMap((provider) =>
      (provider.models || []).map((model) => ({
        id: model.id,
        provider_id: provider.provider_id,
        provider_name: provider.provider_name,
        model_id: model.model_id,
        display_name: model.display_name,
        description: model.description,
        color: model.color,
        color_secondary: model.color_secondary,
        text_color: model.text_color,
        endpoint_type: model.endpoint_type,
        credit_cost: model.credit_cost,
        priority: model.priority,
        weight: model.weight,
        call_count: model.call_count,
        is_active: true,
        advanced_enabled: model.advanced_enabled,
        mix_with_same_model: model.mix_with_same_model,
        quality_pricing: model.quality_pricing,
      }))
    );
  }

  private normalizeHexColor(input?: string | null, fallback = '#3B82F6'): string {
    let color = (input || fallback).trim();

    if (/^[A-Fa-f0-9]{3,8}$/.test(color)) {
      color = `#${color}`;
    }

    return color;
  }

  private normalizeStyle(
    primary?: string | null,
    secondary?: string | null
  ): { colorStart: string; colorEnd: string; colorSecondary: string } {
    const colorStart = this.normalizeHexColor(primary, '#3B82F6');
    const secondaryRaw = secondary ? this.normalizeHexColor(secondary, colorStart) : '';
    const colorEnd = secondaryRaw || darkenColor(colorStart, 20);
    const colorSecondary = secondaryRaw || colorEnd;
    return { colorStart, colorEnd, colorSecondary };
  }

  private normalizeTextColor(input?: string | null): 'white' | 'black' {
    return input === 'black' ? 'black' : 'white';
  }

  private async doLoad(): Promise<void> {
    this.loadingPromise = (async () => {
      try {
        const rows: FlatModelRow[] = await this.readFromRpc();

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
                models: [],
              });
            }

            const provider = grouped.get(providerId)!;
            const style = this.normalizeStyle(row.color, row.color_secondary);

            provider.models.push({
              id: modelId,
              displayName: (row.display_name || modelId).trim(),
              provider: providerId,
              providerId,
              priority: Number(row.priority || 0),
              weight: Number(row.weight || 0),
              callCount: Number(row.call_count || 0),
              colorStart: style.colorStart,
              colorEnd: style.colorEnd,
              colorSecondary: style.colorSecondary,
              textColor: this.normalizeTextColor(row.text_color),
              creditCost: Number(row.credit_cost || 0),
              advancedEnabled: Boolean(row.advanced_enabled),
              mixWithSameModel: Boolean(row.mix_with_same_model),
              qualityPricing: normalizeAdminQualityPricing(row.quality_pricing, Number(row.credit_cost || 1)),
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

  private sortModelsByRoutePriority(models: AdminModelConfig[]): AdminModelConfig[] {
    return [...models].sort((left, right) => {
      const priorityDiff = Number(right.priority || 0) - Number(left.priority || 0);
      if (priorityDiff !== 0) return priorityDiff;

      const weightDiff = Number(right.weight || 0) - Number(left.weight || 0);
      if (weightDiff !== 0) return weightDiff;

      const providerDiff = String(left.provider || '').localeCompare(String(right.provider || ''));
      if (providerDiff !== 0) return providerDiff;

      return String(left.id || '').localeCompare(String(right.id || ''));
    });
  }

  getRouteCandidates(modelId: string): AdminModelConfig[] {
    const baseId = modelId.split('@')[0];
    return this.sortModelsByRoutePriority(this.models.filter((model) => model.id === baseId));
  }

  /**
   * 基于用量平衡的路由选择
   * 优先选择调用次数最少的供应商，实现API用量均衡
   */
  private selectBalancedProvider(
    candidates: AdminModelConfig[],
    imageSize?: string | null
  ): AdminModelConfig | null {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // 过滤出支持当前画质的候选
    const eligibleCandidates = candidates.filter((model) =>
      isAdminQualityEnabled(Boolean(model.advancedEnabled), model.qualityPricing, imageSize)
    );

    if (eligibleCandidates.length === 0) return null;

    // 按调用次数升序排序，优先选择用量最少的
    const sorted = [...eligibleCandidates].sort((a, b) => {
      const countA = a.callCount ?? 0;
      const countB = b.callCount ?? 0;
      if (countA !== countB) return countA - countB;

      // 如果调用次数相同，按价格优先
      const costA = getAdminModelCreditCostForSize(
        a.creditCost,
        Boolean(a.advancedEnabled),
        a.qualityPricing,
        imageSize
      );
      const costB = getAdminModelCreditCostForSize(
        b.creditCost,
        Boolean(b.advancedEnabled),
        b.qualityPricing,
        imageSize
      );
      if (costA !== costB) return costA - costB;

      // 最后按权重
      return (b.weight ?? 1) - (a.weight ?? 1);
    });

    return sorted[0];
  }

  getModelCreditCost(modelId: string, imageSize?: string | null): number {
    const matchedModels = this.getRouteCandidates(modelId);
    if (matchedModels.length === 0) return 0;

    const mixedCandidates = matchedModels.filter(
      (model) =>
        model.mixWithSameModel &&
        isAdminQualityEnabled(Boolean(model.advancedEnabled), model.qualityPricing, imageSize)
    );

    // 混合模式：基于用量平衡选择
    if (mixedCandidates.length > 1) {
      const selected = this.selectBalancedProvider(mixedCandidates, imageSize);
      if (selected) {
        return getAdminModelCreditCostForSize(
          selected.creditCost,
          Boolean(selected.advancedEnabled),
          selected.qualityPricing,
          imageSize
        );
      }
    }

    const selectedModel =
      matchedModels.find((model) =>
        isAdminQualityEnabled(Boolean(model.advancedEnabled), model.qualityPricing, imageSize)
      ) || matchedModels[0];

    return getAdminModelCreditCostForSize(
      selectedModel.creditCost,
      Boolean(selectedModel.advancedEnabled),
      selectedModel.qualityPricing,
      imageSize
    );
  }

  /**
   * 获取混合模式下选择的最佳供应商ID（用于调试和日志）
   */
  getSelectedProviderForModel(modelId: string, imageSize?: string | null): string | null {
    const matchedModels = this.getRouteCandidates(modelId);
    if (matchedModels.length === 0) return null;

    const mixedCandidates = matchedModels.filter(
      (model) =>
        model.mixWithSameModel &&
        isAdminQualityEnabled(Boolean(model.advancedEnabled), model.qualityPricing, imageSize)
    );

    if (mixedCandidates.length > 1) {
      const selected = this.selectBalancedProvider(mixedCandidates, imageSize);
      return selected?.providerId ?? null;
    }

    const selectedModel =
      matchedModels.find((model) =>
        isAdminQualityEnabled(Boolean(model.advancedEnabled), model.qualityPricing, imageSize)
      ) || matchedModels[0];

    return selectedModel?.providerId ?? null;
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
      colorSecondary: model.colorSecondary,
      textColor: model.textColor,
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
