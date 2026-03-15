/**
 * Supplier Service
 *
 * Manages third-party suppliers (URL + Key + Name)
 * Automatically fetches models and pricing from NewAPI
 * Syncs with Cost Estimation page
 */

import { type ApiProtocolFormat, normalizeApiProtocolFormat } from '../api/apiConfig';
import { newApiManagementService } from '../api/newApiManagementService';
import { fetchWuyinPricingCatalog, selectWuyinCatalogModels } from './newApiPricingService';
import { resolveProviderRuntime } from '../api/providerStrategy';

export interface Supplier {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  format: ApiProtocolFormat;
  systemToken?: string;
  budgetLimit?: number;
  models: SupplierModel[];
  createdAt: string;
  updatedAt: string;
}

export interface SupplierModel {
  id: string;
  name: string;
  group?: string;
  inputPrice?: number;
  outputPrice?: number;
  perRequestPrice?: number;
  multiplier?: number;
  billingType: 'token' | 'per_request' | 'multiplier';
  isActive: boolean;
  currency?: string;
  billingUnit?: string;
  displayPrice?: string;
  supportsGroups?: boolean;
}

const SUPPLIERS_STORAGE_KEY = 'kk_suppliers_v1';

class SupplierService {
  private suppliers: Supplier[] = [];
  private listeners: (() => void)[] = [];

  constructor() {
    this.loadFromStorage();
  }

  getAll(): Supplier[] {
    return [...this.suppliers];
  }

  getById(id: string): Supplier | undefined {
    return this.suppliers.find((supplier) => supplier.id === id);
  }

  clearLegacyStorage(): void {
    this.suppliers = [];

    try {
      localStorage.removeItem(SUPPLIERS_STORAGE_KEY);
      console.log('[SupplierService] Cleared legacy storage');
    } catch (error) {
      console.error('[SupplierService] Failed to clear legacy storage:', error);
    }

    this.notifyListeners();
  }

  create(data: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt' | 'models'>): Supplier {
    console.log('[SupplierService] Creating supplier:', data.name);

    const supplier: Supplier = {
      ...data,
      format: normalizeApiProtocolFormat(data.format, 'auto'),
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).substring(2),
      models: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.suppliers.push(supplier);
    this.saveToStorage();
    this.notifyListeners();

    console.log('[SupplierService] Supplier created:', supplier.id);

    if (data.systemToken) {
      this.fetchModelsAsync(supplier.id, data.baseUrl, data.systemToken);
    }

    return supplier;
  }

  update(id: string, data: Partial<Omit<Supplier, 'id' | 'createdAt'>>): Supplier | null {
    console.log('[SupplierService] Updating supplier:', id);

    const index = this.suppliers.findIndex((supplier) => supplier.id === id);
    if (index === -1) return null;

    const supplier = this.suppliers[index];
    const shouldRefetch =
      (data.baseUrl && data.baseUrl !== supplier.baseUrl) ||
      (data.systemToken && data.systemToken !== supplier.systemToken);

    this.suppliers[index] = {
      ...supplier,
      ...data,
      format: normalizeApiProtocolFormat(data.format ?? supplier.format, 'auto'),
      updatedAt: new Date().toISOString(),
    };

    this.saveToStorage();
    this.notifyListeners();

    console.log('[SupplierService] Supplier updated:', id);

    if (shouldRefetch && data.systemToken) {
      this.fetchModelsAsync(id, data.baseUrl || supplier.baseUrl, data.systemToken);
    }

    return this.suppliers[index];
  }

  delete(id: string): boolean {
    console.log('[SupplierService] Deleting supplier:', id);

    const index = this.suppliers.findIndex((supplier) => supplier.id === id);
    if (index === -1) return false;

    this.suppliers.splice(index, 1);
    this.saveToStorage();
    this.notifyListeners();

    console.log('[SupplierService] Supplier deleted:', id);
    return true;
  }

  private async fetchModelsAsync(supplierId: string, baseUrl: string, systemToken: string) {
    try {
      console.log('[SupplierService] Fetching models for:', supplierId);
      const models = await this.fetchModelsFromNewAPI(baseUrl, systemToken);

      const index = this.suppliers.findIndex((supplier) => supplier.id === supplierId);
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
    const runtime = resolveProviderRuntime({ baseUrl, format: 'openai' });
    if (runtime.strategyId === 'wuyinkeji') {
      const pricing = selectWuyinCatalogModels(baseUrl, await fetchWuyinPricingCatalog(baseUrl));
      return pricing.map((model) => ({
        id: model.modelId,
        name: model.modelName,
        billingType: 'per_request',
        perRequestPrice: model.inputPrice,
        isActive: true,
        currency: model.currency,
        billingUnit: model.billingUnit,
        displayPrice: model.displayPrice,
        supportsGroups: false,
      }));
    }

    console.log('[SupplierService] Calling NewAPI for models:', baseUrl);
    const models = await newApiManagementService.fetchAdminModels(systemToken, baseUrl);

    return models.map((model) => ({
      id: model.id,
      name: model.displayName,
      billingType: model.billingType,
      inputPrice: model.inputPrice,
      outputPrice: model.outputPrice,
      perRequestPrice: model.perRequestPrice,
      multiplier: model.multiplier,
      isActive: true,
      supportsGroups: true,
    }));
  }

  async refreshModels(supplierId: string): Promise<SupplierModel[]> {
    const supplier = this.getById(supplierId);
    if (!supplier) throw new Error('渚涘簲鍟嗕笉瀛樺湪');
    if (!supplier.systemToken) throw new Error('鏈厤缃?System Access Token');

    const models = await this.fetchModelsFromNewAPI(supplier.baseUrl, supplier.systemToken);

    const index = this.suppliers.findIndex((item) => item.id === supplierId);
    if (index !== -1) {
      this.suppliers[index].models = models;
      this.suppliers[index].updatedAt = new Date().toISOString();
      this.saveToStorage();
      this.notifyListeners();
    }

    return models;
  }

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
    return this.suppliers.map((supplier) => ({
      supplierName: supplier.name,
      supplierId: supplier.id,
      models: supplier.models.map((model) => ({
        id: model.id,
        name: model.name,
        inputPrice: model.inputPrice,
        outputPrice: model.outputPrice,
        perRequestPrice: model.perRequestPrice,
        multiplier: model.multiplier,
        billingType: model.billingType,
      })),
    }));
  }

  private loadFromStorage() {
    try {
      const data = localStorage.getItem(SUPPLIERS_STORAGE_KEY);
      if (data) {
        this.suppliers = JSON.parse(data).map((supplier: Supplier) => ({
          ...supplier,
          format: normalizeApiProtocolFormat((supplier as any).format, 'auto'),
        }));
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

  subscribe(callback: () => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((listener) => listener !== callback);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((callback) => callback());
  }
}

export const supplierService = new SupplierService();
