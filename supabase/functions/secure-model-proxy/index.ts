import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ProxyRequest = {
  mode: 'chat';
  modelId: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function normalizeModelId(input: string): string {
  return (input || '').split('@')[0].trim();
}

function pickRandomKey(keys: string[]): string | null {
  if (!Array.isArray(keys) || keys.length === 0) return null;
  const valid = keys.filter((key) => typeof key === 'string' && key.trim().length > 0);
  if (valid.length === 0) return null;
  const index = Math.floor(Math.random() * valid.length);
  return valid[index];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ success: false, error: 'Supabase env vars are missing' }, 500);
    }

    const authHeader = req.headers.get('Authorization') || '';

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ success: false, error: 'Unauthorized' }, 401);
    }

    const body = (await req.json()) as ProxyRequest;
    if (!body || body.mode !== 'chat') {
      return json({ success: false, error: 'Unsupported mode' }, 400);
    }

    const modelId = normalizeModelId(body.modelId);
    if (!modelId) {
      return json({ success: false, error: 'modelId is required' }, 400);
    }

    const { data: creditModel, error: modelError } = await serviceClient
      .from('admin_credit_models')
      .select('base_url, api_keys, endpoint_type, model_id, credit_cost')
      .eq('model_id', modelId)
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (modelError || !creditModel) {
      return json({ success: false, error: 'Model route not found' }, 404);
    }

    const selectedKey = pickRandomKey(creditModel.api_keys || []);
    if (!selectedKey) {
      return json({ success: false, error: 'Provider key is not configured' }, 500);
    }

    const requiredCredits = Math.max(1, Number(creditModel.credit_cost || 1));

    const { data: hasCredits, error: creditError } = await userClient.rpc('check_user_credits', {
      user_id: user.id,
      required_credits: requiredCredits,
    });

    if (creditError || !hasCredits) {
      return json({ success: false, error: 'Insufficient credits' }, 402);
    }

    const endpointType = creditModel.endpoint_type === 'gemini' ? 'gemini' : 'openai';
    const baseUrl = String(creditModel.base_url || '').replace(/\/$/, '');

    let content = '';
    let usage: { promptTokens: number; completionTokens: number; totalTokens: number } = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    if (endpointType === 'gemini') {
      const geminiMessages = (body.messages || []).map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content || '' }],
      }));

      const geminiResponse = await fetch(
        `${baseUrl}/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(selectedKey)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: geminiMessages,
            generationConfig: {
              temperature: body.temperature ?? 0.7,
              maxOutputTokens: body.maxTokens ?? 2048,
            },
          }),
        }
      );

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        return json({ success: false, error: `Upstream error: ${geminiResponse.status} ${errorText}` }, 502);
      }

      const result = await geminiResponse.json();
      content = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      usage = {
        promptTokens: Number(result?.usageMetadata?.promptTokenCount || 0),
        completionTokens: Number(result?.usageMetadata?.candidatesTokenCount || 0),
        totalTokens: Number(result?.usageMetadata?.totalTokenCount || 0),
      };
    } else {
      const chatResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${selectedKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: body.messages,
          max_tokens: body.maxTokens ?? 2048,
          temperature: body.temperature ?? 0.7,
          stream: false,
        }),
      });

      if (!chatResponse.ok) {
        const errorText = await chatResponse.text();
        return json({ success: false, error: `Upstream error: ${chatResponse.status} ${errorText}` }, 502);
      }

      const result = await chatResponse.json();
      content = result?.choices?.[0]?.message?.content || '';
      usage = {
        promptTokens: Number(result?.usage?.prompt_tokens || 0),
        completionTokens: Number(result?.usage?.completion_tokens || 0),
        totalTokens: Number(result?.usage?.total_tokens || 0),
      };
    }

    const { error: deductError } = await userClient.rpc('deduct_user_credits', {
      user_id: user.id,
      credits: requiredCredits,
      model_id: modelId,
    });

    if (deductError) {
      return json({ success: false, error: 'Credit deduction failed after upstream success' }, 500);
    }

    return json({
      success: true,
      content,
      usage,
      endpointType,
      deducted: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ success: false, error: message }, 500);
  }
});
