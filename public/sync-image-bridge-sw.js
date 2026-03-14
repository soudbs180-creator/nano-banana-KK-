const JOBS = new Map();
const RESULT_CACHE = 'kk-sync-image-bridge-v1';
const RESULT_PREFIX = '/__kk_sync_image_bridge__/result/';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function toCacheUrl(requestId) {
  return new URL(`${RESULT_PREFIX}${encodeURIComponent(requestId)}`, self.location.origin).toString();
}

async function readCachedResult(requestId) {
  const cache = await caches.open(RESULT_CACHE);
  const response = await cache.match(toCacheUrl(requestId));
  if (!response) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function writeCachedResult(requestId, result) {
  const cache = await caches.open(RESULT_CACHE);
  await cache.put(
    toCacheUrl(requestId),
    new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

async function deleteCachedResult(requestId) {
  const cache = await caches.open(RESULT_CACHE);
  await cache.delete(toCacheUrl(requestId));
}

function normalizeHeaders(rawHeaders) {
  const headers = {};
  if (!rawHeaders || typeof rawHeaders !== 'object') return headers;
  Object.entries(rawHeaders).forEach(([key, value]) => {
    if (!key) return;
    headers[String(key)] = String(value ?? '');
  });
  return headers;
}

function buildPreview(text) {
  return String(text || '').slice(0, 1600);
}

function addUrl(urls, raw) {
  if (typeof raw !== 'string') return;
  const normalized = raw.trim();
  if (!normalized) return;
  urls.push(normalized);
}

function extractOpenAICompatibleImageUrls(data) {
  const candidates = [];
  const pushAny = (value) => {
    if (Array.isArray(value)) value.forEach(pushAny);
    else if (value !== undefined && value !== null) candidates.push(value);
  };

  pushAny(data?.data);
  pushAny(data?.data?.result);
  pushAny(data?.data?.output);
  pushAny(data?.data?.images);
  pushAny(data?.data?.urls);
  pushAny(data?.data?.outputs);
  pushAny(data?.images);
  pushAny(data?.result?.data);
  pushAny(data?.result?.images);
  pushAny(data?.result?.result);
  pushAny(data?.result?.urls);
  pushAny(data?.result?.outputs);
  pushAny(data?.output?.data);
  pushAny(data?.output?.images);
  pushAny(data?.output?.result);
  pushAny(data?.output?.urls);
  pushAny(data?.output?.outputs);

  if (typeof data?.url === 'string') candidates.push({ url: data.url });
  if (typeof data?.data?.url === 'string') candidates.push({ url: data.data.url });
  if (typeof data?.result?.url === 'string') candidates.push({ url: data.result.url });
  if (typeof data?.output?.url === 'string') candidates.push({ url: data.output.url });
  if (typeof data?.output?.image_url === 'string') candidates.push({ url: data.output.image_url });

  const urls = [];
  candidates.forEach((item) => {
    if (typeof item === 'string') {
      addUrl(urls, item);
      return;
    }
    if (!item || typeof item !== 'object') return;

    const b64 = item.b64_json || item.b64 || item.base64 || item.image_base64 || item?.image?.b64_json;
    if (typeof b64 === 'string' && b64.trim()) {
      const cleaned = b64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').replace(/\s+/g, '');
      urls.push(`data:image/png;base64,${cleaned}`);
      return;
    }

    pushAny(item.urls);
    pushAny(item.images);
    pushAny(item.outputs);
    pushAny(item.output);
    pushAny(item.result);

    addUrl(urls, item.hd_url);
    addUrl(urls, item.original_url);
    addUrl(urls, item.full_url);
    addUrl(urls, item.image_url);
    addUrl(urls, item.url);
    addUrl(urls, item.uri);
    addUrl(urls, item.src);
  });

  const content = data?.choices?.[0]?.message?.content || data?.message || data?.output_text || '';
  if (typeof content === 'string' && content.trim()) {
    const base64Match = content.match(/data:(image\/[^;]+);base64,([A-Za-z0-9+/=\s]+)/);
    if (base64Match?.[2]) {
      const cleaned = base64Match[2].replace(/\s+/g, '');
      urls.push(`data:${base64Match[1]};base64,${cleaned}`);
    }

    const markdownUrl = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
    if (markdownUrl?.[1]) addUrl(urls, markdownUrl[1]);

    const rawUrl = content.match(/(https?:\/\/[^\s)]+)/);
    if (rawUrl?.[1]) addUrl(urls, rawUrl[1]);
  }

  return Array.from(new Set(urls));
}

function extractBestOpenAIChatImageUrls(data) {
  const messageObj = data?.choices?.[0]?.message || {};
  const allImages = [
    ...(Array.isArray(messageObj?.images) ? messageObj.images : []),
    ...(Array.isArray(data?.images) ? data.images : []),
    ...(Array.isArray(data?.data) ? data.data : []),
  ];

  let bestImage = null;
  let maxLen = 0;
  allImages.forEach((img) => {
    const len = (img?.b64_json?.length || 0) + (img?.url?.length || 0);
    if (len > maxLen) {
      maxLen = len;
      bestImage = img;
    }
  });

  if (bestImage?.b64_json) {
    return [`data:image/png;base64,${String(bestImage.b64_json).replace(/\s+/g, '')}`];
  }
  if (bestImage?.url) {
    return [String(bestImage.url)];
  }

  return extractOpenAICompatibleImageUrls(data);
}

function extractGeminiNativeImageUrls(data) {
  const candidate = data?.candidates?.[0];
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const imagePart = parts.find((part) => part?.inlineData || part?.inline_data);
  if (!imagePart) return [];

  const inlineData = imagePart.inlineData || imagePart.inline_data;
  const mimeType = inlineData?.mimeType || inlineData?.mime_type || 'image/png';
  const b64 = String(inlineData?.data || '').replace(/\s+/g, '');
  if (!b64) return [];
  return [`data:${mimeType};base64,${b64}`];
}

function parseJobResult(parserType, payload) {
  switch (parserType) {
    case 'openai-chat-best-image':
      return extractBestOpenAIChatImageUrls(payload);
    case 'gemini-native-image':
      return extractGeminiNativeImageUrls(payload);
    case 'openai-compatible-image':
    default:
      return extractOpenAICompatibleImageUrls(payload);
  }
}

async function runJob(payload) {
  const { requestId, parserType, url, method = 'POST', headers = {}, body, timeoutMs = 900000 } = payload;
  const existing = JOBS.get(requestId);
  if (existing?.status === 'pending') {
    return existing;
  }

  const controller = new AbortController();
  const startedAt = Date.now();
  JOBS.set(requestId, {
    requestId,
    status: 'pending',
    startedAt,
    controller,
  });

  let timeoutId = null;

  try {
    timeoutId = setTimeout(() => {
      try {
        controller.abort(new Error('Request timeout'));
      } catch {
        controller.abort();
      }
    }, Math.max(15000, Number(timeoutMs) || 0));

    const response = await fetch(String(url || ''), {
      method: String(method || 'POST'),
      headers: normalizeHeaders(headers),
      body: typeof body === 'string' ? body : undefined,
      signal: controller.signal,
    });

    const responseText = await response.text();
    const responsePreview = buildPreview(responseText);
    let parsed = null;
    if (responseText) {
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed = null;
      }
    }

    let finalResult;
    if (!response.ok) {
      const errorMessage = parsed?.error?.message
        || parsed?.message
        || `HTTP ${response.status}`;
      finalResult = {
        requestId,
        status: 'error',
        error: String(errorMessage),
        responseStatus: response.status,
        responseBodyPreview: responsePreview,
        startedAt,
        completedAt: Date.now(),
      };
    } else {
      const urls = parseJobResult(parserType, parsed || {});
      if (!urls.length) {
        finalResult = {
          requestId,
          status: 'error',
          error: '接口已返回成功状态，但未找到可用图片数据',
          responseStatus: response.status,
          responseBodyPreview: responsePreview,
          startedAt,
          completedAt: Date.now(),
        };
      } else {
        finalResult = {
          requestId,
          status: 'success',
          urls,
          responseStatus: response.status,
          responseBodyPreview: responsePreview,
          startedAt,
          completedAt: Date.now(),
        };
      }
    }

    JOBS.set(requestId, finalResult);
    await writeCachedResult(requestId, finalResult);
    return finalResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'Sync image bridge request failed');
    const finalResult = {
      requestId,
      status: 'error',
      error: message,
      code: controller.signal.aborted ? 'ABORTED' : undefined,
      startedAt,
      completedAt: Date.now(),
    };
    JOBS.set(requestId, finalResult);
    await writeCachedResult(requestId, finalResult);
    return finalResult;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function getJobResult(requestId) {
  const live = JOBS.get(requestId);
  if (live) {
    if (live.status === 'pending') {
      return {
        requestId,
        status: 'pending',
        startedAt: live.startedAt,
      };
    }
    return live;
  }

  const cached = await readCachedResult(requestId);
  if (cached) return cached;

  return { requestId, status: 'missing' };
}

function respond(source, correlationId, result, ok = true, error) {
  if (!source || typeof source.postMessage !== 'function') return;
  source.postMessage({
    source: 'kk-sync-image-bridge',
    correlationId,
    ok,
    error,
    result,
  });
}

self.addEventListener('message', (event) => {
  const message = event.data || {};
  if (message.source !== 'kk-sync-image-bridge' || !message.correlationId || !message.action) {
    return;
  }

  const source = event.source;
  const { action, payload = {}, correlationId } = message;

  if (action === 'start-job') {
    event.waitUntil((async () => {
      const requestId = String(payload.requestId || '');
      if (!requestId) {
        respond(source, correlationId, null, false, 'Missing requestId');
        return;
      }

      const cached = await readCachedResult(requestId);
      if (cached) {
        JOBS.set(requestId, cached);
        respond(source, correlationId, cached, true);
        return;
      }

      const existing = JOBS.get(requestId);
      if (existing?.status === 'pending') {
        respond(source, correlationId, {
          requestId,
          status: 'pending',
          startedAt: existing.startedAt,
        }, true);
        return;
      }

      const running = runJob(payload);
      const pending = JOBS.get(requestId);
      respond(source, correlationId, {
        requestId,
        status: 'pending',
        startedAt: pending?.startedAt || Date.now(),
      }, true);
      await running;
    })());
    return;
  }

  if (action === 'get-job') {
    event.waitUntil((async () => {
      const requestId = String(payload.requestId || '');
      if (!requestId) {
        respond(source, correlationId, null, false, 'Missing requestId');
        return;
      }
      const result = await getJobResult(requestId);
      respond(source, correlationId, result, true);
    })());
    return;
  }

  if (action === 'clear-job') {
    event.waitUntil((async () => {
      const requestId = String(payload.requestId || '');
      if (requestId) {
        JOBS.delete(requestId);
        await deleteCachedResult(requestId);
      }
      respond(source, correlationId, { ok: true }, true);
    })());
    return;
  }

  if (action === 'abort-job') {
    event.waitUntil((async () => {
      const requestId = String(payload.requestId || '');
      const job = JOBS.get(requestId);
      if (job?.status === 'pending' && job.controller) {
        try {
          job.controller.abort(new Error('Cancelled by user'));
        } catch {
          job.controller.abort();
        }
      }
      respond(source, correlationId, { ok: true }, true);
    })());
  }
});
