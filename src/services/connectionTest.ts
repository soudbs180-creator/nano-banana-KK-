/**
 * 连接测试服务
 * 用于测试 Cherry API 和其他模型服务的连接状态
 */

import { buildProxyHeaders, normalizeProxyBaseUrl } from './apiConfig';

export interface TestResult {
  success: boolean;
  message: string;
  details?: any;
  responseTime?: number;
}

export interface ConnectionConfig {
  apiKey: string;
  baseUrl: string;
  model?: string;
  provider: string;
  compatibilityMode?: 'standard' | 'chat';
}

/**
 * 测试 Cherry API 连接
 */
export async function testCherryConnection(config: ConnectionConfig): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const cleanBase = normalizeProxyBaseUrl(config.baseUrl) || config.baseUrl.replace(/\/$/, '');

    // Google Official API Special Handling
    if (config.provider === 'Google' || cleanBase.includes('googleapis.com')) {
      // Use a simple generateContent test for Google
      const apiUrl = `${cleanBase}/v1beta/models/gemini-2.5-flash:generateContent`;
      const requestBody = {
        contents: [{ role: 'user', parts: [{ text: 'Hi' }] }]
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.apiKey
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30000)
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        const errText = await response.text();
        return {
          success: false,
          message: `连接失败: HTTP ${response.status}`,
          details: { error: errText },
          responseTime
        };
      }

      const result = await response.json();
      return {
        success: true,
        message: 'Google API 连接成功！',
        details: { response: result },
        responseTime
      };
    }

    // Standard OpenAI / Proxy Handling
    const apiUrl = `${cleanBase}/v1/chat/completions`;

    const requestBody = {
      model: config.model || 'gemini-2.5-flash-image',
      stream: false,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Test connection' }
          ]
        }
      ],
      max_tokens: 10
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: buildProxyHeaders('header', config.apiKey, 'Authorization'),
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30000)
    });

    const responseTime = Date.now() - startTime;
    const responseText = await response.text();

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errData = JSON.parse(responseText);
        errorMessage = errData.error?.message || errorMessage;
      } catch {
        errorMessage = responseText || errorMessage;
      }
      return {
        success: false,
        message: `连接失败: ${errorMessage}`,
        responseTime
      };
    }

    const result = JSON.parse(responseText);

    // 检查响应格式
    if (result.choices && result.choices.length > 0) {
      return {
        success: true,
        message: 'API 连接成功！',
        details: {
          model: config.model,
          responseFormat: 'chat-completions',
          responsePreview: result.choices[0].message?.content?.slice(0, 100) + '...'
        },
        responseTime
      };
    } else {
      return {
        success: false,
        message: '响应格式异常：缺少 choices 字段',
        details: { response: result },
        responseTime
      };
    }

  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    return {
      success: false,
      message: `网络错误: ${error.message}`,
      responseTime
    };
  }
}

/**
 * 测试模型列表获取
 */
export async function testModelsList(config: ConnectionConfig): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const cleanBase = normalizeProxyBaseUrl(config.baseUrl) || config.baseUrl.replace(/\/$/, '');
    let listUrl: string;
    let headers: Record<string, string> = {};

    if (config.provider === 'Google' || cleanBase.includes('googleapis.com')) {
      // Google Official: URL without query key, verify via Header
      listUrl = `${cleanBase}/v1beta/models`;
      headers = {
        'x-goog-api-key': config.apiKey
      };
    } else {
      // API Proxies / OpenAI
      listUrl = `${cleanBase}/v1/models`;
      headers = buildProxyHeaders('header', config.apiKey, 'Authorization');
    }

    const response = await fetch(listUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000)
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      return {
        success: false,
        message: `无法获取模型列表: HTTP ${response.status}`,
        responseTime
      };
    }

    const data = await response.json();
    const models = data.data || data.models || [];

    return {
      success: true,
      message: `成功获取 ${models.length} 个模型`,
      details: {
        modelCount: models.length,
        models: models.slice(0, 5).map((m: any) => m.id || m.name)
      },
      responseTime
    };

  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    return {
      success: false,
      message: `获取模型列表失败: ${error.message}`,
      responseTime
    };
  }
}

/**
 * 综合连接测试
 */
export async function comprehensiveConnectionTest(config: ConnectionConfig): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // 1. 基础连接测试
  const basicTest = await testModelsList(config);
  results.push({
    ...basicTest,
    message: `基础连接: ${basicTest.message}`
  });

  // 2. API 功能测试
  if (basicTest.success) {
    const apiTest = await testCherryConnection(config);
    results.push({
      ...apiTest,
      message: `API功能: ${apiTest.message}`
    });
  } else {
    results.push({
      success: false,
      message: 'API功能: 跳过（基础连接失败）'
    });
  }

  return results;
}