/**
 * Secure Model Caller Service
 * 
 * 核心安全特性：
 * 1. 用户只能使用自己的API密钥或管理员提供的公共模型
 * 2. API密钥完全隔离，无法跨用户查看
 * 3. 路由选择由服务端决定，防止前端破解
 * 4. 积分计费透明但后台价格隐藏
 */

import { type ChatMessage } from '../api/AI12APIService';
import { supabase } from '../../lib/supabase';
import { userApiKeyService, type ModelRoute } from '../api/userApiKeyService';
import { notify } from '../system/notificationService';

export interface SecureCallOptions {
  modelId: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onStream?: (chunk: string) => void;
  imageSize?: string; // '0.5K' | '1K' | '2K' | '4K' - 用于计算积分
}

export interface SecureCallResult {
  success: boolean;
  content?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  routeInfo?: {
    type: 'user_key' | 'admin_model';
    cost: number;
    provider: string;
  };
}

class SecureModelCaller {
  /**
   * 调用模型的主入口
   * 
   * 流程：
   * 1. 从服务端获取安全路由（包含解密后的临时密钥）
   * 2. 使用路由信息调用模型
   * 3. 记录使用并扣费
   */
  async call(options: SecureCallOptions): Promise<SecureCallResult> {
    try {
      // 1. 获取模型路由（服务端决定使用用户密钥还是管理员模型）
      const route = await userApiKeyService.getModelRoute(
        options.modelId,
        options.imageSize || '1K'
      );

      if (route.route_type === 'none' || !route.api_key) {
        return {
          success: false,
          error: '没有找到可用的模型路由。请联系管理员配置模型或使用自己的API密钥。',
        };
      }

      // 2. 检查积分（如果是管理员模型）
      if (route.route_type === 'admin_model' && route.user_pays && route.user_pays > 0) {
        const hasCredits = await this.checkCredits(route.user_pays);
        if (!hasCredits) {
          return {
            success: false,
            error: `积分不足，需要 ${route.user_pays} 积分。`,
          };
        }
      }

      // 3. 调用模型
      const result = await this.executeCall(options, route);

      // 4. 记录使用并计费
      if (result.success) {
        await userApiKeyService.recordUsage(
          options.modelId,
          route.route_type,
          route.user_pays || 0,
          {
            prompt_tokens: result.usage?.promptTokens,
            completion_tokens: result.usage?.completionTokens,
            total_tokens: result.usage?.totalTokens,
          }
        );

        // 添加路由信息到结果（用于前端显示）
        result.routeInfo = {
          type: route.route_type,
          cost: route.user_pays || 0,
          provider: route.provider_id || 'system',
        };
      }

      return result;
    } catch (error: any) {
      console.error('[SecureModelCaller] 调用失败:', error);
      return {
        success: false,
        error: error.message || '模型调用失败，请稍后重试。',
      };
    }
  }

  /**
   * 执行实际的API调用
   */
  private async executeCall(
    options: SecureCallOptions,
    route: ModelRoute
  ): Promise<SecureCallResult> {
    const baseUrl = route.base_url || 'https://cdn.12ai.org';
    const apiKey = route.api_key;

    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: options.modelId,
          messages: options.messages,
          max_tokens: options.maxTokens || 2048,
          temperature: options.temperature ?? 0.7,
          stream: options.stream || false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        // 隐藏真实API密钥的错误信息
        const sanitizedError = apiKey 
          ? this.sanitizeError(errorText, apiKey)
          : errorText;
        throw new Error(`API错误: ${response.status} - ${sanitizedError}`);
      }

      const data = await response.json();
      
      return {
        success: true,
        content: data.choices?.[0]?.message?.content || '',
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 检查用户积分
   */
  private async checkCredits(requiredCredits: number): Promise<boolean> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return false;

    const { data: hasCredits, error } = await supabase.rpc('check_user_credits', {
      user_id: user.user.id,
      required_credits: requiredCredits,
    });

    if (error) {
      console.error('[SecureModelCaller] 检查积分失败:', error);
      return false;
    }

    return !!hasCredits;
  }

  /**
   * 清理错误信息，防止泄露敏感信息
   */
  private sanitizeError(errorText: string, apiKey: string): string {
    // 替换掉可能包含的API密钥
    let sanitized = errorText;
    if (apiKey && apiKey.length > 10) {
      sanitized = sanitized.replace(apiKey, '***API_KEY_HIDDEN***');
      // 也替换部分匹配
      sanitized = sanitized.replace(apiKey.slice(0, 20), '***');
    }
    
    // 限制长度
    if (sanitized.length > 200) {
      sanitized = sanitized.slice(0, 200) + '...';
    }
    
    return sanitized;
  }

  /**
   * 获取可用的模型列表（用户视角）
   * 
   * 返回：
   * - 管理员配置的公共模型（隐藏价格和密钥）
   * - 用户自己配置的模型
   */
  async getAvailableModels(): Promise<Array<{
    id: string;
    name: string;
    description?: string;
    creditCost?: number;
    source: 'system' | 'user';
    isActive: boolean;
  }>> {
    try {
      // 1. 获取管理员配置的公共模型
      const { data: adminModels, error: adminError } = await supabase
        .from('available_models_for_users')
        .select('*')
        .eq('is_active', true);

      if (adminError) throw adminError;

      // 2. 获取用户自己的API密钥
      const userKeys = await userApiKeyService.getUserApiKeys();

      // 3. 合并列表
      const models = [
        ...(adminModels || []).map((m: any) => ({
          id: m.model_id,
          name: m.display_name,
          description: m.description,
          creditCost: m.credit_cost,
          source: 'system' as const,
          isActive: true,
        })),
        ...userKeys
          .filter(k => k.is_active)
          .map(k => ({
            id: `${k.provider.toLowerCase()}-custom-${k.id.slice(0, 8)}`,
            name: `${k.name} (${k.provider})`,
            description: '使用您自己的API密钥',
            creditCost: 0, // 使用自己的密钥不收费
            source: 'user' as const,
            isActive: true,
          })),
      ];

      return models;
    } catch (error) {
      console.error('[SecureModelCaller] 获取模型列表失败:', error);
      return [];
    }
  }
}

export const secureModelCaller = new SecureModelCaller();
