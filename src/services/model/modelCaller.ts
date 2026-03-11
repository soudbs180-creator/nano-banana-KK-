/**
 * Model Caller Service
 *
 * Unified service for calling models:
 * - Credit-based models (from admin config) -> Secure server-side proxy
 * - Third-party models (from suppliers) -> Use supplier API
 * - Official models -> Use user's own key
 */

import { type ChatMessage } from '../api/AI12APIService';
import { supplierService } from '../billing/supplierService';
import { keyManager, type ThirdPartyProvider } from '../auth/keyManager';
import { supabase } from '../../lib/supabase';
import { callSecureSystemProxyChat } from './secureModelProxy';

export interface CallModelOptions {
  modelId: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onStream?: (chunk: string) => void;
}

export interface CallResult {
  success: boolean;
  content?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

class ModelCaller {
  private isModelMatch(modelId: string, candidate: string): boolean {
    const normalizedModelId = String(modelId || '').trim().toLowerCase();
    const normalizedCandidate = String(candidate || '').trim().toLowerCase();

    if (!normalizedModelId || !normalizedCandidate) {
      return false;
    }

    return normalizedCandidate === normalizedModelId
      || normalizedCandidate.endsWith(`/${normalizedModelId}`)
      || normalizedModelId.endsWith(`/${normalizedCandidate}`);
  }

  private findConfiguredProviderForModel(modelId: string): Pick<ThirdPartyProvider, 'baseUrl' | 'apiKey'> | null {
    const providers = keyManager
      .getProviders()
      .filter((provider) => provider.isActive && provider.baseUrl && provider.apiKey);

    for (const provider of providers) {
      const hasModel = provider.models.some((candidate) => this.isModelMatch(modelId, candidate));
      if (hasModel) {
        return {
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
        };
      }
    }

    return null;
  }

  /**
   * Main entry point for calling any model.
   */
  async call(options: CallModelOptions): Promise<CallResult> {
    const { modelId } = options;

    // 1. Credit-based model: use secure system proxy.
    const creditCost = await this.getCreditCost(modelId);
    if (creditCost > 0) {
      return this.callCreditModel(options, creditCost);
    }

    // 2. User supplier mapping.
    const supplier = this.findSupplierForModel(modelId);
    if (supplier) {
      return this.callViaSupplier(options, supplier);
    }

    // 3. User key slot mapping.
    const slots = keyManager.getSlots();
    const userSlot = slots.find(
      (s) => s.supportedModels?.includes(modelId) || s.supportedModels?.some((m) => modelId.includes(m))
    );
    if (userSlot) {
      return this.callWithUserKey(options, { key: userSlot.key, baseUrl: userSlot.baseUrl });
    }

    // 4. Fallback.
    return this.callWithSystemDefault(options);
  }

  /**
   * Call credit-based model through secure server-side proxy.
   */
  private async callCreditModel(options: CallModelOptions, creditCost: number): Promise<CallResult> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录。' };
    }

    const { data: hasCredits, error: checkError } = await supabase.rpc('check_user_credits', {
      user_id: user.id,
      required_credits: creditCost,
    });

    if (checkError || !hasCredits) {
      return {
        success: false,
        error: `积分不足，需要 ${creditCost} 积分。`,
      };
    }

    try {
      const response = await callSecureSystemProxyChat({
        modelId: options.modelId,
        messages: options.messages,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        stream: false,
      });

      // Fallback only when server-side deduction is not available.
      if (!response.deducted) {
        await this.deductCredits(user.id, creditCost, options.modelId);
      }

      return {
        success: true,
        content: response.content,
        usage: response.usage,
      };
    } catch (error: any) {
      return { success: false, error: error?.message || '模型调用失败。' };
    }
  }

  /**
   * Call via user's configured supplier.
   */
  private async callViaSupplier(
    options: CallModelOptions,
    supplier: { baseUrl: string; apiKey: string }
  ): Promise<CallResult> {
    try {
      const response = await fetch(`${supplier.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supplier.apiKey}`,
        },
        body: JSON.stringify({
          model: options.modelId,
          messages: options.messages,
          max_tokens: options.maxTokens || 2048,
          temperature: options.temperature ?? 0.7,
          stream: false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error: ${response.status} - ${error}`);
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
      return { success: false, error: error.message };
    }
  }

  /**
   * Call with user's own API key.
   */
  private async callWithUserKey(
    options: CallModelOptions,
    userKey: { key: string; baseUrl?: string }
  ): Promise<CallResult> {
    const baseUrl = userKey.baseUrl || 'https://cdn.12ai.org';

    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userKey.key}`,
        },
        body: JSON.stringify({
          model: options.modelId,
          messages: options.messages,
          max_tokens: options.maxTokens || 2048,
          temperature: options.temperature ?? 0.7,
          stream: false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error: ${response.status} - ${error}`);
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
      return { success: false, error: error.message };
    }
  }

  /**
   * Call with system default (12AI).
   */
  private async callWithSystemDefault(options: CallModelOptions): Promise<CallResult> {
    const hasMessages = Array.isArray(options.messages) && options.messages.length > 0;
    if (!hasMessages) {
      return {
        success: false,
        error: '请先配置 API Key 或选择供应商。',
      };
    }

    // Preserve previous behavior:
    return {
      success: false,
      error: '请先配置 API Key 或选择供应商。',
    };
  }

  /**
   * Get credit cost for a model from admin config.
   */
  private async getCreditCost(modelId: string): Promise<number> {
    const { data, error } = await supabase.rpc('get_model_credit_cost', {
      model_id: modelId,
    });

    if (error) {
      console.error('[ModelCaller] Error getting credit cost:', error);
      return 0;
    }

    return data || 0;
  }

  /**
   * Find supplier that provides this model.
   */
  private findSupplierForModel(modelId: string): { baseUrl: string; apiKey: string } | null {
    const configuredProvider = this.findConfiguredProviderForModel(modelId);
    if (configuredProvider) {
      return configuredProvider;
    }

    const suppliers = supplierService.getAll();

    for (const supplier of suppliers) {
      const hasModel = supplier.models.some((model) => this.isModelMatch(modelId, model.id));
      if (hasModel) {
        return {
          baseUrl: supplier.baseUrl,
          apiKey: supplier.apiKey,
        };
      }
    }

    return null;
  }

  /**
   * Deduct credits from user.
   */
  private async deductCredits(userId: string, credits: number, modelId: string): Promise<void> {
    const { error } = await supabase.rpc('deduct_user_credits', {
      user_id: userId,
      credits,
      model_id: modelId,
    });

    if (error) {
      console.error('[ModelCaller] 积分扣除失败:', error);
      throw new Error('积分扣除失败。');
    }
  }
}

export const modelCaller = new ModelCaller();
