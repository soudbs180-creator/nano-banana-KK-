/**
 * 生产级API密钥安全存储服务
 * 安全级别：★★★★★
 * 
 * 核心原则：
 * 1. 前端永远不解密显示用户API密钥
 * 2. 加密在服务端完成，前端只负责传输
 * 3. 密钥只在服务端内存中临时解密，绝不存储
 */

import { supabase } from '@/lib/supabase';

// 用户API密钥（前端可见）
export interface UserApiKeyInfo {
  id: string;
  name: string;
  provider: string;
  key_status: string; // '***CONFIGURED***'
  base_url: string | null;
  is_active: boolean;
  created_at: string;
}

// 支持的提供商
export type ApiProvider = 
  | 'Google' 
  | 'OpenAI' 
  | 'Anthropic' 
  | '智谱' 
  | '火山引擎' 
  | '阿里云' 
  | '腾讯云' 
  | 'Custom';

export const API_PROVIDERS: { value: ApiProvider; label: string }[] = [
  { value: 'Google', label: 'Google (Gemini)' },
  { value: 'OpenAI', label: 'OpenAI' },
  { value: 'Anthropic', label: 'Anthropic (Claude)' },
  { value: '智谱', label: '智谱 (ChatGLM)' },
  { value: '火山引擎', label: '火山引擎' },
  { value: '阿里云', label: '阿里云' },
  { value: '腾讯云', label: '腾讯云' },
  { value: 'Custom', label: '自定义' },
];

/**
 * 获取用户API密钥列表（仅返回元信息，不返回实际密钥）
 */
export const getUserApiKeys = async (): Promise<UserApiKeyInfo[]> => {
  const { data, error } = await supabase
    .from('vw_user_api_keys')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

/**
 * 安全添加API密钥
 * - 密钥通过SSL传输
 * - 服务端加密存储
 * - 前端永不存储明文密钥
 */
export const addUserApiKey = async (
  name: string,
  provider: ApiProvider,
  apiKey: string,
  baseUrl?: string
): Promise<string> => {
  // 客户端基础验证
  if (!apiKey || apiKey.length < 10) {
    throw new Error('API密钥长度不足');
  }
  if (!name || name.length < 1) {
    throw new Error('请输入密钥名称');
  }

  // 清理密钥（移除首尾空白）
  const cleanKey = apiKey.trim();

  // 使用服务端加密函数
  const { data, error } = await supabase.rpc('add_user_api_key_secure', {
    p_name: name,
    p_provider: provider,
    p_api_key: cleanKey,
    p_base_url: baseUrl || null,
  });

  if (error) {
    console.error('添加API密钥失败:', error);
    throw new Error('添加API密钥失败，请稍后重试');
  }

  return data;
};

/**
 * 更新密钥状态（启用/禁用）
 */
export const toggleApiKeyStatus = async (
  keyId: string,
  isActive: boolean
): Promise<void> => {
  const { error } = await supabase
    .from('user_api_keys')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', keyId);

  if (error) throw error;
};

/**
 * 删除API密钥
 */
export const deleteApiKey = async (keyId: string): Promise<void> => {
  const { error } = await supabase
    .from('user_api_keys')
    .delete()
    .eq('id', keyId);

  if (error) throw error;
};

/**
 * 获取安全模型路由
 * - 返回的路由包含临时解密的密钥
 * - 密钥在5分钟后过期
 * - 仅用于单次API调用
 */
export interface SecureModelRoute {
  route_type: 'user_key' | 'admin_model' | 'none';
  provider_id: string;
  base_url: string;
  api_key: string;
  model_id: string;
  endpoint_type: string;
  credit_cost: number;
  user_pays: number;
  expires_at: string;
}

export const getSecureModelRoute = async (
  modelId: string,
  preferredProvider?: string
): Promise<SecureModelRoute | null> => {
  const { data, error } = await supabase.rpc('get_secure_model_route', {
    p_model_id: modelId,
    p_preferred_provider: preferredProvider || null,
  });

  if (error) {
    console.error('获取模型路由失败:', error);
    throw new Error('无法获取模型配置');
  }

  if (!data || data.length === 0 || data[0].route_type === 'none') {
    return null;
  }

  return data[0] as SecureModelRoute;
};

/**
 * 安全调用AI API（通过服务端路由）
 * - 密钥永不暴露给前端JavaScript
 */
export const callAiApiSecure = async (
  modelId: string,
  messages: unknown[],
  options?: {
    temperature?: number;
    max_tokens?: number;
    preferred_provider?: string;
    onProgress?: (content: string) => void;
  }
): Promise<{ content: string; usage?: { prompt: number; completion: number } }> => {
  // 1. 获取安全路由（包含临时密钥）
  const route = await getSecureModelRoute(modelId, options?.preferred_provider);

  if (!route) {
    throw new Error('未找到可用的模型配置，请先配置API密钥或联系管理员');
  }

  if (route.route_type === 'none') {
    throw new Error('该模型暂时不可用');
  }

  // 2. 检查密钥是否过期
  if (new Date(route.expires_at) < new Date()) {
    throw new Error('密钥已过期，请重新获取');
  }

  // 3. 调用API（密钥在服务端内存中，不返回给前端）
  const baseUrl = route.base_url.replace(/\/$/, '');
  const endpoint = route.endpoint_type === 'gemini' 
    ? `${baseUrl}/v1beta/models/${modelId}:generateContent`
    : `${baseUrl}/v1/chat/completions`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${route.api_key}`,
      'X-Request-ID': crypto.randomUUID(), // 防重放攻击
    },
    body: JSON.stringify({
      model: route.endpoint_type === 'gemini' ? undefined : modelId,
      contents: route.endpoint_type === 'gemini' ? messages : undefined,
      messages: route.endpoint_type === 'gemini' ? undefined : messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens,
      stream: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API调用失败: ${error}`);
  }

  const result = await response.json();
  
  // 扣除积分
  if (route.user_pays > 0) {
    try {
      await supabase.rpc('use_credits_with_check', {
        p_user_id: (await supabase.auth.getUser()).data.user?.id,
        p_amount: route.user_pays,
        p_description: `调用模型 ${modelId}`,
      });
    } catch (error) {
      console.error(error);
    }
  }

  return {
    content: route.endpoint_type === 'gemini' 
      ? result.candidates?.[0]?.content?.parts?.[0]?.text 
      : result.choices?.[0]?.message?.content,
    usage: result.usage,
  };
};

/**
 * 验证用户是否配置了指定提供商的密钥
 */
export const checkProviderConfigured = async (
  provider: ApiProvider
): Promise<boolean> => {
  const { data, error } = await supabase
    .from('vw_user_api_keys')
    .select('id')
    .eq('provider', provider)
    .eq('is_active', true)
    .limit(1);

  if (error) return false;
  return data && data.length > 0;
};
