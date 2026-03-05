/**
 * Supplier Service
 * 
 * Manages third-party suppliers (URL + Key + Name)
 * Automatically fetches models and pricing from NewAPI
 * Syncs with Cost Estimation page
 */

import { newApiManagementService } from '../api/newApiManagementService';

export interface Supplier {
  id: string;
  name: string;           // 供应商名字（用户自定义）
  baseUrl: string;        // API Base URL
  apiKey: string;         // API Key（加密存储）
  systemToken?: string;   // System Access Token（可选，用于获取价格）
  budgetLimit?: number;   // 预算限制（可选）
  models: SupplierModel[];
  createdAt: string;
  updatedAt: string;
}

export interface SupplierModel {
  id: string;
  name: string;
  group?: string;         // 模型分组
  inputPrice?: number;    // 输入价格（每百万tokens）
  outputPrice?: number;   // 输出价格（每百万tokens）
  perRequestPrice?: number; // 每次请求价格
  multiplier?: number;    // 倍率
  billingType: 'token' | 'per_request' | 'multiplier';
  isActive: boolean;
}

// Local storage key
const SUPPLIERS_STORAGE_KEY = 'kk_suppliers_v1';

class SupplierService {
  private suppliers: Supplier[] = [];
  private listeners: (() => void)[] = [];

  constructor() {
    this.loadFromStorage();
  }

  // ==================== CRUD Operations ====================

  getAll(): Supplier[] {
    return [...this.suppliers];
  }

  getById(id: string): Supplier | undefined {
    return this.suppliers.find(s => s.id === id);
  }

  create(data: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt' | 'models'>): Supplier {
    console.log('[SupplierService] Creating supplier:', data.name);
    
    const supplier: Supplier = {
      ...data,
      id: crypto.randomUUID(),
      models: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.suppliers.push(supplier);
    this.saveToStorage();
    this.notifyListeners();

    console.log('[SupplierService] Supplier created:', supplier.id);
    
    // Fetch models asynchronously if system token provided
    if (data.systemToken) {
      this.fetchModelsAsync(supplier.id, data.baseUrl, data.systemToken);
    }

    return supplier;
  }

  update(id: string, data: Partial<Omit<Supplier, 'id' | 'createdAt'>>): Supplier | null {
    console.log('[SupplierService] Updating supplier:', id);
    
    const index = this.suppliers.findIndex(s => s.id === id);
    if (index === -1) return null;

    const supplier = this.suppliers[index];
    
    // Check if we need to re-fetch models (URL or Token changed)
    const shouldRefetch = 
      (data.baseUrl && data.baseUrl !== supplier.baseUrl) ||
      (data.systemToken && data.systemToken !== supplier.systemToken);

    this.suppliers[index] = {
      ...supplier,
      ...data,
      updatedAt: new Date().toISOString(),
    };

    this.saveToStorage();
    this.notifyListeners();

    console.log('[SupplierService] Supplier updated:', id);

    // Refetch models asynchronously if needed
    if (shouldRefetch && data.systemToken) {
      this.fetchModelsAsync(id, data.baseUrl || supplier.baseUrl, data.systemToken);
    }

    return this.suppliers[index];
  }

  delete(id: string): boolean {
    console.log('[SupplierService] Deleting supplier:', id);
    
    const index = this.suppliers.findIndex(s => s.id === id);
    if (index === -1) return false;

    this.suppliers.splice(index, 1);
    this.saveToStorage();
    this.notifyListeners();
    
    console.log('[SupplierService] Supplier deleted:', id);
    return true;
  }

  // ==================== Async Model Fetching ====================

  private async fetchModelsAsync(supplierId: string, baseUrl: string, systemToken: string) {
    try {
      console.log('[SupplierService] Fetching models for:', supplierId);
      const models = await this.fetchModelsFromNewAPI(baseUrl, systemToken);
      
      const index = this.suppliers.findIndex(s => s.id === supplierId);
      if (index !== -1) {
        this.suppliers[index].models = models;
        this.suppliers[index].updatedAt = new Date().toISOString();
        this.saveToStorage();
        this.notifyListeners();
        console.log('[SupplierService] Models fetched:', models.length);
      }
    } catch (error: any) {
      console.error('[SupplierService] Failed to fetch models:', error);
    }
  }

  async fetchModelsFromNewAPI(baseUrl: string, systemToken: string): Promise<SupplierModel[]> {
    console.log('[SupplierService] Calling NewAPI for models:', baseUrl);
    const models = await newApiManagementService.fetchAdminModels(systemToken, baseUrl);
    
    return models.map(m => ({
      id: m.id,
      name: m.displayName,
      billingType: m.billingType,
      inputPrice: m.inputPrice,
      outputPrice: m.outputPrice,
      perRequestPrice: m.perRequestPrice,
      multiplier: m.multiplier,
      isActive: true,
    }));
  }

  async refreshModels(supplierId: string): Promise<SupplierModel[]> {
    const supplier = this.getById(supplierId);
    if (!supplier) throw new Error('供应商不存在');
    if (!supplier.systemToken) throw new Error('未配置 System Access Token');

    const models = await this.fetchModelsFromNewAPI(supplier.baseUrl, supplier.systemToken);
    
    const index = this.suppliers.findIndex(s => s.id === supplierId);
    if (index !== -1) {
      this.suppliers[index].models = models;
      this.suppliers[index].updatedAt = new Date().toISOString();
      this.saveToStorage();
      this.notifyListeners();
    }

    return models;
  }

  // ==================== Pricing for Cost Estimation ====================

  getPricingForCostEstimation(): Array<{
    supplierName: string;
    supplierId: string;
    models: Array<{
      id: string;
      name: string;
      inputPrice?: number;
      outputPrice?: number;
      perRequestPrice?: number;
      multiplier?: number;
      billingType: string;
    }>;
  }> {
    return this.suppliers.map(s => ({
      supplierName: s.name,
      supplierId: s.id,
      models: s.models.map(m => ({
        id: m.id,
        name: m.name,
        inputPrice: m.inputPrice,
        outputPrice: m.outputPrice,
        perRequestPrice: m.perRequestPrice,
        multiplier: m.multiplier,
        billingType: m.billingType,
      })),
    }));
  }

  // ==================== Storage ====================

  private loadFromStorage() {
    try {
      const data = localStorage.getItem(SUPPLIERS_STORAGE_KEY);
      if (data) {
        this.suppliers = JSON.parse(data);
        console.log('[SupplierService] Loaded from storage:', this.suppliers.length);
      }
    } catch (error) {
      console.error('[SupplierService] Failed to load from storage:', error);
      this.suppliers = [];
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(SUPPLIERS_STORAGE_KEY, JSON.stringify(this.suppliers));
      console.log('[SupplierService] Saved to storage:', this.suppliers.length);
    } catch (error) {
      console.error('[SupplierService] Failed to save to storage:', error);
    }
  }

  // ==================== Subscriptions ====================

  subscribe(callback: () => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(cb => cb());
  }
}

export const supplierService = new SupplierService();
