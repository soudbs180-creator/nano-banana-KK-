/**
 * API密钥安全服务 - 使用示例
 * 
 * 这些示例展示了如何在实际代码中使用新的安全架构
 */

import { callAiApiSecure, getSecureModelRoute, addUserApiKey } from './apiKeySecureStorage';

// =====================================================
// 示例1：简单的AI调用（推荐）
// =====================================================
export async function exampleSimpleChat() {
  try {
    const result = await callAiApiSecure(
      'gemini-pro',  // 模型ID
      [{ role: 'user', content: '你好，请介绍一下自己' }],
      { temperature: 0.7 }
    );
    
    console.log('AI回复:', result.content);
    return result.content;
  } catch (error) {
    console.error('调用失败:', error);
    throw error;
  }
}

// =====================================================
// 示例2：流式响应
// =====================================================
export async function exampleStreamingChat(
  modelId: string,
  messages: unknown[],
  onChunk: (chunk: string) => void
) {
  // 1. 获取安全路由
  const route = await getSecureModelRoute(modelId);
  
  if (!route) {
    throw new Error('未找到可用的模型配置，请先配置API密钥');
  }
  
  // 2. 使用临时密钥调用流式API
  const response = await fetch(`${route.base_url}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${route.api_key}`,
      'X-Request-ID': crypto.randomUUID(),
    },
    body: JSON.stringify({
      model: route.model_id,
      messages,
      stream: true,  // 流式
      temperature: 0.7,
    }),
  });
  
  // 3. 处理流式响应
  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取响应');
  
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    onChunk(chunk);
  }
}

// =====================================================
// 示例3：图片生成
// =====================================================
export async function exampleImageGeneration(
  prompt: string,
  size: '1024x1024' | '512x512' = '1024x1024'
) {
  const route = await getSecureModelRoute('dall-e-3');
  
  if (!route) {
    throw new Error('未配置图片生成密钥');
  }
  
  const response = await fetch(`${route.base_url}/v1/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${route.api_key}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      size,
      n: 1,
    }),
  });
  
  const data = await response.json();
  return data.data[0].url;  // 图片URL
}

// =====================================================
// 示例4：兼容旧代码的包装器
// =====================================================

// 旧的keyManager风格包装
export const secureKeyManager = {
  /**
   * 获取指定模型的API密钥
   * 兼容旧代码风格
   */
  async getKeyForModel(modelId: string): Promise<string | null> {
    try {
      const route = await getSecureModelRoute(modelId);
      return route?.api_key || null;
    } catch {
      return null;
    }
  },
  
  /**
   * 检查是否有可用的密钥
   */
  async hasKeyForModel(modelId: string): Promise<boolean> {
    const route = await getSecureModelRoute(modelId);
    return route !== null;
  },
  
  /**
   * 获取模型配置（包含base_url等）
   */
  async getModelConfig(modelId: string) {
    const route = await getSecureModelRoute(modelId);
    if (!route) return null;
    
    return {
      apiKey: route.api_key,
      baseUrl: route.base_url,
      modelId: route.model_id,
      creditCost: route.credit_cost,
    };
  }
};

// =====================================================
// 示例5：批量调用（使用同一密钥）
// =====================================================
export async function exampleBatchCalls(
  modelId: string,
  prompts: string[]
) {
  // 1. 只获取一次密钥
  const route = await getSecureModelRoute(modelId);
  if (!route) throw new Error('未配置密钥');
  
  // 2. 批量调用（使用同一临时密钥）
  const results = await Promise.all(
    prompts.map(async (prompt) => {
      const response = await fetch(`${route.base_url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${route.api_key}`,
        },
        body: JSON.stringify({
          model: route.model_id,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      
      const data = await response.json();
      return data.choices[0].message.content;
    })
  );
  
  return results;
}

// =====================================================
// 示例6：带重试的请求
// =====================================================
export async function exampleRequestWithRetry(
  modelId: string,
  messages: unknown[],
  maxRetries = 3
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // 每次重试都获取新密钥（防止过期）
      const route = await getSecureModelRoute(modelId);
      if (!route) throw new Error('未配置密钥');
      
      const response = await fetch(`${route.base_url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${route.api_key}`,
        },
        body: JSON.stringify({
          model: route.model_id,
          messages,
        }),
      });
      
      if (response.ok) {
        return await response.json();
      }
      
      // 如果是401，可能是密钥问题，不重试
      if (response.status === 401) {
        throw new Error('API密钥无效');
      }
      
      // 其他错误，等待后重试
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    } catch (error) {
      if (i === maxRetries - 1) throw error;
    }
  }
}

// =====================================================
// 快速测试代码
// =====================================================
export async function runTests() {
  console.log('🧪 测试安全API服务');
  
  // 测试1：检查密钥是否配置
  const hasKey = await secureKeyManager.hasKeyForModel('gemini-pro');
  console.log('✓ 密钥已配置:', hasKey);
  
  if (hasKey) {
    // 测试2：简单调用
    try {
      const result = await exampleSimpleChat();
      console.log('✓ 调用成功');
    } catch (e) {
      console.error('✗ 调用失败:', e);
    }
  } else {
    console.log('⚠️  请先配置密钥');
  }
}
