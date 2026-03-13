/**
 * Model Caller Service
 *
 * Unified service for calling models:
 * - Credit-based models (from admin config) -> Secure server-side proxy
 * - Third-party models (from suppliers) -> Use supplier API
 * - Official models -> Use user's own key
 */

import { type ChatMessage } from '../api/AI12APIService';
import {
  buildGeminiHeaders,
  buildGeminiEndpoint,
  buildOpenAIEndpoint,
  buildProxyHeaders,
  type ApiProtocolFormat,
} from '../api/apiConfig';
import { resolveProviderRuntime } from '../api/providerStrategy';
import { keyManager, type ThirdPartyProvider } from '../auth/keyManager';
import { supplierService } from '../billing/supplierService';
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

type RoutedApiConfig = {
  baseUrl: string;
  apiKey: string;
  provider?: string;
  format?: ApiProtocolFormat;
};

class ModelCaller {
  private isModelMatch(modelId: string, candidate: string): boolean {
    const normalizedModelId = String(modelId || '').trim().toLowerCase();
    const normalizedCandidate = String(candidate || '').trim().toLowerCase();

    if (!normalizedModelId || !normalizedCandidate) {
      return false;
    }

    return (
      normalizedCandidate === normalizedModelId ||
      normalizedCandidate.endsWith(`/${normalizedModelId}`) ||
      normalizedModelId.endsWith(`/${normalizedCandidate}`)
    );
  }

  private findConfiguredProviderForModel(
    modelId: string,
  ): RoutedApiConfig | null {
    const providers = keyManager
      .getProviders()
      .filter((provider) => provider.isActive && provider.baseUrl && provider.apiKey);

    for (const provider of providers) {
      const hasModel = provider.models.some((candidate) => this.isModelMatch(modelId, candidate));
      if (hasModel) {
        return {
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          provider: undefined,
          format: provider.format,
        };
      }
    }

    return null;
  }

  async call(options: CallModelOptions): Promise<CallResult> {
    const { modelId } = options;

    const creditCost = await this.getCreditCost(modelId);
    if (creditCost > 0) {
      return this.callCreditModel(options, creditCost);
    }

    const supplier = this.findSupplierForModel(modelId);
    if (supplier) {
      return this.callViaSupplier(options, supplier);
    }

    const slots = keyManager.getSlots();
    const userSlot = slots.find(
      (slot) =>
        slot.supportedModels?.includes(modelId) ||
        slot.supportedModels?.some((supportedModel) => modelId.includes(supportedModel)),
    );
    if (userSlot) {
      return this.callWithUserKey(options, {
        key: userSlot.key,
        baseUrl: userSlot.baseUrl,
        provider: userSlot.provider,
        format: userSlot.format,
      });
    }

    return this.callWithSystemDefault(options);
  }

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

  private async callViaSupplier(options: CallModelOptions, supplier: RoutedApiConfig): Promise<CallResult> {
    return this.callWithProtocol(options, supplier);
  }

  private async callWithUserKey(
    options: CallModelOptions,
    userKey: { key: string; baseUrl?: string; format?: ApiProtocolFormat; provider?: string },
  ): Promise<CallResult> {
    return this.callWithProtocol(options, {
      apiKey: userKey.key,
      baseUrl: userKey.baseUrl || 'https://cdn.12ai.org',
      provider: userKey.provider,
      format: userKey.format,
    });
  }

  private async callWithProtocol(options: CallModelOptions, config: RoutedApiConfig): Promise<CallResult> {
    const runtime = resolveProviderRuntime({
      provider: config.provider,
      baseUrl: config.baseUrl,
      format: config.format,
      modelId: options.modelId,
    });
    if (runtime.geminiNative) {
      return this.callGeminiCompatible(options, config);
    }

    return this.callOpenAICompatible(options, config);
  }

  private async callOpenAICompatible(
    options: CallModelOptions,
    config: RoutedApiConfig,
  ): Promise<CallResult> {
    try {
      const runtime = resolveProviderRuntime({
        provider: config.provider,
        baseUrl: config.baseUrl,
        format: config.format,
      });
      const response = await fetch(buildOpenAIEndpoint(config.baseUrl, 'chat/completions'), {
        method: 'POST',
        headers: buildProxyHeaders(runtime.authMethod as 'header' | 'query', config.apiKey, runtime.headerName),
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

  private buildGeminiPayload(options: CallModelOptions): Record<string, any> {
    const systemInstruction = options.messages
      .filter((message) => message.role === 'system')
      .map((message) => String(message.content || '').trim())
      .filter(Boolean)
      .join('\n\n');

    const contents = options.messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(message.content || '') }],
      }));

    if (contents.length === 0) {
      contents.push({
        role: 'user',
        parts: [{ text: systemInstruction || 'Hello' }],
      });
    }

    const payload: Record<string, any> = {
      contents,
      generationConfig: {
        maxOutputTokens: options.maxTokens || 2048,
        temperature: options.temperature ?? 0.7,
      },
    };

    if (systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    return payload;
  }

  private async callGeminiCompatible(
    options: CallModelOptions,
    config: RoutedApiConfig,
  ): Promise<CallResult> {
    try {
      const runtime = resolveProviderRuntime({
        provider: config.provider,
        baseUrl: config.baseUrl,
        format: 'gemini',
        modelId: options.modelId,
      });
      const authMethod = runtime.authMethod as 'query' | 'header';
      const response = await fetch(
        buildGeminiEndpoint(config.baseUrl, options.modelId, 'generateContent', config.apiKey, authMethod, config.provider),
        {
          method: 'POST',
          headers: buildGeminiHeaders(authMethod, config.apiKey, runtime.headerName),
          body: JSON.stringify(this.buildGeminiPayload(options)),
        },
      );

      if (!response.ok) {
        const rawError = await response.text();
        let message = rawError;

        try {
          const parsed = JSON.parse(rawError || '{}');
          message = parsed.error?.message || parsed.message || rawError;
        } catch {
          message = rawError;
        }

        throw new Error(`API error: ${response.status} - ${message}`);
      }

      const data = await response.json();
      const content = (data.candidates?.[0]?.content?.parts || [])
        .map((part: any) => part?.text || '')
        .filter(Boolean)
        .join('\n');

      return {
        success: true,
        content,
        usage: {
          promptTokens: data.usageMetadata?.promptTokenCount || 0,
          completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: data.usageMetadata?.totalTokenCount || 0,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async callWithSystemDefault(options: CallModelOptions): Promise<CallResult> {
    const hasMessages = Array.isArray(options.messages) && options.messages.length > 0;
    if (!hasMessages) {
      return {
        success: false,
        error: '请先配置 API Key 或选择供应商。',
      };
    }

    return {
      success: false,
      error: '请先配置 API Key 或选择供应商。',
    };
  }

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

  private findSupplierForModel(modelId: string): {
    baseUrl: string;
    apiKey: string;
    provider?: string;
    format: ApiProtocolFormat;
  } | null {
    const configuredProvider = this.findConfiguredProviderForModel(modelId);
    if (configuredProvider) {
        return {
          baseUrl: configuredProvider.baseUrl,
          apiKey: configuredProvider.apiKey,
          provider: undefined,
          format: configuredProvider.format || 'auto',
        };
    }

    const suppliers = supplierService.getAll();

    for (const supplier of suppliers) {
      const hasModel = supplier.models.some((model) => this.isModelMatch(modelId, model.id));
      if (hasModel) {
        return {
          baseUrl: supplier.baseUrl,
          apiKey: supplier.apiKey,
          provider: undefined,
          format: supplier.format || 'auto',
        };
      }
    }

    return null;
  }

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
