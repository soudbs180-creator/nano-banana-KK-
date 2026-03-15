/**
 * Connection testing helpers for API channels.
 *
 * The goal here is to validate auth + protocol routing without accidentally
 * creating billed image/video jobs on strict image/video endpoints.
 */

import {
  type ApiProtocolFormat,
  type AuthMethod,
  buildClaudeEndpoint,
  buildClaudeHeaders,
  buildGeminiHeaders,
  buildGeminiEndpoint,
  buildGeminiModelsEndpoint,
  buildOpenAIEndpoint,
  buildProxyHeaders,
  normalizeProxyBaseUrl,
} from './apiConfig';
import type { ChannelConfig } from './channelConfig';
import {
  buildUserFacingApiErrorMessage,
  classifyApiFailure,
} from './errorClassification';
import { resolveProviderRuntime } from './providerStrategy';
import keyManager from '../auth/keyManager';

export interface TestResult {
  success: boolean;
  message: string;
  details?: any;
  responseTime?: number;
}

export interface ConnectionConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  provider?: string;
  format?: ApiProtocolFormat;
  authMethod?: AuthMethod;
  headerName?: string;
  compatibilityMode?: 'standard' | 'chat';
  channelId?: string;
  channelConfig?: ChannelConfig;
}

function getCleanBaseUrl(baseUrl: string): string {
  return normalizeProxyBaseUrl(baseUrl) || String(baseUrl || '').replace(/\/$/, '');
}

function resolveConfig(config: ConnectionConfig): Required<Pick<ConnectionConfig, 'apiKey' | 'baseUrl' | 'provider'>> & ConnectionConfig {
  const channel = config.channelConfig || (config.channelId ? keyManager.getChannelConfig(config.channelId) : undefined);
  return {
    ...config,
    apiKey: config.apiKey || channel?.apiKey || '',
    baseUrl: config.baseUrl || channel?.baseUrl || '',
    provider: config.provider || String(channel?.provider || channel?.name || 'Custom'),
    format: config.format || channel?.protocolHint || 'auto',
    authMethod: config.authMethod || channel?.authProfile?.authMethod,
    headerName: config.headerName || channel?.authProfile?.headerName,
    compatibilityMode: config.compatibilityMode || channel?.compatibilityMode,
    channelConfig: channel || config.channelConfig,
  };
}

function getModelId(config: ConnectionConfig): string {
  const resolved = resolveConfig(config);
  const fallback = resolved.format === 'claude' ? 'claude-3-5-sonnet-latest' : 'gemini-2.5-flash';
  return String(resolved.model || resolved.channelConfig?.supportedModels?.[0] || fallback).trim();
}

function resolveConnectionRuntime(config: ConnectionConfig, cleanBase: string) {
  const resolved = resolveConfig(config);
  return resolveProviderRuntime({
    provider: resolved.provider,
    baseUrl: cleanBase,
    format: resolved.format,
    authMethod: resolved.authMethod,
    headerName: resolved.headerName,
    compatibilityMode: resolved.compatibilityMode,
    modelId: getModelId(resolved),
  });
}

function isVideoModel(modelId: string): boolean {
  return /(veo|sora|seedance|runway|luma|kling|pika|video)/i.test(modelId);
}

function isImageOnlyNativeModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return lower.startsWith('imagen-') || lower.startsWith('veo-');
}

function buildFailureResult(params: {
  startTime: number;
  status?: number;
  responseText?: string;
  error?: unknown;
  fallbackMessage: string;
}): TestResult {
  const failure = classifyApiFailure({
    error: params.error,
    status: params.status,
    responseText: params.responseText,
    fallbackMessage: params.fallbackMessage,
  });

  return {
    success: false,
    message: buildUserFacingApiErrorMessage(failure),
    details: {
      status: failure.status,
      detail: failure.detail,
      kind: failure.kind,
    },
    responseTime: Date.now() - params.startTime,
  };
}

async function runGeminiGenerateContentTest(
  cleanBase: string,
  config: ConnectionConfig,
): Promise<Response> {
  const resolved = resolveConfig(config);
  const requestedModel = getModelId(config);
  const testModel = requestedModel.toLowerCase().startsWith('gemini-') ? requestedModel : 'gemini-2.5-flash';
  const runtime = resolveConnectionRuntime(resolved, cleanBase);
  const authMethod = runtime.authMethod as AuthMethod;
  const apiUrl = buildGeminiEndpoint(
    cleanBase,
    testModel,
    'generateContent',
    resolved.apiKey,
    authMethod,
    resolved.provider
  );

  return fetch(apiUrl, {
    method: 'POST',
    headers: buildGeminiHeaders(authMethod, resolved.apiKey, runtime.headerName, runtime.authorizationValueFormat),
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Test connection' }] }],
    }),
    signal: AbortSignal.timeout(30000),
  });
}

async function runOpenAIChatTest(cleanBase: string, config: ConnectionConfig): Promise<Response> {
  const resolved = resolveConfig(config);
  const base = cleanBase || 'https://api.openai.com';
  const apiUrl = buildOpenAIEndpoint(base, '/chat/completions');
  const runtime = resolveConnectionRuntime(resolved, cleanBase);

  return fetch(apiUrl, {
    method: 'POST',
    headers: buildProxyHeaders(runtime.authMethod as AuthMethod, resolved.apiKey, runtime.headerName, undefined, runtime.authorizationValueFormat),
    body: JSON.stringify({
      model: getModelId(resolved),
      stream: false,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Test connection' }],
        },
      ],
      max_tokens: 10,
    }),
    signal: AbortSignal.timeout(30000),
  });
}

async function runClaudeMessagesTest(cleanBase: string, config: ConnectionConfig): Promise<Response> {
  const resolved = resolveConfig(config);
  const runtime = resolveConnectionRuntime(resolved, cleanBase);
  const apiUrl = buildClaudeEndpoint(cleanBase || 'https://api.anthropic.com', '/messages');

  return fetch(apiUrl, {
    method: 'POST',
    headers: buildClaudeHeaders(
      runtime.authMethod as AuthMethod,
      resolved.apiKey,
      runtime.headerName,
      runtime.authorizationValueFormat,
    ),
    body: JSON.stringify({
      model: getModelId(resolved),
      max_tokens: 16,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Test connection' }],
        },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });
}

/**
 * Tests the active protocol path without creating billed image/video jobs.
 */
export async function testCherryConnection(config: ConnectionConfig): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const resolved = resolveConfig(config);
    const cleanBase = getCleanBaseUrl(resolved.baseUrl);
    const modelId = getModelId(resolved);
    const runtime = resolveConnectionRuntime(resolved, cleanBase);
    const nativeGemini = runtime.protocolFamily === 'gemini-native';
    const nativeClaude = runtime.protocolFamily === 'claude-native';
    const responseTime = () => Date.now() - startTime;

    if (isVideoModel(modelId)) {
      const listTest = await testModelsList(resolved);
      return {
        ...listTest,
        message: listTest.success
          ? '视频链路鉴权成功，已跳过创建任务测试以避免计费'
          : `视频链路测试失败: ${listTest.message}`,
        details: listTest.success
          ? {
              model: modelId,
              responseFormat: 'models',
            }
          : listTest.details,
        responseTime: responseTime(),
      };
    }

    if (nativeGemini && isImageOnlyNativeModel(modelId)) {
      const listTest = await testModelsList(resolved);
      return {
        ...listTest,
        message: listTest.success
          ? '原生图像链路鉴权成功，已跳过生成测试以避免计费'
          : `原生图像链路测试失败: ${listTest.message}`,
        details: listTest.success
          ? {
              model: modelId,
              responseFormat: 'native-models',
            }
          : listTest.details,
        responseTime: responseTime(),
      };
    }

    if (!nativeGemini && !nativeClaude && resolved.compatibilityMode === 'standard') {
      const listTest = await testModelsList(resolved);
      return {
        ...listTest,
        message: listTest.success
          ? '标准模式鉴权成功，已跳过图像生成测试以避免计费'
          : `标准模式测试失败: ${listTest.message}`,
        details: listTest.success
          ? {
              model: modelId,
              responseFormat: 'models',
            }
          : listTest.details,
        responseTime: responseTime(),
      };
    }

    const response = nativeGemini
      ? await runGeminiGenerateContentTest(cleanBase, resolved)
      : nativeClaude
        ? await runClaudeMessagesTest(cleanBase, resolved)
        : await runOpenAIChatTest(cleanBase, resolved);

    const elapsed = responseTime();
    const responseText = await response.text();

    if (!response.ok) {
      return buildFailureResult({
        startTime,
        status: response.status,
        responseText,
        fallbackMessage: `HTTP ${response.status}`,
      });
    }

    const result = JSON.parse(responseText);

    if (nativeGemini) {
      const parts = result.candidates?.[0]?.content?.parts || [];
      const textPreview = parts
        .map((part: any) => part?.text)
        .filter((value: unknown) => typeof value === 'string' && value.trim())
        .join(' ')
        .slice(0, 100);

      return {
        success: true,
        message: '原生 Gemini 链路连接成功',
        details: {
          model: modelId,
          responseFormat: 'generate-content',
          responsePreview: textPreview ? `${textPreview}...` : 'Native generateContent responded successfully.',
        },
        responseTime: elapsed,
      };
    }

    if (nativeClaude) {
      const preview = Array.isArray(result.content)
        ? result.content
            .map((block: any) => block?.text || '')
            .join(' ')
            .slice(0, 100)
        : String(result.content || '').slice(0, 100);

      return {
        success: true,
        message: 'Claude Native 链路连接成功',
        details: {
          model: modelId,
          responseFormat: 'claude-messages',
          responsePreview: preview ? `${preview}...` : 'Claude messages responded successfully.',
        },
        responseTime: elapsed,
      };
    }

    if (Array.isArray(result.choices) && result.choices.length > 0) {
      return {
        success: true,
        message: 'API 连接成功',
        details: {
          model: modelId,
          responseFormat: 'chat-completions',
          responsePreview: `${String(result.choices[0].message?.content || '').slice(0, 100)}...`,
        },
        responseTime: elapsed,
      };
    }

    return {
      success: false,
      message: nativeGemini ? '原生响应格式异常，缺少 candidates 字段' : '响应格式异常，缺少 choices 字段',
      details: { response: result },
      responseTime: elapsed,
    };
  } catch (error: any) {
    return buildFailureResult({
      startTime,
      error,
      fallbackMessage: error?.message || 'Connection failed',
    });
  }
}

/**
 * Tests model-list access for the configured channel.
 */
export async function testModelsList(config: ConnectionConfig): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const resolved = resolveConfig(config);
    const cleanBase = getCleanBaseUrl(resolved.baseUrl);
    const runtime = resolveConnectionRuntime(resolved, cleanBase);
    const nativeGemini = runtime.protocolFamily === 'gemini-native';
    const nativeClaude = runtime.protocolFamily === 'claude-native';
    const listUrl = nativeGemini
      ? buildGeminiModelsEndpoint(cleanBase, resolved.apiKey, runtime.authMethod as AuthMethod, resolved.provider)
      : nativeClaude
        ? buildClaudeEndpoint(cleanBase || 'https://api.anthropic.com', '/models')
      : buildOpenAIEndpoint(cleanBase || 'https://api.openai.com', '/models');
    const headers = nativeGemini
      ? buildGeminiHeaders(runtime.authMethod as AuthMethod, resolved.apiKey, runtime.headerName, runtime.authorizationValueFormat)
      : nativeClaude
        ? buildClaudeHeaders(runtime.authMethod as AuthMethod, resolved.apiKey, runtime.headerName, runtime.authorizationValueFormat)
        : buildProxyHeaders(runtime.authMethod as AuthMethod, resolved.apiKey, runtime.headerName, undefined, runtime.authorizationValueFormat);

    const response = await fetch(listUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(15000),
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      const failure = classifyApiFailure({
        status: response.status,
        responseText,
        fallbackMessage: `HTTP ${response.status}`,
      });
      return {
        success: false,
        message: `无法获取模型列表: ${buildUserFacingApiErrorMessage(failure)}`,
        details: {
          status: response.status,
          detail: failure.detail,
          kind: failure.kind,
        },
        responseTime,
      };
    }

    const data = await response.json();
    const models = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.models)
        ? data.models
        : Array.isArray(data)
          ? data
          : [];

    return {
      success: true,
      message: `成功获取 ${models.length} 个模型`,
      details: {
        modelCount: models.length,
        models: models.slice(0, 5).map((model: any) => model.id || model.name || model.model || String(model)),
      },
      responseTime,
    };
  } catch (error: any) {
    const failure = classifyApiFailure({
      error,
      fallbackMessage: error?.message || 'Model list request failed',
    });
    return {
      success: false,
      message: `获取模型列表失败: ${buildUserFacingApiErrorMessage(failure)}`,
      details: {
        status: failure.status,
        detail: failure.detail,
        kind: failure.kind,
      },
      responseTime: Date.now() - startTime,
    };
  }
}

/**
 * Runs both model-list and protocol checks.
 */
export async function comprehensiveConnectionTest(config: ConnectionConfig): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const basicTest = await testModelsList(config);
  results.push({
    ...basicTest,
    message: `基础连接: ${basicTest.message}`,
  });

  let apiTest: TestResult;
  try {
    apiTest = await testCherryConnection(config);
  } catch (error: any) {
    apiTest = {
      success: false,
      message: error.message || 'Unknown error',
      responseTime: 0,
    };
  }

  results.push({
    ...apiTest,
    message: `API功能: ${apiTest.message}`,
  });

  if (!basicTest.success && apiTest.success) {
    console.warn('[ConnectionTest] Model list failed but protocol test passed. Treating channel as usable.');
  }

  return results;
}
