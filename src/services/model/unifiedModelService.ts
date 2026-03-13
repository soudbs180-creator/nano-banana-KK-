/**
 * Unified Model Service
 *
 * Mirrors the source-aware model list produced by keyManager so
 * admin credit models and user-owned models can coexist even when
 * they share the same base provider/model id.
 */

import { keyManager } from '../auth/keyManager';
import { adminModelService } from './adminModelService';

export type ModelType = 'chat' | 'image' | 'video' | 'audio' | 'image+chat';

export interface UnifiedModel {
  id: string;
  name: string;
  provider: string;
  type: ModelType;
  isCustom: boolean;
  isSystemInternal?: boolean;
  isAdminModel?: boolean;
  description?: string;
  icon?: string;
  colorStart?: string;
  colorEnd?: string;
  creditCost?: number;
  billingType?: 'token' | 'per_request' | 'multiplier';
  advantages?: string;
  endpoint?: string;
}

type GlobalModelEntry = ReturnType<typeof keyManager.getGlobalModelList>[number];

class UnifiedModelService {
  private models: UnifiedModel[] = [];
  private listeners: Array<() => void> = [];
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    keyManager.subscribe(() => {
      void this.refreshModels();
    });

    this.loadFromLocalCache();
    setTimeout(() => {
      void this.refreshModels();
    }, 0);

    this.initialized = true;
  }

  private loadFromLocalCache(): void {
    try {
      this.models = this.mapGlobalModels(keyManager.getGlobalModelList());
      this.notifyListeners();
      console.log('[UnifiedModelService] Loaded models from global cache:', this.models.length);
    } catch (error) {
      console.error('[UnifiedModelService] Failed to load local cache:', error);
    }
  }

  async refreshModels(): Promise<void> {
    await adminModelService.loadAdminModels();
    this.models = this.mapGlobalModels(keyManager.getGlobalModelList());
    this.notifyListeners();
  }

  getModels(): UnifiedModel[] {
    return this.models;
  }

  getModelsByType(type: ModelType): UnifiedModel[] {
    return this.models.filter((model) => model.type === type);
  }

  getModel(id: string): UnifiedModel | undefined {
    return this.models.find((model) => model.id === id);
  }

  isCreditBasedModel(id: string): boolean {
    if (adminModelService.isAdminModel(id)) {
      return true;
    }

    const model = this.getModel(id);
    return model?.isSystemInternal === true || model?.isAdminModel === true;
  }

  getCreditCost(id: string): number {
    const adminModel = adminModelService.getModel(id);
    if (adminModel) {
      return adminModel.creditCost;
    }

    const lowerId = id.toLowerCase();
    if (
      (lowerId.includes('pro') && lowerId.includes('banana')) ||
      (lowerId.includes('pro') &&
        lowerId.includes('gemini') &&
        (lowerId.includes('image') || lowerId.includes('preview')))
    ) {
      return 2;
    }
    if (
      lowerId.includes('banana') ||
      (lowerId.includes('gemini') &&
        (lowerId.includes('image') || lowerId.includes('preview')))
    ) {
      return 1;
    }

    return 0;
  }

  getModelColors(id: string): { start: string; end: string } | null {
    const adminModel = adminModelService.getModel(id);
    if (adminModel) {
      return {
        start: adminModel.colorStart,
        end: adminModel.colorEnd,
      };
    }
    return null;
  }

  subscribe(callback: () => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((listener) => listener !== callback);
    };
  }

  private mapGlobalModels(models: GlobalModelEntry[]): UnifiedModel[] {
    const modelMap = new Map<string, UnifiedModel>();

    models.forEach((model) => {
      if (!modelMap.has(model.id)) {
        modelMap.set(model.id, this.convertGlobalModel(model));
      }
    });

    return Array.from(modelMap.values());
  }

  private convertGlobalModel(model: GlobalModelEntry): UnifiedModel {
    const adminModel = model.isSystemInternal ? adminModelService.getModel(model.id) : undefined;

    return {
      id: model.id,
      name: model.name,
      provider: model.provider,
      type: model.type as ModelType,
      isCustom: model.isCustom ?? false,
      isSystemInternal: model.isSystemInternal === true,
      isAdminModel: model.isSystemInternal === true,
      description: model.description,
      icon: model.icon,
      colorStart: model.colorStart ?? adminModel?.colorStart,
      colorEnd: model.colorEnd ?? adminModel?.colorEnd,
      creditCost: model.creditCost ?? adminModel?.creditCost,
      billingType: adminModel?.billingType,
      advantages: adminModel?.advantages,
      endpoint: adminModel?.endpoint,
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((callback) => callback());
  }
}

export const unifiedModelService = new UnifiedModelService();
