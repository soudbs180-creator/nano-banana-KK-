/**
 * User API Key Service
 * 管理用户个人的API密钥（与管理员系统完全隔离）
 */

import { supabase } from '../../lib/supabase';

export interface UserApiKey {
  id: string;
  user_id: string;
  name: string;
  provider: string;
  api_key_encrypted: string; // 加密存储，前端显示为掩码
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
  api_key: string | null; // 临时解密，仅用于调用
  model_id: string | null;
  endpoint_type: string | null;
  credit_cost: number | null;
  user_pays: number | null;
}

class UserApiKeyService {
  /**
   * 获取用户自己的API密钥列表
   */
  async getUserApiKeys(): Promise<UserApiKey[]> {
    const { data, error } = await supabase
      .from('user_api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[UserApiKeyService] 获取API密钥失败:', error);
      throw error;
    }

    return (data || []).map(key => ({
      ...key,
      // 前端只显示掩码
      api_key_encrypted: this.maskApiKey(key.api_key_encrypted),
    }));
  }

  /**
   * 添加用户API密钥
   */
  async addUserApiKey(
    name: string,
    provider: string,
    apiKey: string,
    baseUrl?: string
  ): Promise<UserApiKey> {
    // 加密API密钥（简单的base64，实际应该使用更强的加密）
    const encrypted = btoa(apiKey);

    const { data, error } = await supabase
      .from('user_api_keys')
      .insert({
        name,
        provider,
        api_key_encrypted: encrypted,
        base_url: baseUrl || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('[UserApiKeyService] 添加API密钥失败:', error);
      throw error;
    }

    return {
      ...data,
      api_key_encrypted: this.maskApiKey(data.api_key_encrypted),
    };
  }

  /**
   * 更新API密钥
   */
  async updateUserApiKey(
    id: string,
    updates: Partial<Pick<UserApiKey, 'name' | 'is_active' | 'base_url'>>
  ): Promise<void> {
    const { error } = await supabase
      .from('user_api_keys')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[UserApiKeyService] 更新API密钥失败:', error);
      throw error;
    }
  }

  /**
   * 删除API密钥
   */
  async deleteUserApiKey(id: string): Promise<void> {
    const { error } = await supabase
      .from('user_api_keys')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[UserApiKeyService] 删除API密钥失败:', error);
      throw error;
    }
  }

  /**
   * 获取模型路由（核心函数）
   * 系统会优先使用用户自己的密钥，如果没有则使用管理员提供的
   */
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
      console.error('[UserApiKeyService] 获取模型路由失败:', error);
      throw error;
    }

    if (!data || data.route_type === 'none') {
      throw new Error('没有找到可用的模型路由');
    }

    return data as ModelRoute;
  }

  /**
   * 记录模型使用（计费）
   */
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
      console.error('[UserApiKeyService] 记录使用失败:', error);
      throw error;
    }

    return data as boolean;
  }

  /**
   * API密钥掩码显示
   */
  private maskApiKey(encrypted: string): string {
    if (!encrypted) return '';
    // 只显示前4位和后4位
    return encrypted.slice(0, 4) + '****' + encrypted.slice(-4);
  }

  /**
   * 解密API密钥（仅用于发起请求时）
   */
  decryptApiKey(encrypted: string): string {
    try {
      return atob(encrypted);
    } catch {
      return '';
    }
  }
}

export const userApiKeyService = new UserApiKeyService();
