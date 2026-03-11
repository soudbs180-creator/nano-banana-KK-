import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ProxyRequest = {
  mode: 'chat' | 'image' | 'video' | 'audio' | 'task_status' | 'cancel_task' | 'delete_task' | 'download_task';
  modelId: string;
  messages?: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  prompt?: string;
  aspectRatio?: string;
  imageSize?: string;
  imageCount?: number;
  referenceImages?: Array<string | { data: string; mimeType?: string }>;
  resolution?: string;
  duration?: number;
  videoDuration?: string;
  imageUrl?: string;
  imageTailUrl?: string;
  taskId?: string;
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

function normalizeImageSize(imageSize?: string): string {
  const raw = String(imageSize || '1K').toUpperCase();
  if (raw.includes('4K')) return '4K';
  if (raw.includes('2K')) return '2K';
  if (raw.includes('0.5K') || raw.includes('512')) return '0.5K';
  return '1K';
}

type CreditModelRouteRow = {
  base_url?: string | null;
  api_keys?: string[] | null;
  endpoint_type?: string | null;
  model_id?: string | null;
  credit_cost?: number | null;
  display_name?: string | null;
  provider_id?: string | null;
  priority?: number | null;
  weight?: number | null;
  call_count?: number | null;
  advanced_enabled?: boolean | null;
  mix_with_same_model?: boolean | null;
  quality_pricing?: Record<string, { enabled?: boolean; creditCost?: number; credit_cost?: number } | null> | null;
};

function normalizeQualityPricing(
  pricing: CreditModelRouteRow['quality_pricing'],
  fallbackCost: number
): Record<string, { enabled: boolean; creditCost: number }> {
  const safeCost = Math.max(1, Number(fallbackCost || 1));
  const defaults = {
    '0.5K': { enabled: true, creditCost: Math.max(1, Math.floor(safeCost * 0.5)) },
    '1K': { enabled: true, creditCost: safeCost },
    '2K': { enabled: true, creditCost: safeCost * 2 },
    '4K': { enabled: true, creditCost: safeCost * 4 },
  };

  if (!pricing || typeof pricing !== 'object') {
    return defaults;
  }

  for (const size of ['0.5K', '1K', '2K', '4K']) {
    const item = pricing[size];
    if (!item || typeof item !== 'object') continue;
    defaults[size] = {
      enabled: item.enabled !== false,
      creditCost: Math.max(1, Number(item.creditCost || item.credit_cost || defaults[size].creditCost)),
    };
  }

  return defaults;
}

function isRouteQualityEnabled(route: CreditModelRouteRow, requestedSize: string): boolean {
  if (!route.advanced_enabled) return true;
  const pricing = normalizeQualityPricing(route.quality_pricing, Number(route.credit_cost || 1));
  return pricing[requestedSize]?.enabled !== false;
}

function getRouteCreditCost(route: CreditModelRouteRow, requestedSize: string): number {
  if (!route.advanced_enabled) {
    return Math.max(1, Number(route.credit_cost || 1));
  }

  const pricing = normalizeQualityPricing(route.quality_pricing, Number(route.credit_cost || 1));
  return Math.max(1, Number(pricing[requestedSize]?.creditCost || route.credit_cost || 1));
}

/**
 * 基于用量平衡的路由选择
 * 优先选择调用次数最少的供应商，实现API用量均衡
 */
function pickCreditModelRoute(
  routes: CreditModelRouteRow[],
  requestedSize: string
): { route: CreditModelRouteRow; requiredCredits: number } | null {
  const eligibleRoutes = routes.filter((route) => isRouteQualityEnabled(route, requestedSize));
  if (eligibleRoutes.length === 0) return null;

  const mixedRoutes = eligibleRoutes.filter((route) => route.mix_with_same_model === true);
  
  // 混合模式：基于用量平衡选择
  if (mixedRoutes.length > 1) {
    // 按调用次数升序排序，优先选择用量最少的
    const sortedByUsage = [...mixedRoutes].sort((a, b) => {
      const countA = a.call_count ?? 0;
      const countB = b.call_count ?? 0;
      if (countA !== countB) return countA - countB;
      
      // 如果调用次数相同，按价格优先
      const costA = getRouteCreditCost(a, requestedSize);
      const costB = getRouteCreditCost(b, requestedSize);
      if (costA !== costB) return costA - costB;
      
      // 最后按权重
      return (b.weight ?? 1) - (a.weight ?? 1);
    });
    
    const selectedRoute = sortedByUsage[0];
    return {
      route: selectedRoute,
      requiredCredits: getRouteCreditCost(selectedRoute, requestedSize),
    };
  }

  const selectedRoute = eligibleRoutes[0];
  return {
    route: selectedRoute,
    requiredCredits: getRouteCreditCost(selectedRoute, requestedSize),
  };
}

function mapAspectRatioToOpenAI(aspectRatio?: string): string {
  switch (aspectRatio) {
    case '16:9': return '1792x1024';
    case '9:16': return '1024x1792';
    case '3:2': return '1536x1024';
    case '2:3': return '1024x1536';
    case '4:3': return '1024x768';
    case '3:4': return '768x1024';
    default: return '1024x1024';
  }
}

type EncodedSystemTask = {
  kind: 'video';
  modelId: string;
  endpointType: 'gemini' | 'openai';
  operationName: string;
  transactionId: string;
  userId: string;
};

type SignedSystemTask = EncodedSystemTask & {
  sig: string;
};

async function signTaskPayload(secret: string, payload: EncodedSystemTask): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return Array.from(new Uint8Array(signature))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('');
}

async function encodeTaskPayload(payload: EncodedSystemTask, secret: string): Promise<string> {
  const sig = await signTaskPayload(secret, payload);
  return `system_proxy:${btoa(JSON.stringify({ ...payload, sig } satisfies SignedSystemTask))}`;
}

async function decodeTaskPayload(taskId: string, secret: string): Promise<EncodedSystemTask | null> {
  if (!taskId.startsWith('system_proxy:')) return null;
  try {
    const raw = atob(taskId.slice('system_proxy:'.length));
    const parsed = JSON.parse(raw) as Partial<SignedSystemTask>;
    if (
      !parsed ||
      parsed.kind !== 'video' ||
      typeof parsed.modelId !== 'string' ||
      typeof parsed.endpointType !== 'string' ||
      typeof parsed.operationName !== 'string' ||
      typeof parsed.transactionId !== 'string' ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.sig !== 'string'
    ) {
      return null;
    }

    const payload: EncodedSystemTask = {
      kind: 'video',
      modelId: parsed.modelId,
      endpointType: parsed.endpointType === 'gemini' ? 'gemini' : 'openai',
      operationName: parsed.operationName,
      transactionId: parsed.transactionId,
      userId: parsed.userId,
    };
    const expectedSig = await signTaskPayload(secret, payload);
    if (expectedSig !== parsed.sig) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function normalizeAspectRatio(aspectRatio?: string): string | undefined {
  const value = String(aspectRatio || '').trim();
  if (!value || value.toLowerCase() === 'auto') return undefined;
  return value;
}

function getVideoDurationSeconds(body: ProxyRequest): number | undefined {
  if (typeof body.duration === 'number' && Number.isFinite(body.duration) && body.duration > 0) {
    return Math.round(body.duration);
  }

  const legacyValue = Number.parseInt(String(body.videoDuration || '').trim(), 10);
  if (Number.isFinite(legacyValue) && legacyValue > 0) {
    return legacyValue;
  }

  return undefined;
}

function isGeminiImageCompatModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return (lower.includes('gemini') && lower.includes('image')) ||
    lower.includes('nano-banana') ||
    lower.includes('banana');
}

function toOpenAIImageUrl(ref: string | { data: string; mimeType?: string }): string | null {
  if (typeof ref === 'string') {
    if (ref.startsWith('data:')) return ref;
    return null;
  }

  const rawData = String(ref.data || '');
  if (!rawData) return null;
  if (rawData.startsWith('data:')) return rawData;
  return `data:${ref.mimeType || 'image/png'};base64,${rawData}`;
}

function extractImageUrlsFromOpenAICompatPayload(data: any): string[] {
  const urls: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) {
      urls.push(value.trim());
    }
  };

  const candidates = [
    ...(Array.isArray(data?.data) ? data.data : []),
    ...(Array.isArray(data?.images) ? data.images : []),
    ...(Array.isArray(data?.choices?.[0]?.message?.images) ? data.choices[0].message.images : []),
  ];

  candidates.forEach((item: any) => {
    if (!item || typeof item !== 'object') return;
    const b64 = item.b64_json || item.b64 || item.base64;
    if (typeof b64 === 'string' && b64.trim()) {
      urls.push(`data:image/png;base64,${b64.replace(/\s+/g, '')}`);
      return;
    }
    push(item.url);
    push(item.image_url);
  });

  const content = String(data?.choices?.[0]?.message?.content || '');
  const markdownMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  if (markdownMatch?.[1]) {
    push(markdownMatch[1]);
  }
  const dataUrlMatch = content.match(/data:(image\/[^;]+);base64,([A-Za-z0-9+/=\s]+)/);
  if (dataUrlMatch?.[2]) {
    urls.push(`data:${dataUrlMatch[1]};base64,${dataUrlMatch[2].replace(/\s+/g, '')}`);
  }

  return Array.from(new Set(urls));
}

async function tryDeleteUpstreamVideoTask(
  endpointType: 'gemini' | 'openai',
  baseUrl: string,
  selectedKey: string,
  operationName: string
): Promise<void> {
  try {
    if (endpointType === 'gemini') {
      const apiBase = baseUrl.includes('/v1') ? baseUrl : `${baseUrl}/v1beta`;
      await fetch(`${apiBase}/${operationName}?key=${encodeURIComponent(selectedKey)}`, {
        method: 'DELETE',
        headers: {
          'x-goog-api-key': selectedKey,
        },
      }).catch(() => undefined);
      return;
    }

    const openaiBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
    const candidateUrls = [
      `${openaiBase}/videos/${operationName}`,
      `${openaiBase}/videos/generations/${operationName}`,
    ];
    for (const url of candidateUrls) {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${selectedKey}`,
        },
      }).catch(() => null);
      if (response && (response.ok || response.status === 404 || response.status === 409)) {
        break;
      }
    }
  } catch {
    // Best-effort cleanup only.
  }
}

async function downloadVideoAsDataUrl(
  videoUrl: string,
  headers: HeadersInit
): Promise<string> {
  const downloadResponse = await fetch(videoUrl, { headers });
  if (!downloadResponse.ok) {
    throw new Error('Failed to download generated video');
  }
  const videoBuffer = await downloadResponse.arrayBuffer();
  const bytes = new Uint8Array(videoBuffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const base64Video = btoa(binary);
  return `data:video/mp4;base64,${base64Video}`;
}

function buildGoogleImageExtraBody(body: ProxyRequest): Record<string, unknown> | undefined {
  const imageConfig: Record<string, unknown> = {};
  const aspectRatio = normalizeAspectRatio(body.aspectRatio);
  if (aspectRatio) {
    imageConfig.aspect_ratio = aspectRatio;
  }
  if (body.imageSize) {
    imageConfig.image_size = normalizeImageSize(body.imageSize);
  }

  if (!Object.keys(imageConfig).length) {
    return undefined;
  }

  return {
    google: {
      image_config: imageConfig,
    },
  };
}

async function appendOpenAIVideoReference(formData: FormData, imageSource: string): Promise<void> {
  if (!imageSource) return;

  if (imageSource.startsWith('data:')) {
    const response = await fetch(imageSource);
    const blob = await response.blob();
    formData.append('input_reference', blob, 'reference-image.png');
    return;
  }

  try {
    const response = await fetch(imageSource);
    if (response.ok) {
      const blob = await response.blob();
      const fileName = blob.type.includes('jpeg') ? 'reference-image.jpg' : 'reference-image.png';
      formData.append('input_reference', blob, fileName);
      return;
    }
  } catch {
    // Fall through to string-based compatibility field.
  }

  formData.append('image', imageSource);
}

async function fetchJsonWithFallback(
  urls: string[],
  init?: RequestInit
): Promise<{ data: any; url: string }> {
  let lastErrorText = '';
  let lastStatus = 0;

  for (const url of urls) {
    const response = await fetch(url, init);
    if (response.ok) {
      return {
        data: await response.json(),
        url,
      };
    }
    lastStatus = response.status;
    lastErrorText = await response.text().catch(() => '');
  }

  throw new Error(`Upstream error: ${lastStatus} ${lastErrorText}`);
}

async function toInlineImagePart(ref: string | { data: string; mimeType?: string }) {
  if (typeof ref === 'string') {
    const match = ref.match(/^data:(.+?);base64,(.+)$/);
    if (match) {
      return {
        inlineData: {
          mimeType: match[1] || 'image/png',
          data: match[2] || '',
        },
      };
    }
    return null;
  }

  const rawData = String(ref.data || '');
  const match = rawData.match(/^data:(.+?);base64,(.+)$/);
  if (match) {
    return {
      inlineData: {
        mimeType: match[1] || ref.mimeType || 'image/png',
        data: match[2] || '',
      },
    };
  }

  return {
    inlineData: {
      mimeType: ref.mimeType || 'image/png',
      data: rawData,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  let fatalRefund:
    | ((errorMessage: string, status?: number, refundReason?: string) => Promise<Response>)
    | null = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const taskSecret = Deno.env.get('SYSTEM_PROXY_TASK_SECRET') || serviceRoleKey;

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !taskSecret) {
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
    if (!body || !['chat', 'image', 'video', 'audio', 'task_status', 'cancel_task', 'delete_task', 'download_task'].includes(body.mode)) {
      return json({ success: false, error: 'Unsupported mode' }, 400);
    }

    if (body.mode === 'task_status' || body.mode === 'cancel_task' || body.mode === 'delete_task' || body.mode === 'download_task') {
      const taskPayload = await decodeTaskPayload(String(body.taskId || ''), taskSecret);
      if (!taskPayload) {
        return json({ success: false, error: 'Invalid task id' }, 400);
      }

      const { data: transactionRow, error: transactionError } = await serviceClient
        .from('credit_transactions')
        .select('id, user_id, model_id, status')
        .eq('id', taskPayload.transactionId)
        .maybeSingle();

      if (transactionError || !transactionRow) {
        return json({ success: false, error: 'Task transaction not found' }, 404);
      }

      if (String(transactionRow.user_id || '') !== user.id || taskPayload.userId !== user.id) {
        return json({ success: false, error: 'Forbidden task access' }, 403);
      }

      if (String(transactionRow.model_id || '') !== taskPayload.modelId) {
        return json({ success: false, error: 'Task metadata mismatch' }, 400);
      }

      const { data: creditModel, error: modelError } = await serviceClient
        .from('admin_credit_models')
        .select('base_url, api_keys, endpoint_type, model_id')
        .eq('model_id', taskPayload.modelId)
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

      const baseUrl = String(creditModel.base_url || '').replace(/\/$/, '');
      if (body.mode === 'delete_task') {
        await tryDeleteUpstreamVideoTask(taskPayload.endpointType, baseUrl, selectedKey, taskPayload.operationName);
        return json({ success: true, status: 'deleted', deducted: true });
      }

      if (body.mode === 'cancel_task' && taskPayload.endpointType === 'gemini') {
        const apiBase = baseUrl.includes('/v1') ? baseUrl : `${baseUrl}/v1beta`;
        const cancelResponse = await fetch(`${apiBase}/${taskPayload.operationName}:cancel?key=${encodeURIComponent(selectedKey)}`, {
          method: 'POST',
          headers: {
            'x-goog-api-key': selectedKey,
          },
        });

        if (!cancelResponse.ok) {
          const errorText = await cancelResponse.text();
          return json({ success: false, error: `Cancel failed: ${cancelResponse.status} ${errorText}` }, 502);
        }

        await serviceClient.rpc('refund_credits', {
          p_transaction_id: taskPayload.transactionId,
          p_reason: 'video_generation_cancelled',
        });

        return json({ success: true, status: 'failed', deducted: true });
      }

      if (body.mode === 'cancel_task') {
        const openaiBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const candidateUrls = [
          `${openaiBase}/videos/${taskPayload.operationName}`,
          `${openaiBase}/videos/generations/${taskPayload.operationName}`,
        ];

        let cancelled = false;
        for (const url of candidateUrls) {
          const response = await fetch(url, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${selectedKey}`,
            },
          });
          if (response.ok || response.status === 404 || response.status === 409) {
            cancelled = true;
            break;
          }
        }

        if (!cancelled) {
          return json({ success: false, error: 'Cancel failed for upstream video task' }, 502);
        }

        await serviceClient.rpc('refund_credits', {
          p_transaction_id: taskPayload.transactionId,
          p_reason: 'video_generation_cancelled',
        });

        return json({ success: true, status: 'failed', deducted: true });
      }

      if (taskPayload.endpointType === 'gemini') {
        const apiBase = baseUrl.includes('/v1') ? baseUrl : `${baseUrl}/v1beta`;
        const statusResponse = await fetch(`${apiBase}/${taskPayload.operationName}?key=${encodeURIComponent(selectedKey)}`, {
          headers: {
            'x-goog-api-key': selectedKey,
          },
        });

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          return json({ success: false, error: `Status polling failed: ${statusResponse.status} ${errorText}` }, 502);
        }

        const statusData = await statusResponse.json();
        if (!statusData.done) {
          return json({ success: true, status: 'pending', deducted: true });
        }

        const videoUri = statusData.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
        if (!videoUri) {
          await serviceClient.rpc('refund_credits', {
            p_transaction_id: taskPayload.transactionId,
            p_reason: 'video_generation_failed',
          });
          return json({ success: true, status: 'failed', deducted: true });
        }

        const dataUrl = await downloadVideoAsDataUrl(videoUri, {
          'x-goog-api-key': selectedKey,
        });
        await tryDeleteUpstreamVideoTask(taskPayload.endpointType, baseUrl, selectedKey, taskPayload.operationName);
        return json({
          success: true,
          status: 'success',
          url: dataUrl,
          deducted: true,
        });
      }

      const openaiBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
      const { data: statusData } = await fetchJsonWithFallback(
        [
          `${openaiBase}/videos/${taskPayload.operationName}`,
          `${openaiBase}/videos/generations/${taskPayload.operationName}`,
        ],
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${selectedKey}`,
          },
        }
      );

      const status = String(statusData?.status || statusData?.data?.status || 'pending').toLowerCase();
      const directUrl =
        statusData?.video_url ||
        statusData?.url ||
        statusData?.video?.url ||
        statusData?.data?.video_url ||
        statusData?.data?.output ||
        (Array.isArray(statusData?.data?.outputs) ? statusData.data.outputs[0] : '');

      if (body.mode === 'download_task' && directUrl) {
        return json({ success: true, status: 'success', url: directUrl, deducted: true });
      }

      if (['success', 'completed', 'succeed'].includes(status)) {
        if (directUrl) {
          await tryDeleteUpstreamVideoTask(taskPayload.endpointType, baseUrl, selectedKey, taskPayload.operationName);
          return json({ success: true, status: 'success', url: directUrl, deducted: true });
        }
        const contentCandidates = [
          `${openaiBase}/videos/${taskPayload.operationName}/content`,
          `${openaiBase}/videos/generations/${taskPayload.operationName}/content`,
        ];
        for (const contentUrl of contentCandidates) {
          const contentResponse = await fetch(contentUrl, {
            headers: {
              Authorization: `Bearer ${selectedKey}`,
            },
          });
          if (!contentResponse.ok) continue;
          const base64Video = await downloadVideoAsDataUrl(contentUrl, {
            Authorization: `Bearer ${selectedKey}`,
          });
          await tryDeleteUpstreamVideoTask(taskPayload.endpointType, baseUrl, selectedKey, taskPayload.operationName);
          return json({
            success: true,
            status: 'success',
            url: base64Video,
            deducted: true,
          });
        }
      }

      if (['failure', 'failed', 'error'].includes(status)) {
        await serviceClient.rpc('refund_credits', {
          p_transaction_id: taskPayload.transactionId,
          p_reason: 'video_generation_failed',
        });
        return json({ success: true, status: 'failed', deducted: true });
      }

      if (body.mode === 'download_task') {
        return json({ success: false, error: 'Task content is not ready yet' }, 409);
      }

      return json({ success: true, status: 'pending', deducted: true });
    }

    const modelId = normalizeModelId(body.modelId);
    if (!modelId) {
      return json({ success: false, error: 'modelId is required' }, 400);
    }

    const requestedImageSize = normalizeImageSize(body.imageSize);

    const { data: creditModels, error: modelError } = await serviceClient
      .from('admin_credit_models')
      .select('base_url, api_keys, endpoint_type, model_id, credit_cost, display_name, provider_id, priority, weight, advanced_enabled, mix_with_same_model, quality_pricing')
      .eq('model_id', modelId)
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .order('weight', { ascending: false });

    if (modelError || !creditModels || creditModels.length === 0) {
      return json({ success: false, error: 'Model route not found' }, 404);
    }

    const selectedRoute = pickCreditModelRoute((creditModels || []) as CreditModelRouteRow[], requestedImageSize);
    if (!selectedRoute) {
      return json({ success: false, error: `当前模型未启用 ${requestedImageSize} 画质` }, 409);
    }

    const creditModel = selectedRoute.route;

    const selectedKey = pickRandomKey(creditModel.api_keys || []);
    if (!selectedKey) {
      return json({ success: false, error: 'Provider key is not configured' }, 500);
    }

    const requiredCredits = Math.max(1, Number(selectedRoute.requiredCredits || creditModel.credit_cost || 1));

    const { data: balanceRow, error: balanceError } = await serviceClient
      .from('user_credits')
      .select('balance')
      .eq('user_id', user.id)
      .maybeSingle();

    const currentBalance = Number(balanceRow?.balance || 0);
    if (balanceError || currentBalance < requiredCredits) {
      return json({ success: false, error: 'Insufficient credits' }, 402);
    }

    const { data: consumeRows, error: consumeError } = await serviceClient.rpc('consume_credits', {
      p_user_id: user.id,
      p_amount: requiredCredits,
      p_model_id: modelId,
      p_model_name: String(creditModel.display_name || modelId),
      p_provider_id: String(creditModel.provider_id || 'system'),
      p_description: `系统积分模型调用：${modelId} / ${requestedImageSize}`,
    });

    const consumeResult = Array.isArray(consumeRows) ? consumeRows[0] : consumeRows;
    const transactionId = String(consumeResult?.transaction_id || '');
    if (consumeError || !consumeResult?.success || !transactionId) {
      return json({ success: false, error: consumeResult?.message || consumeError?.message || 'Credit deduction failed' }, 402);
    }

    const refundCredits = async (reason: string): Promise<boolean> => {
      const { data: refundRows, error: refundError } = await serviceClient.rpc('refund_credits', {
        p_transaction_id: transactionId,
        p_reason: reason,
      });
      const refundResult = Array.isArray(refundRows) ? refundRows[0] : refundRows;
      return !refundError && Boolean(refundResult?.success);
    };

    const failWithRefund = async (errorMessage: string, status = 502, refundReason = 'upstream_request_failed'): Promise<Response> => {
      const refunded = await refundCredits(refundReason);
      if (!refunded) {
        return json({ success: false, error: `${errorMessage} (credit rollback failed)` }, status);
      }
      return json({ success: false, error: errorMessage }, status);
    };
    fatalRefund = failWithRefund;

    const endpointType = creditModel.endpoint_type === 'gemini' ? 'gemini' : 'openai';
    const baseUrl = String(creditModel.base_url || '').replace(/\/$/, '');

    let content = '';
    let imageUrls: string[] = [];
    let audioUrl = '';
    let usage: { promptTokens: number; completionTokens: number; totalTokens: number } = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    if (body.mode === 'chat' && endpointType === 'gemini') {
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
        return await failWithRefund(`Upstream error: ${geminiResponse.status} ${errorText}`);
      }

      const result = await geminiResponse.json();
      content = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      usage = {
        promptTokens: Number(result?.usageMetadata?.promptTokenCount || 0),
        completionTokens: Number(result?.usageMetadata?.candidatesTokenCount || 0),
        totalTokens: Number(result?.usageMetadata?.totalTokenCount || 0),
      };
    } else if (body.mode === 'chat') {
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
        return await failWithRefund(`Upstream error: ${chatResponse.status} ${errorText}`);
      }

      const result = await chatResponse.json();
      content = result?.choices?.[0]?.message?.content || '';
      usage = {
        promptTokens: Number(result?.usage?.prompt_tokens || 0),
        completionTokens: Number(result?.usage?.completion_tokens || 0),
        totalTokens: Number(result?.usage?.total_tokens || 0),
      };
    } else if (body.mode === 'image' && endpointType === 'gemini') {
      const parts: any[] = [];
      for (const ref of body.referenceImages || []) {
        const inlinePart = await toInlineImagePart(ref);
        if (inlinePart) parts.push(inlinePart);
      }
      parts.push({ text: body.prompt || '' });

      const generationConfig: Record<string, unknown> = {
        responseModalities: ['IMAGE'],
      };
      const imageConfig: Record<string, unknown> = {};
      const aspectRatio = normalizeAspectRatio(body.aspectRatio);
      if (aspectRatio) {
        imageConfig.aspectRatio = aspectRatio;
      }
      if (body.imageSize) {
        imageConfig.imageSize = normalizeImageSize(body.imageSize);
      }
      if (Object.keys(imageConfig).length) {
        generationConfig.imageConfig = imageConfig;
      }

      const imageResponse = await fetch(
        `${baseUrl}/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(selectedKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig,
          }),
        }
      );

      if (!imageResponse.ok) {
        const errorText = await imageResponse.text();
        return await failWithRefund(`Upstream error: ${imageResponse.status} ${errorText}`);
      }

      const result = await imageResponse.json();
      const partsList = result?.candidates?.[0]?.content?.parts || [];
      const imagePart = partsList.find((part: any) => part?.inlineData || part?.inline_data);
      const inline = imagePart?.inlineData || imagePart?.inline_data;
      const mimeType = inline?.mimeType || inline?.mime_type || 'image/png';
      const imageData = String(inline?.data || '').replace(/\s+/g, '');

      if (!imageData) {
        return await failWithRefund('No image data returned from upstream');
      }

      usage = {
        promptTokens: Number(result?.usageMetadata?.promptTokenCount || 0),
        completionTokens: Number(result?.usageMetadata?.candidatesTokenCount || 0),
        totalTokens: Number(result?.usageMetadata?.totalTokenCount || 0),
      };
      imageUrls = [`data:${mimeType};base64,${imageData}`];
    } else if (body.mode === 'image') {
      if (isGeminiImageCompatModel(modelId)) {
        const contentParts: Array<Record<string, unknown>> = [{ type: 'text', text: body.prompt || '' }];
        for (const ref of body.referenceImages || []) {
          const dataUrl = toOpenAIImageUrl(ref);
          if (!dataUrl) continue;
          contentParts.push({
            type: 'image_url',
            image_url: { url: dataUrl },
          });
        }

        const requestBody: Record<string, unknown> = {
          model: modelId,
          messages: [
            {
              role: 'user',
              content: contentParts,
            },
          ],
          stream: false,
        };

        const extraBody = buildGoogleImageExtraBody(body);
        if (extraBody) {
          requestBody.extra_body = extraBody;
        }

        const imageResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${selectedKey}`,
          },
          body: JSON.stringify(requestBody),
        });

        if (!imageResponse.ok) {
          const errorText = await imageResponse.text();
          return await failWithRefund(`Upstream error: ${imageResponse.status} ${errorText}`);
        }

        const result = await imageResponse.json();
        imageUrls = extractImageUrlsFromOpenAICompatPayload(result);

        if (!imageUrls.length) {
          return await failWithRefund('No image data returned from upstream');
        }

        usage = {
          promptTokens: Number(result?.usage?.prompt_tokens || 0),
          completionTokens: Number(result?.usage?.completion_tokens || 0),
          totalTokens: Number(result?.usage?.total_tokens || 0),
        };
      } else {
        const imageResponse = await fetch(`${baseUrl}/v1/images/generations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${selectedKey}`,
          },
          body: JSON.stringify({
            model: modelId,
            prompt: body.prompt || '',
            n: Math.max(1, Number(body.imageCount || 1)),
            size: mapAspectRatioToOpenAI(normalizeAspectRatio(body.aspectRatio)),
            quality: normalizeImageSize(body.imageSize) === '1K' ? 'standard' : 'hd',
            response_format: 'b64_json',
          }),
        });

        if (!imageResponse.ok) {
          const errorText = await imageResponse.text();
          return await failWithRefund(`Upstream error: ${imageResponse.status} ${errorText}`);
        }

        const result = await imageResponse.json();
        imageUrls = Array.isArray(result?.data)
          ? result.data
              .map((item: any) => item?.b64_json ? `data:image/png;base64,${String(item.b64_json).replace(/\s+/g, '')}` : null)
              .filter(Boolean)
          : [];

        if (!imageUrls.length) {
          return await failWithRefund('No image data returned from upstream');
        }

        usage = {
          promptTokens: Number(result?.usage?.prompt_tokens || 0),
          completionTokens: Number(result?.usage?.completion_tokens || 0),
          totalTokens: Number(result?.usage?.total_tokens || 0),
        };
      }
    } else if (body.mode === 'video' && endpointType === 'gemini') {
      const instance: Record<string, unknown> = {
        prompt: body.prompt || '',
      };
      if (body.imageUrl) {
        const match = String(body.imageUrl).match(/^data:image\/.+;base64,(.+)$/);
        if (match) {
          instance.image = { bytesBase64Encoded: match[1] };
        }
      }
      if (body.imageTailUrl) {
        const match = String(body.imageTailUrl).match(/^data:image\/.+;base64,(.+)$/);
        if (match) {
          instance.lastFrame = { bytesBase64Encoded: match[1] };
        }
      }

      const requestBody: Record<string, unknown> = { instances: [instance] };
      const parameters: Record<string, unknown> = {};
      const aspectRatio = normalizeAspectRatio(body.aspectRatio);
      if (aspectRatio) parameters.aspectRatio = aspectRatio;
      if (body.resolution) parameters.resolution = body.resolution;
      const durationSeconds = getVideoDurationSeconds(body);
      if (durationSeconds) parameters.seconds = durationSeconds;
      if (Object.keys(parameters).length) requestBody.parameters = parameters;

      const apiBase = baseUrl.includes('/v1') ? baseUrl : `${baseUrl}/v1beta`;
      const initResponse = await fetch(
        `${apiBase}/models/${modelId}:predictLongRunning?key=${encodeURIComponent(selectedKey)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': selectedKey,
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!initResponse.ok) {
        const errorText = await initResponse.text();
        return await failWithRefund(`Upstream error: ${initResponse.status} ${errorText}`);
      }

      const initData = await initResponse.json();
      const operationName = String(initData?.name || '');
      if (!operationName) {
        return await failWithRefund('Missing operation name from upstream');
      }

      return json({
        success: true,
        status: 'pending',
        taskId: await encodeTaskPayload({
          kind: 'video',
          modelId,
          endpointType,
          operationName,
          transactionId,
          userId: user.id,
        }, taskSecret),
        deducted: true,
        endpointType,
      });
    } else if (body.mode === 'video') {
      const openaiBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
      const durationSeconds = getVideoDurationSeconds(body);

      let submitData: any = null;
      let lastVideoError = '';

      try {
        const formData = new FormData();
        formData.append('model', modelId);
        formData.append('prompt', body.prompt || '');
        if (durationSeconds) {
          formData.append('seconds', String(durationSeconds));
        }
        if (body.imageUrl) {
          await appendOpenAIVideoReference(formData, body.imageUrl);
        }

        const strictResponse = await fetch(`${openaiBase}/videos`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${selectedKey}`,
          },
          body: formData,
        });

        if (strictResponse.ok) {
          submitData = await strictResponse.json();
        } else {
          lastVideoError = `Upstream error: ${strictResponse.status} ${await strictResponse.text().catch(() => '')}`;
        }
      } catch (error) {
        lastVideoError = error instanceof Error ? error.message : 'Unknown upstream error';
      }

      if (!submitData) {
        const legacyRequestBody: Record<string, unknown> = {
          model: modelId,
          prompt: body.prompt || '',
        };
        if (durationSeconds) legacyRequestBody.seconds = durationSeconds;
        const aspectRatio = normalizeAspectRatio(body.aspectRatio);
        if (aspectRatio) legacyRequestBody.aspect_ratio = aspectRatio;
        if (body.resolution) legacyRequestBody.resolution = body.resolution;
        if (body.imageUrl) legacyRequestBody.images = [body.imageUrl];
        if (body.imageTailUrl) legacyRequestBody.last_image = body.imageTailUrl;

        try {
          const legacyResponse = await fetch(`${openaiBase}/videos/generations`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${selectedKey}`,
            },
            body: JSON.stringify(legacyRequestBody),
          });

          if (!legacyResponse.ok) {
            const errorText = await legacyResponse.text().catch(() => '');
            return await failWithRefund(lastVideoError || `Upstream error: ${legacyResponse.status} ${errorText}`);
          }

          submitData = await legacyResponse.json();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown upstream error';
          return await failWithRefund(lastVideoError || message);
        }
      }

      const taskId = String(submitData?.id || submitData?.task_id || submitData?.data?.task_id || '');
      const taskStatus = String(submitData?.status || submitData?.data?.status || 'pending').toLowerCase();
      const directUrl =
        submitData?.video_url ||
        submitData?.url ||
        submitData?.video?.url ||
        submitData?.data?.video_url ||
        submitData?.data?.output ||
        (Array.isArray(submitData?.data?.outputs) ? submitData.data.outputs[0] : '');

      if (taskId) {
        return json({
          success: true,
          status: ['success', 'completed', 'succeed'].includes(taskStatus) ? 'success' : 'pending',
          taskId: await encodeTaskPayload({
            kind: 'video',
            modelId,
            endpointType: 'openai',
            operationName: taskId,
            transactionId,
            userId: user.id,
          }, taskSecret),
          url: directUrl || undefined,
          deducted: true,
          endpointType: 'openai',
        });
      }

      if (directUrl) {
        return json({
          success: true,
          status: 'success',
          url: directUrl,
          deducted: true,
          endpointType: 'openai',
        });
      }

      return await failWithRefund('Missing task id from upstream video API');
    } else if (body.mode === 'audio' && endpointType === 'gemini') {
      const isLyria = modelId.toLowerCase().includes('lyria');
      if (isLyria) {
        const audioResponse = await fetch(
          `${baseUrl}/v1beta/models/${modelId}:predict?key=${encodeURIComponent(selectedKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instances: [{ prompt: body.prompt || '' }],
              parameters: { audioConfig: { audioFormat: 'audio/wav' } },
            }),
          }
        );

        if (!audioResponse.ok) {
          const errorText = await audioResponse.text();
          return await failWithRefund(`Upstream error: ${audioResponse.status} ${errorText}`);
        }

        const result = await audioResponse.json();
        const b64 = result?.predictions?.[0]?.bytesBase64Encoded;
        if (!b64) {
          return await failWithRefund('No audio data returned from upstream');
        }
        audioUrl = `data:audio/wav;base64,${String(b64).replace(/\s+/g, '')}`;
      } else {
        const audioResponse = await fetch(
          `${baseUrl}/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(selectedKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: body.prompt || '' }] }],
              generationConfig: {
                responseModalities: ['AUDIO'],
                audioConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
              },
            }),
          }
        );

        if (!audioResponse.ok) {
          const errorText = await audioResponse.text();
          return await failWithRefund(`Upstream error: ${audioResponse.status} ${errorText}`);
        }

        const result = await audioResponse.json();
        const audioPart = result?.candidates?.[0]?.content?.parts?.find((part: any) => part?.inlineData || part?.inline_data);
        const inline = audioPart?.inlineData || audioPart?.inline_data;
        const mimeType = inline?.mimeType || inline?.mime_type || 'audio/wav';
        const audioData = String(inline?.data || '').replace(/\s+/g, '');
        if (!audioData) {
          return await failWithRefund('No audio data returned from upstream');
        }
        audioUrl = `data:${mimeType};base64,${audioData}`;
      }
    } else {
      return await failWithRefund('Unsupported mode', 400, 'unsupported_mode');
    }

    if (body.mode === 'chat') {
      return json({
        success: true,
        content,
        usage,
        endpointType,
        deducted: true,
      });
    }

    if (body.mode === 'image') {
      return json({
        success: true,
        urls: imageUrls,
        usage,
        endpointType,
        deducted: true,
      });
    }

    if (body.mode === 'audio') {
      return json({
        success: true,
        url: audioUrl,
        usage,
        endpointType,
        deducted: true,
      });
    }

    return json({ success: false, error: 'Unsupported mode' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (fatalRefund) {
      return await fatalRefund(message, 500, 'proxy_internal_error');
    }
    return json({ success: false, error: message }, 500);
  }
});
