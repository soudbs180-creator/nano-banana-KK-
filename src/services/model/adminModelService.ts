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
  providerName?: string;
  recordId?: string;
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

type AdminModelRouteSelection = {
  baseModelId: string;
  routeIndex: number | null;
  routeKey: string | null;
  hasSystemRouteSuffix: boolean;
};

export type AdminModelRouteSelectionContext = {
  baseModelId: string;
  routeIndex: number | null;
  routeKey: string | null;
  hasSystemRouteSuffix: boolean;
  matchedModels: AdminModelConfig[];
  mixedModels: AdminModelConfig[];
  mixedEligibleModels: AdminModelConfig[];
  exactModel: AdminModelConfig | null;
  useMixedRouting: boolean;
};

type ResolvedAdminModelRoute = {
  model: AdminModelConfig;
  creditCost: number;
  usedQualityPricing: boolean;
};

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
              providerName: (row.provider_name || providerId).trim(),
              recordId: row.id?.trim(),
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

  private parseRouteSelection(modelId: string): AdminModelRouteSelection {
    const rawId = String(modelId || '').trim();
    const parts = rawId.split('@');
    const baseModelId = (parts[0] || rawId).trim();
    const suffix = String(parts[1] || '').trim().toLowerCase();
    const systemMatch = suffix.match(/^system(?:_(.+))?$/);

    if (!systemMatch) {
      return {
        baseModelId,
        routeIndex: null,
        routeKey: null,
        hasSystemRouteSuffix: false,
      };
    }

    const rawRouteToken = String(systemMatch[1] || '').trim();
    if (!rawRouteToken) {
      return {
        baseModelId,
        routeIndex: null,
        routeKey: null,
        hasSystemRouteSuffix: true,
      };
    }

    if (/^\d+$/.test(rawRouteToken)) {
      const parsedIndex = Number(rawRouteToken) - 1;
      return {
        baseModelId,
        routeIndex: Number.isFinite(parsedIndex) && parsedIndex >= 0 ? parsedIndex : 0,
        routeKey: null,
        hasSystemRouteSuffix: true,
      };
    }

    let routeKey = rawRouteToken;
    try {
      routeKey = decodeURIComponent(rawRouteToken);
    } catch {
      routeKey = rawRouteToken;
    }

    return {
      baseModelId,
      routeIndex: null,
      routeKey: routeKey.toLowerCase(),
      hasSystemRouteSuffix: true,
    };
  }

  getRouteSelectionContext(modelId: string, imageSize?: string | null): AdminModelRouteSelectionContext {
    const selection = this.parseRouteSelection(modelId);
    const matchedModels = this.getRouteCandidates(selection.baseModelId);
    const mixedModels = matchedModels.filter((model) => model.mixWithSameModel);
    const mixedEligibleModels = mixedModels.filter((model) =>
      isAdminQualityEnabled(Boolean(model.advancedEnabled), model.qualityPricing, imageSize)
    );
    const exactModelByRouteKey =
      selection.routeKey !== null
        ? matchedModels.find(
            (model) => String(model.providerId || '').trim().toLowerCase() === selection.routeKey
          ) || null
        : null;
    const exactModel =
      exactModelByRouteKey ||
      (selection.routeIndex !== null
        ? matchedModels[selection.routeIndex] || matchedModels[0] || null
        : null);

    return {
      ...selection,
      matchedModels,
      mixedModels,
      mixedEligibleModels,
      exactModel,
      useMixedRouting:
        selection.routeKey === null &&
        (selection.routeIndex === null || selection.routeIndex === 0) &&
        mixedModels.length > 1,
    };
  }

  getModel(modelId: string): AdminModelConfig | undefined {
    const { exactModel, matchedModels } = this.getRouteSelectionContext(modelId);
    if (exactModel) return exactModel;

    const exact = this.models.find((model) => model.id === modelId);
    if (exact) return exact;

    if (matchedModels.length > 0) {
      return matchedModels[0];
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

  private pickRandomCandidate<T>(candidates: T[]): T | null {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const index = Math.floor(Math.random() * candidates.length);
    return candidates[index] ?? candidates[0] ?? null;
  }

  private selectCheapestCandidate(
    candidates: AdminModelConfig[],
    imageSize?: string | null,
    options?: {
      onlyEnabledForRequestedSize?: boolean;
      useBaseCreditCost?: boolean;
    }
  ): ResolvedAdminModelRoute | null {
    if (candidates.length === 0) return null;

    const onlyEnabledForRequestedSize = options?.onlyEnabledForRequestedSize !== false;
    const useBaseCreditCost = options?.useBaseCreditCost === true;

    const scopedCandidates = onlyEnabledForRequestedSize
      ? candidates.filter((model) =>
          isAdminQualityEnabled(Boolean(model.advancedEnabled), model.qualityPricing, imageSize)
        )
      : candidates;

    if (scopedCandidates.length === 0) return null;

    const pricedCandidates = scopedCandidates.map((model) => ({
      model,
      creditCost: useBaseCreditCost
        ? Math.max(1, Number(model.creditCost || 1))
        : getAdminModelCreditCostForSize(
            model.creditCost,
            Boolean(model.advancedEnabled),
            model.qualityPricing,
            imageSize
          ),
      usedQualityPricing: !useBaseCreditCost,
    }));

    const lowestCost = Math.min(...pricedCandidates.map((item) => item.creditCost));
    const cheapestCandidates = pricedCandidates.filter((item) => item.creditCost === lowestCost);
    return this.pickRandomCandidate(cheapestCandidates);
  }

  private getResolvedRoute(
    modelId: string,
    imageSize?: string | null
  ): ResolvedAdminModelRoute | null {
    const context = this.getRouteSelectionContext(modelId, imageSize);
    if (context.matchedModels.length === 0) return null;

    if (context.routeKey) {
      const selected = context.exactModel;
      if (!selected) return null;
      if (
        !isAdminQualityEnabled(Boolean(selected.advancedEnabled), selected.qualityPricing, imageSize)
      ) {
        return null;
      }

      return {
        model: selected,
        creditCost: getAdminModelCreditCostForSize(
          selected.creditCost,
          Boolean(selected.advancedEnabled),
          selected.qualityPricing,
          imageSize
        ),
        usedQualityPricing: Boolean(selected.advancedEnabled),
      };
    }

    if (context.useMixedRouting) {
      const fromRequestedSize = this.selectCheapestCandidate(context.mixedModels, imageSize, {
        onlyEnabledForRequestedSize: true,
        useBaseCreditCost: false,
      });
      if (fromRequestedSize) return fromRequestedSize;

      return this.selectCheapestCandidate(context.mixedModels, imageSize, {
        onlyEnabledForRequestedSize: false,
        useBaseCreditCost: true,
      });
    }

    const selectedModel =
      context.exactModel ||
      context.matchedModels.find((model) =>
        isAdminQualityEnabled(Boolean(model.advancedEnabled), model.qualityPricing, imageSize)
      ) ||
      context.matchedModels[0];

    return {
      model: selectedModel,
      creditCost: getAdminModelCreditCostForSize(
        selectedModel.creditCost,
        Boolean(selectedModel.advancedEnabled),
        selectedModel.qualityPricing,
        imageSize
      ),
      usedQualityPricing: Boolean(selectedModel.advancedEnabled),
    };
  }

  getModelCreditCost(modelId: string, imageSize?: string | null): number {
    return this.getResolvedRoute(modelId, imageSize)?.creditCost ?? 0;
  }

  /**
   * 获取混合模式下选择的最佳供应商ID（用于调试和日志）
   */
  getSelectedProviderForModel(modelId: string, imageSize?: string | null): string | null {
    return this.getResolvedRoute(modelId, imageSize)?.model.providerId ?? null;
  }

  getModelDisplayInfo(modelId: string, imageSize?: string | null) {
    const resolved = this.getResolvedRoute(modelId, imageSize);
    const model = resolved?.model || this.getModel(modelId);
    if (!model) return null;

    return {
      id: model.id,
      name: model.displayName,
      displayName: model.displayName,
      provider: model.provider,
      providerId: model.providerId,
      providerName: model.providerName,
      colorStart: model.colorStart,
      colorEnd: model.colorEnd,
      colorSecondary: model.colorSecondary,
      textColor: model.textColor,
      creditCost: resolved?.creditCost ?? model.creditCost,
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
