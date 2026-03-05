/**
 * Unified Model Service
 * 
 * Combines:
 * 1. User's own API keys (from keyManager)
 * 2. Admin configured models (from Supabase)
 * 
 * Provides a single source of truth for all available models
 */

import { keyManager } from '../auth/keyManager';
import { adminModelService, AdminModelConfig } from './adminModelService';
import { MODEL_REGISTRY } from './modelRegistry';

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

class UnifiedModelService {
  private models: UnifiedModel[] = [];
  private listeners: (() => void)[] = [];
  private initialized = false;

  /**
   * Initialize and load all models
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Subscribe to keyManager changes
    keyManager.subscribe(() => {
      this.refreshModels();
    });
    
    // 🚀 优化：立即加载本地数据，不等待网络
    this.loadFromLocalCache();
    
    // 🚀 然后异步加载云端数据
    setTimeout(() => this.refreshModels(), 0);
    
    this.initialized = true;
  }

  /**
   * Load models from local cache for fast startup
   */
  private loadFromLocalCache(): void {
    try {
      // 从 keyManager 获取用户模型（本地缓存）
      const userModels = keyManager.getGlobalModelList();
      
      const modelMap = new Map<string, UnifiedModel>();
      
      for (const userModel of userModels) {
        modelMap.set(userModel.id, this.convertUserModel(userModel));
      }
      
      this.models = Array.from(modelMap.values());
      this.notifyListeners();
      console.log('[UnifiedModelService] 从本地缓存加载了', this.models.length, '个模型');
    } catch (e) {
      console.error('[UnifiedModelService] 本地缓存加载失败:', e);
    }
  }

  /**
   * Refresh model list from all sources
   */
  async refreshModels(): Promise<void> {
    // 1. Load admin configured models
    await adminModelService.loadAdminModels();
    const adminModels = adminModelService.getModels();

    // 2. Get user's own API models
    const userModels = keyManager.getGlobalModelList();

    // 3. Merge models
    const modelMap = new Map<string, UnifiedModel>();

    // Add admin models first (so they take precedence)
    for (const adminModel of adminModels) {
      modelMap.set(adminModel.id, this.convertAdminModel(adminModel));
    }

    // Add user models (but don't override admin models)
    for (const userModel of userModels) {
      if (!modelMap.has(userModel.id)) {
        modelMap.set(userModel.id, this.convertUserModel(userModel));
      }
    }

    this.models = Array.from(modelMap.values());
    this.notifyListeners();
  }

  /**
   * Get all available models
   */
  getModels(): UnifiedModel[] {
    return this.models;
  }

  /**
   * Get models by type
   */
  getModelsByType(type: ModelType): UnifiedModel[] {
    return this.models.filter(m => m.type === type);
  }

  /**
   * Get model by ID
   */
  getModel(id: string): UnifiedModel | undefined {
    return this.models.find(m => m.id === id);
  }

  /**
   * Check if model is credit-based
   */
  isCreditBasedModel(id: string): boolean {
    // Check admin models first
    if (adminModelService.isAdminModel(id)) {
      return true;
    }

    // Check system internal models
    const model = this.getModel(id);
    return model?.isSystemInternal === true || model?.isAdminModel === true;
  }

  /**
   * Get credit cost for a model
   */
  getCreditCost(id: string): number {
    // Try admin model first
    const adminModel = adminModelService.getModel(id);
    if (adminModel) {
      return adminModel.creditCost;
    }

    // Legacy Nano Banana models
    const lowerId = id.toLowerCase();
    if ((lowerId.includes('pro') && lowerId.includes('banana')) || 
        (lowerId.includes('pro') && lowerId.includes('gemini') && (lowerId.includes('image') || lowerId.includes('preview')))) {
      return 2;
    }
    if (lowerId.includes('banana') || 
        (lowerId.includes('gemini') && (lowerId.includes('image') || lowerId.includes('preview')))) {
      return 1;
    }

    return 0;
  }

  /**
   * Get model display colors
   */
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

  /**
   * Subscribe to model changes
   */
  subscribe(callback: () => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private convertAdminModel(model: AdminModelConfig): UnifiedModel {
    return {
      id: model.id,
      name: model.displayName,
      provider: model.provider,
      type: 'image', // Admin models are typically image models for now
      isCustom: false,
      isSystemInternal: true,
      isAdminModel: true,
      description: model.advantages,
      colorStart: model.colorStart,
      colorEnd: model.colorEnd,
      creditCost: model.creditCost,
      billingType: model.billingType,
      advantages: model.advantages,
      endpoint: model.endpoint,
    };
  }

  private convertUserModel(model: any): UnifiedModel {
    return {
      id: model.id,
      name: model.name,
      provider: model.provider,
      type: model.type as ModelType,
      isCustom: model.isCustom ?? false,
      isSystemInternal: model.isSystemInternal,
      isAdminModel: false,
      description: model.description,
      icon: model.icon,
    };
  }

  private notifyListeners() {
    this.listeners.forEach(cb => cb());
  }
}

export const unifiedModelService = new UnifiedModelService();
