/**
 * NewAPI Management Service
 * 
 * Strict implementation of NewAPI Management API
 * Docs: https://docs.newapi.pro/en/docs/api
 * 
 * Uses System Access Token for authentication
 */

import { notify } from '../system/notificationService';

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
  expired_time: number;
  remain_quota: number;
  unlimited_quota: boolean;
}

class NewApiManagementService {
  private baseUrl: string = DEFAULT_BASE_URL;

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '');
  }

  // ==================== Authentication ====================
  // System Access Token for all management API calls

  private getHeaders(accessToken: string) {
    return {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  // ==================== Dashboard (Token Verification) ====================
  
  /**
   * Verify System Access Token
   * GET /api/user/dashboard
   */
  async verifyAccessToken(accessToken: string, baseUrl?: string): Promise<{
    success: boolean;
    data?: {
      quota: number;
      usage: number;
      remain_quota: number;
    };
    error?: string;
  }> {
    const url = (baseUrl || this.baseUrl).replace(/\/$/, '');
    
    try {
      const response = await fetch(`${url}/api/user/dashboard`, {
        method: 'GET',
        headers: this.getHeaders(accessToken),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Token验证失败: ${response.status}` };
      }

      const data = await response.json();
      return { success: true, data: data.data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ==================== Channel Management ====================
  
  /**
   * List all channels
   * GET /api/channel/
   */
  async listChannels(accessToken: string): Promise<NewAPIChannel[]> {
    const response = await fetch(`${this.baseUrl}/api/channel/`, {
      method: 'GET',
      headers: this.getHeaders(accessToken),
    });

    if (!response.ok) {
      throw new Error(`Failed to list channels: ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  /**
   * Get channel by ID
   * GET /api/channel/{id}
   */
  async getChannel(accessToken: string, channelId: number): Promise<NewAPIChannel | null> {
    const response = await fetch(`${this.baseUrl}/api/channel/${channelId}`, {
      method: 'GET',
      headers: this.getHeaders(accessToken),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.data;
  }

  /**
   * Add new channel
   * POST /api/channel/
   */
  async addChannel(accessToken: string, channel: Partial<NewAPIChannel>): Promise<NewAPIChannel> {
    const response = await fetch(`${this.baseUrl}/api/channel/`, {
      method: 'POST',
      headers: this.getHeaders(accessToken),
      body: JSON.stringify(channel),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to add channel: ${error}`);
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Update channel
   * PUT /api/channel/
   */
  async updateChannel(accessToken: string, channel: Partial<NewAPIChannel>): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/channel/`, {
      method: 'PUT',
      headers: this.getHeaders(accessToken),
      body: JSON.stringify(channel),
    });

    if (!response.ok) {
      throw new Error(`Failed to update channel: ${response.status}`);
    }
  }

  /**
   * Delete channel
   * DELETE /api/channel/{id}
   */
  async deleteChannel(accessToken: string, channelId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/channel/${channelId}`, {
      method: 'DELETE',
      headers: this.getHeaders(accessToken),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete channel: ${response.status}`);
    }
  }

  // ==================== Token Management ====================
  
  /**
   * List all tokens
   * GET /api/token/
   */
  async listTokens(accessToken: string): Promise<NewAPIToken[]> {
    const response = await fetch(`${this.baseUrl}/api/token/`, {
      method: 'GET',
      headers: this.getHeaders(accessToken),
    });

    if (!response.ok) {
      throw new Error(`Failed to list tokens: ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  /**
   * Add new token
   * POST /api/token/
   */
  async addToken(accessToken: string, token: Partial<NewAPIToken>): Promise<NewAPIToken> {
    const response = await fetch(`${this.baseUrl}/api/token/`, {
      method: 'POST',
      headers: this.getHeaders(accessToken),
      body: JSON.stringify(token),
    });

    if (!response.ok) {
      throw new Error(`Failed to add token: ${response.status}`);
    }

    const data = await response.json();
    return data.data;
  }

  // ==================== Model & Pricing ====================
  
  /**
   * Get model pricing and settings
   * GET /api/pricing
   */
  async getPricing(accessToken: string): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/api/pricing`, {
      method: 'GET',
      headers: this.getHeaders(accessToken),
    });

    if (!response.ok) {
      throw new Error(`Failed to get pricing: ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  /**
   * Fetch models with detailed info (for admin)
   * Combines channel info with pricing
   */
  async fetchAdminModels(accessToken: string, baseUrl?: string): Promise<NewAPIModel[]> {
    const url = (baseUrl || this.baseUrl).replace(/\/$/, '');
    
    // Get channels (contains model list)
    const channelsResponse = await fetch(`${url}/api/channel/`, {
      method: 'GET',
      headers: this.getHeaders(accessToken),
    });

    if (!channelsResponse.ok) {
      throw new Error(`Failed to fetch channels: ${channelsResponse.status}`);
    }

    const channelsData = await channelsResponse.json();
    const channels: NewAPIChannel[] = channelsData.data || [];

    // Get pricing info
    const pricingResponse = await fetch(`${url}/api/pricing`, {
      method: 'GET',
      headers: this.getHeaders(accessToken),
    });

    let pricingData: any[] = [];
    if (pricingResponse.ok) {
      const p = await pricingResponse.json();
      pricingData = p.data || [];
    }

    // Build model list from channels and pricing
    const modelMap = new Map<string, NewAPIModel>();

    channels.forEach(channel => {
      const models = channel.models.split(',').map(m => m.trim()).filter(Boolean);
      models.forEach(modelId => {
        if (!modelMap.has(modelId)) {
          const pricing = pricingData.find((p: any) => p.model === modelId);
          
          modelMap.set(modelId, {
            id: modelId,
            displayName: this.formatModelName(modelId),
            billingType: pricing?.type === 'tokens' ? 'token' : 
                        pricing?.type === 'per_request' ? 'per_request' : 'token',
            inputPrice: pricing?.input_price ? pricing.input_price * 1000000 : undefined,
            outputPrice: pricing?.output_price ? pricing.output_price * 1000000 : undefined,
            perRequestPrice: pricing?.per_request_price,
            multiplier: pricing?.multiplier,
            group: channel.name,
          });
        }
      });
    });

    return Array.from(modelMap.values());
  }

  // ==================== Helper Methods ====================

  private formatModelName(id: string): string {
    return id
      .split('/')
      .pop()!
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }
}

export const newApiManagementService = new NewApiManagementService();
