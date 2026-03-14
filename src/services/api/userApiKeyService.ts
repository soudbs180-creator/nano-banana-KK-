/**
 * User API Key Service
 * Keeps the legacy API surface, but routes CRUD operations through the
 * hardened secure-storage layer instead of storing browser-encoded keys.
 */

import { supabase } from '../../lib/supabase';
import {
  addUserApiKey as addSecureUserApiKey,
  deleteApiKey as deleteSecureApiKey,
  getUserApiKeys as getSecureUserApiKeys,
  type ApiProvider,
} from '../security/apiKeySecureStorage';

export interface UserApiKey {
  id: string;
  user_id: string;
  name: string;
  provider: string;
  api_key_encrypted: string;
  base_url?: string;
  is_active: boolean;
  call_count: number;
  total_cost: number;
  created_at: string;
  updated_at: string;
}

export interface ModelRoute {
  route_type: 'user_key' | 'admin_model' | 'none';
  provider_id: string | null;
  base_url: string | null;
  api_key: string | null;
  model_id: string | null;
  endpoint_type: string | null;
  credit_cost: number | null;
  user_pays: number | null;
}

class UserApiKeyService {
  async getUserApiKeys(): Promise<UserApiKey[]> {
    const keys = await getSecureUserApiKeys();

    return keys.map((key) => ({
      id: key.id,
      user_id: '',
      name: key.name,
      provider: key.provider,
      api_key_encrypted: this.maskApiKey(key.key_status),
      base_url: key.base_url || undefined,
      is_active: key.is_active,
      call_count: 0,
      total_cost: 0,
      created_at: key.created_at,
      updated_at: key.created_at,
    }));
  }

  async addUserApiKey(
    name: string,
    provider: string,
    apiKey: string,
    baseUrl?: string
  ): Promise<UserApiKey> {
    const id = await addSecureUserApiKey(
      name,
      provider as ApiProvider,
      apiKey,
      baseUrl
    );

    const timestamp = new Date().toISOString();
    return {
      id,
      user_id: '',
      name,
      provider,
      api_key_encrypted: this.maskApiKey('***CONFIGURED***'),
      base_url: baseUrl || undefined,
      is_active: true,
      call_count: 0,
      total_cost: 0,
      created_at: timestamp,
      updated_at: timestamp,
    };
  }

  async updateUserApiKey(
    id: string,
    updates: Partial<Pick<UserApiKey, 'name' | 'is_active' | 'base_url'>>
  ): Promise<void> {
    const { error } = await supabase
      .from('user_api_keys')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[UserApiKeyService] Failed to update API key:', error);
      throw error;
    }
  }

  async deleteUserApiKey(id: string): Promise<void> {
    await deleteSecureApiKey(id);
  }

  async getModelRoute(
    modelId: string,
    requestedSize: string = '1K'
  ): Promise<ModelRoute> {
    const { data, error } = await supabase.rpc('get_model_route_for_user', {
      p_user_id: (await supabase.auth.getUser()).data.user?.id,
      p_model_id: modelId,
      p_requested_size: requestedSize,
    });

    if (error) {
      console.error('[UserApiKeyService] Failed to get model route:', error);
      throw error;
    }

    if (!data || data.route_type === 'none') {
      throw new Error('No available model route found');
    }

    return data as ModelRoute;
  }

  async recordUsage(
    modelId: string,
    routeType: string,
    creditCost: number,
    metadata?: Record<string, any>
  ): Promise<boolean> {
    const { data, error } = await supabase.rpc('record_model_usage', {
      p_user_id: (await supabase.auth.getUser()).data.user?.id,
      p_model_id: modelId,
      p_route_type: routeType,
      p_credit_cost: creditCost,
      p_metadata: metadata || {},
    });

    if (error) {
      console.error('[UserApiKeyService] Failed to record usage:', error);
      throw error;
    }

    return data as boolean;
  }

  private maskApiKey(value: string): string {
    return value || '***CONFIGURED***';
  }

  decryptApiKey(_encrypted: string): string {
    return '';
  }
}

export const userApiKeyService = new UserApiKeyService();
