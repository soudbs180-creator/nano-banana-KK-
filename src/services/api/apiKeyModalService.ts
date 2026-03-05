// Global API Key Modal Service
// Usage: import { apiKeyModalService } from './services/api/apiKeyModalService';
// apiKeyModalService.open(); // Opens modal for adding new supplier
// apiKeyModalService.open(supplier); // Opens modal for editing supplier

import type { Supplier } from '../billing/supplierService';

class ApiKeyModalService {
  private openModalCallback: ((supplier?: Supplier) => void) | null = null;

  setOpenCallback(callback: (supplier?: Supplier) => void) {
    this.openModalCallback = callback;
  }

  open(supplier?: Supplier) {
    if (this.openModalCallback) {
      this.openModalCallback(supplier);
    } else {
      // Fallback to global window object
      if ((window as any).openApiKeyModal) {
        (window as any).openApiKeyModal(supplier);
      } else {
        console.warn('[ApiKeyModalService] Modal not initialized yet');
      }
    }
  }
}

export const apiKeyModalService = new ApiKeyModalService();
export type { Supplier };
