// src/services/api/providerStrategy.ts
var GOOGLE_API_HEADER = "x-goog-api-key";
var AUTHORIZATION_HEADER = "Authorization";
var FALLBACK_STRATEGY = {
  id: "generic-openai",
  label: "Generic OpenAI-Compatible",
  known: false,
  defaultFormat: "openai",
  defaultAuthMethod: "header",
  geminiAuthMethod: "header",
  defaultHeaderName: AUTHORIZATION_HEADER,
  defaultCompatibilityMode: "standard",
  imageProfile: "openai-strict",
  videoApiStyle: "openai-v1-videos",
  autoGeminiNativeForGeminiModels: false,
  respectProviderOnCustomHost: true,
  uiProvider: "OpenAI"
};
var PROVIDER_STRATEGIES = [
  {
    id: "google",
    label: "Google Gemini",
    known: true,
    providerPatterns: [/^google$/i, /^gemini$/i],
    hostPatterns: [/^generativelanguage\.googleapis\.com$/i],
    basePatterns: [/googleapis\.com/i],
    defaultFormat: "gemini",
    defaultAuthMethod: "query",
    geminiAuthMethod: "query",
    defaultHeaderName: GOOGLE_API_HEADER,
    defaultCompatibilityMode: "standard",
    imageProfile: "openai-strict",
    videoApiStyle: "openai-v1-videos",
    autoGeminiNativeForGeminiModels: true,
    respectProviderOnCustomHost: false,
    uiProvider: "Google"
  },
  {
    id: "12ai",
    label: "12AI",
    known: true,
    providerPatterns: [/^12ai$/i, /^systemproxy$/i],
    hostPatterns: [/^cdn\.12ai\.org$/i, /^new\.12ai\.org$/i, /^hk\.12ai\.org$/i, /(^|\.)12ai\.(org|xyz|io|net)$/i],
    basePatterns: [/12ai\.(org|xyz|io|net)/i],
    defaultFormat: "openai",
    defaultAuthMethod: "header",
    geminiAuthMethod: "query",
    defaultHeaderName: AUTHORIZATION_HEADER,
    defaultCompatibilityMode: "standard",
    imageProfile: "openai-strict",
    videoApiStyle: "openai-v1-videos",
    autoGeminiNativeForGeminiModels: true,
    respectProviderOnCustomHost: true,
    uiProvider: "12AI"
  },
  {
    id: "newapi",
    label: "NewAPI / OneAPI",
    known: true,
    providerPatterns: [/^newapi$/i, /^oneapi$/i, /^cherry(\s+studio)?$/i],
    hostPatterns: [/^ai\.newapi\.pro$/i, /^docs\.newapi\.pro$/i, /(^|\.)newapi\./i, /(^|\.)oneapi\./i],
    basePatterns: [/newapi/i, /oneapi/i, /vodeshop/i, /future-api/i, /wuyinkeji/i],
    defaultFormat: "openai",
    defaultAuthMethod: "header",
    geminiAuthMethod: "header",
    defaultHeaderName: AUTHORIZATION_HEADER,
    defaultCompatibilityMode: "standard",
    imageProfile: "openai-strict",
    videoApiStyle: "openai-v1-videos",
    autoGeminiNativeForGeminiModels: false,
    respectProviderOnCustomHost: true,
    uiProvider: "OpenAI"
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    known: true,
    providerPatterns: [/^openrouter$/i],
    hostPatterns: [/^openrouter\.ai$/i],
    basePatterns: [/openrouter/i],
    defaultFormat: "openai",
    defaultAuthMethod: "header",
    geminiAuthMethod: "header",
    defaultHeaderName: AUTHORIZATION_HEADER,
    defaultCompatibilityMode: "standard",
    imageProfile: "openai-strict",
    videoApiStyle: "openai-v1-videos",
    autoGeminiNativeForGeminiModels: false,
    respectProviderOnCustomHost: true,
    uiProvider: "OpenAI"
  },
  {
    id: "openai",
    label: "OpenAI",
    known: true,
    providerPatterns: [/^openai$/i],
    hostPatterns: [/^api\.openai\.com$/i],
    basePatterns: [/api\.openai\.com/i],
    defaultFormat: "openai",
    defaultAuthMethod: "header",
    geminiAuthMethod: "header",
    defaultHeaderName: AUTHORIZATION_HEADER,
    defaultCompatibilityMode: "standard",
    imageProfile: "openai-strict",
    videoApiStyle: "openai-v1-videos",
    autoGeminiNativeForGeminiModels: false,
    respectProviderOnCustomHost: true,
    uiProvider: "OpenAI"
  },
  {
    id: "siliconflow",
    label: "SiliconFlow",
    known: true,
    providerPatterns: [/^siliconflow$/i],
    hostPatterns: [/^api\.siliconflow\.cn$/i],
    basePatterns: [/siliconflow/i],
    defaultFormat: "openai",
    defaultAuthMethod: "header",
    geminiAuthMethod: "header",
    defaultHeaderName: AUTHORIZATION_HEADER,
    defaultCompatibilityMode: "chat",
    imageProfile: "siliconflow",
    videoApiStyle: "openai-v1-videos",
    autoGeminiNativeForGeminiModels: false,
    respectProviderOnCustomHost: true,
    uiProvider: "SiliconFlow"
  },
  {
    id: "antigravity",
    label: "Antigravity",
    known: true,
    providerPatterns: [/^antigravity$/i],
    basePatterns: [/127\.0\.0\.1:8045/i, /localhost:8045/i, /antigravity/i],
    defaultFormat: "openai",
    defaultAuthMethod: "header",
    geminiAuthMethod: "header",
    defaultHeaderName: AUTHORIZATION_HEADER,
    defaultCompatibilityMode: "chat",
    imageProfile: "antigravity",
    videoApiStyle: "legacy-video-generations",
    autoGeminiNativeForGeminiModels: false,
    respectProviderOnCustomHost: true,
    uiProvider: "OpenAI"
  },
  {
    id: "gpt-best",
    label: "GPT-Best",
    known: false,
    basePatterns: [/gpt-best/i, /gptbest/i],
    defaultFormat: "openai",
    defaultAuthMethod: "header",
    geminiAuthMethod: "header",
    defaultHeaderName: AUTHORIZATION_HEADER,
    defaultCompatibilityMode: "standard",
    imageProfile: "gpt-best-extended",
    videoApiStyle: "legacy-video-generations",
    autoGeminiNativeForGeminiModels: false,
    respectProviderOnCustomHost: true,
    uiProvider: "OpenAI"
  },
  {
    id: "suxi",
    label: "Suxi",
    known: false,
    basePatterns: [/suxi\.ai/i],
    defaultFormat: "openai",
    defaultAuthMethod: "header",
    geminiAuthMethod: "header",
    defaultHeaderName: AUTHORIZATION_HEADER,
    defaultCompatibilityMode: "chat",
    imageProfile: "chat-preferred",
    videoApiStyle: "legacy-video-generations",
    autoGeminiNativeForGeminiModels: false,
    respectProviderOnCustomHost: true,
    uiProvider: "OpenAI"
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    known: true,
    providerPatterns: [/^deepseek$/i],
    hostPatterns: [/^api\.deepseek\.com$/i],
    basePatterns: [/deepseek/i],
    defaultFormat: "openai",
    defaultAuthMethod: "header",
    geminiAuthMethod: "header",
    defaultHeaderName: AUTHORIZATION_HEADER,
    defaultCompatibilityMode: "chat",
    imageProfile: "openai-strict",
    videoApiStyle: "openai-v1-videos",
    autoGeminiNativeForGeminiModels: false,
    respectProviderOnCustomHost: true,
    uiProvider: "OpenAI"
  },
  {
    id: "volcengine",
    label: "Volcengine",
    known: true,
    providerPatterns: [/^volcengine$/i],
    basePatterns: [/volces\.com/i],
    defaultFormat: "openai",
    defaultAuthMethod: "header",
    geminiAuthMethod: "header",
    defaultHeaderName: AUTHORIZATION_HEADER,
    defaultCompatibilityMode: "chat",
    imageProfile: "openai-strict",
    videoApiStyle: "openai-v1-videos",
    autoGeminiNativeForGeminiModels: false,
    respectProviderOnCustomHost: true,
    uiProvider: "Volcengine"
  },
  {
    id: "aliyun",
    label: "Aliyun",
    known: true,
    providerPatterns: [/^aliyun$/i],
    basePatterns: [/aliyuncs\.com/i],
    defaultFormat: "openai",
    defaultAuthMethod: "header",
    geminiAuthMethod: "header",
    defaultHeaderName: AUTHORIZATION_HEADER,
    defaultCompatibilityMode: "chat",
    imageProfile: "openai-strict",
    videoApiStyle: "openai-v1-videos",
    autoGeminiNativeForGeminiModels: false,
    respectProviderOnCustomHost: true,
    uiProvider: "Aliyun"
  },
  {
    id: "tencent",
    label: "Tencent",
    known: true,
    providerPatterns: [/^tencent$/i],
    basePatterns: [/tencent\.com/i],
    defaultFormat: "openai",
    defaultAuthMethod: "header",
    geminiAuthMethod: "header",
    defaultHeaderName: AUTHORIZATION_HEADER,
    defaultCompatibilityMode: "chat",
    imageProfile: "openai-strict",
    videoApiStyle: "openai-v1-videos",
    autoGeminiNativeForGeminiModels: false,
    respectProviderOnCustomHost: true,
    uiProvider: "Tencent"
  },
  {
    id: "anthropic",
    label: "Anthropic",
    known: true,
    providerPatterns: [/^anthropic$/i],
    basePatterns: [/anthropic\.com/i],
    defaultFormat: "openai",
    defaultAuthMethod: "header",
    geminiAuthMethod: "header",
    defaultHeaderName: AUTHORIZATION_HEADER,
    defaultCompatibilityMode: "chat",
    imageProfile: "openai-strict",
    videoApiStyle: "openai-v1-videos",
    autoGeminiNativeForGeminiModels: false,
    respectProviderOnCustomHost: true,
    uiProvider: "Anthropic"
  }
];
function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}
function normalizeProviderName(provider) {
  return String(provider || "").trim().toLowerCase();
}
function normalizeFormat(format, fallback = "auto") {
  const normalized = String(format || "").trim().toLowerCase();
  if (normalized === "openai" || normalized === "gemini" || normalized === "auto") {
    return normalized;
  }
  return fallback;
}
function normalizeAuthMethod(authMethod) {
  const normalized = String(authMethod || "").trim().toLowerCase();
  if (normalized === "query" || normalized === "header") {
    return normalized;
  }
  return void 0;
}
function normalizeCompatibilityMode(mode) {
  const normalized = String(mode || "").trim().toLowerCase();
  if (normalized === "standard" || normalized === "chat") {
    return normalized;
  }
  return void 0;
}
function normalizeHost(baseUrl) {
  const raw = normalizeBaseUrl(baseUrl);
  if (!raw) return "";
  const candidates = raw.startsWith("http://") || raw.startsWith("https://") ? [raw] : [`https://${raw}`, `http://${raw}`];
  for (const candidate of candidates) {
    try {
      return new URL(candidate).hostname.toLowerCase();
    } catch {
      continue;
    }
  }
  return raw.toLowerCase();
}
function matchesAny(patterns, value) {
  if (!patterns || !value) return false;
  return patterns.some((pattern) => pattern.test(value));
}
function findStrategyByBase(baseUrl) {
  const normalizedBase = normalizeBaseUrl(baseUrl).toLowerCase();
  const host = normalizeHost(baseUrl);
  if (!normalizedBase && !host) return void 0;
  return PROVIDER_STRATEGIES.find(
    (strategy) => matchesAny(strategy.hostPatterns, host) || matchesAny(strategy.basePatterns, normalizedBase)
  );
}
function findStrategyByProvider(provider) {
  const normalizedProvider = normalizeProviderName(provider);
  if (!normalizedProvider) return void 0;
  return PROVIDER_STRATEGIES.find((strategy) => matchesAny(strategy.providerPatterns, normalizedProvider));
}
function isGeminiFamilyModel(modelId) {
  const lower = String(modelId || "").trim().toLowerCase();
  return lower.startsWith("gemini-") || lower.startsWith("imagen-") || lower.startsWith("veo-");
}
function resolveProviderStrategy(provider, baseUrl) {
  const baseMatch = findStrategyByBase(baseUrl);
  if (baseMatch) {
    return baseMatch;
  }
  const providerMatch = findStrategyByProvider(provider);
  if (!providerMatch) {
    return FALLBACK_STRATEGY;
  }
  if (normalizeBaseUrl(baseUrl) && providerMatch.respectProviderOnCustomHost === false) {
    return FALLBACK_STRATEGY;
  }
  return providerMatch;
}
function resolveProviderRuntime(input) {
  const strategy = resolveProviderStrategy(input.provider, input.baseUrl);
  const requestedFormat = normalizeFormat(
    input.format,
    strategy.id === "google" ? "gemini" : "auto"
  );
  const fallbackFormat = input.fallbackFormat || (strategy.defaultFormat === "gemini" ? "gemini" : "openai");
  const resolvedFormat = requestedFormat === "auto" ? fallbackFormat : requestedFormat;
  const geminiNative = requestedFormat === "gemini" || requestedFormat !== "openai" && !!strategy.autoGeminiNativeForGeminiModels && isGeminiFamilyModel(input.modelId);
  const authMethod = normalizeAuthMethod(input.authMethod) || (geminiNative ? strategy.geminiAuthMethod || strategy.defaultAuthMethod || "header" : strategy.defaultAuthMethod || "header");
  const headerName = String(input.headerName || "").trim() || (geminiNative && strategy.id === "google" ? GOOGLE_API_HEADER : strategy.defaultHeaderName || AUTHORIZATION_HEADER);
  const compatibilityMode = normalizeCompatibilityMode(input.compatibilityMode) || strategy.defaultCompatibilityMode || "standard";
  return {
    strategy,
    strategyId: strategy.id,
    providerName: normalizeProviderName(input.provider),
    baseUrl: normalizeBaseUrl(input.baseUrl),
    host: normalizeHost(input.baseUrl),
    requestedFormat,
    resolvedFormat,
    authMethod,
    headerName,
    compatibilityMode,
    geminiNative,
    imageProfile: strategy.imageProfile || "openai-strict",
    videoApiStyle: strategy.videoApiStyle || "openai-v1-videos",
    isKnownProvider: strategy.known,
    uiProvider: strategy.uiProvider || "OpenAI"
  };
}

// src/services/llm/VideoCompatibleAdapter.ts
var VideoCompatibleAdapter = class {
  id = "video-compatible-adapter";
  provider = "VideoProxy";
  supports(modelId) {
    const lower = modelId.toLowerCase();
    return lower.includes("runway") || lower.includes("luma") || lower.includes("kling") || lower.includes("wan") || lower.includes("pika") || lower.includes("minimax") || lower.includes("vidu") || lower.includes("sora") || lower.includes("veo") || lower.includes("seedance") || lower.includes("higgsfield") || lower.includes("pixverse") || lower.includes("cogvideo") || lower.includes("zhipu") || lower.includes("qwen-video") || lower.includes("hailuo");
  }
  async chat() {
    throw new Error("\u89C6\u9891\u9002\u914D\u5668\u4E0D\u652F\u6301\u804A\u5929");
  }
  async generateImage() {
    throw new Error("\u89C6\u9891\u9002\u914D\u5668\u4E0D\u652F\u6301\u56FE\u50CF\u751F\u6210");
  }
  async generateVideo(options, keySlot) {
    const cleanBase = this.normalizeBaseUrl(keySlot.baseUrl);
    const runtime = resolveProviderRuntime({
      provider: keySlot.provider,
      baseUrl: cleanBase,
      format: keySlot.format,
      authMethod: keySlot.authMethod,
      headerName: keySlot.headerName,
      compatibilityMode: keySlot.compatibilityMode,
      modelId: options.modelId
    });
    if (runtime.videoApiStyle === "openai-v1-videos" || this.isNewApiLikeGateway(cleanBase, keySlot)) {
      return this.generateVideoViaNewApi(options, keySlot, cleanBase);
    }
    try {
      return await this.generateVideoViaNewApi(options, keySlot, cleanBase);
    } catch (error) {
      if (!this.isNewApiCompatibilityError(error)) {
        throw error;
      }
      return this.generateVideoViaLegacyProxy(options, keySlot, cleanBase);
    }
  }
  normalizeBaseUrl(baseUrl) {
    const clean = (baseUrl || "https://api.openai.com").replace(/\/+$/, "");
    return clean.endsWith("/v1") ? clean : `${clean}/v1`;
  }
  isNewApiLikeGateway(cleanBase, keySlot) {
    const fingerprint = [
      cleanBase,
      keySlot.name || "",
      String(keySlot.provider || "")
    ].join(" ").toLowerCase();
    return fingerprint.includes("newapi") || fingerprint.includes("new-api") || fingerprint.includes("oneapi") || fingerprint.includes("one-api");
  }
  isNewApiCompatibilityError(error) {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("/videos") || message.includes("not found") || message.includes("404") || message.includes("405") || message.includes("415") || message.includes("unsupported") || message.includes("invalid request");
  }
  buildHeaders(keySlot, includeJsonContentType) {
    const token = String(keySlot.key || "").trim();
    const headers = {
      "Authorization": /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`
    };
    if (includeJsonContentType) {
      headers["Content-Type"] = "application/json";
    }
    if (keySlot.headerName && keySlot.headerName !== "Authorization") {
      headers[keySlot.headerName] = keySlot.key;
    }
    return headers;
  }
  getDurationSeconds(options) {
    if (typeof options.duration === "number" && Number.isFinite(options.duration) && options.duration > 0) {
      return Math.round(options.duration);
    }
    const legacyDuration = Number.parseInt(String(options.videoDuration || "").trim(), 10);
    if (Number.isFinite(legacyDuration) && legacyDuration > 0) {
      return legacyDuration;
    }
    return void 0;
  }
  getNormalizedAspectRatio(options) {
    const raw = String(options.aspectRatio || "").trim();
    if (!raw || raw.toLowerCase() === "auto") {
      return void 0;
    }
    if (raw === "16:9" || raw === "9:16" || raw === "1:1") {
      return raw;
    }
    return void 0;
  }
  getVideoSizeString(options) {
    const explicitSize = String(options.size || "").trim();
    if (/^\d+x\d+$/i.test(explicitSize)) {
      return explicitSize;
    }
    const resolution = String(options.resolution || "").trim().toLowerCase();
    const aspectRatio = this.getNormalizedAspectRatio(options) || "16:9";
    const sizeMap = {
      "480p": {
        "16:9": "854x480",
        "9:16": "480x854",
        "1:1": "480x480"
      },
      "720p": {
        "16:9": "1280x720",
        "9:16": "720x1280",
        "1:1": "720x720"
      },
      "1080p": {
        "16:9": "1920x1080",
        "9:16": "1080x1920",
        "1:1": "1080x1080"
      },
      "4k": {
        "16:9": "3840x2160",
        "9:16": "2160x3840",
        "1:1": "2160x2160"
      }
    };
    return sizeMap[resolution]?.[aspectRatio];
  }
  extractTaskId(payload) {
    return payload?.task_id || payload?.id || payload?.data?.task_id || payload?.data?.id;
  }
  extractStatus(payload) {
    return String(
      payload?.status || payload?.data?.status || payload?.state || payload?.data?.state || ""
    );
  }
  extractVideoUrl(payload) {
    return payload?.video_url || payload?.url || payload?.output || payload?.data?.video_url || payload?.data?.url || payload?.data?.output || payload?.video?.url || payload?.data?.video?.url || payload?.data?.outputs?.[0] || "";
  }
  isSuccessStatus(status) {
    const normalized = status.trim().toUpperCase();
    return normalized === "SUCCESS" || normalized === "SUCCEEDED" || normalized === "COMPLETED" || normalized === "DONE";
  }
  isFailureStatus(status) {
    const normalized = status.trim().toUpperCase();
    return normalized === "FAILURE" || normalized === "FAILED" || normalized === "ERROR" || normalized === "CANCELLED";
  }
  async appendInputReference(formData, imageSource) {
    if (!imageSource) return;
    if (imageSource.startsWith("data:")) {
      const response = await fetch(imageSource);
      const blob = await response.blob();
      formData.append("input_reference", blob, "reference-image.png");
      return;
    }
    try {
      const response = await fetch(imageSource);
      if (response.ok) {
        const blob = await response.blob();
        const fileName = blob.type.includes("jpeg") ? "reference-image.jpg" : "reference-image.png";
        formData.append("input_reference", blob, fileName);
        return;
      }
    } catch (error) {
      console.warn("[VideoCompatibleAdapter] \u8FDC\u7A0B\u53C2\u8003\u56FE\u8F6C\u6587\u4EF6\u5931\u8D25\uFF0C\u56DE\u9000\u5230\u517C\u5BB9\u5B57\u6BB5 image");
    }
    formData.append("image", imageSource);
  }
  async fetchContentUrl(cleanBase, taskId, headers, signal) {
    const contentUrls = [
      `${cleanBase}/videos/${encodeURIComponent(taskId)}/content`,
      `${cleanBase}/video/generations/${encodeURIComponent(taskId)}/content`
    ];
    for (const contentUrl of contentUrls) {
      const response = await fetch(contentUrl, { headers, signal });
      if (!response || !response.ok) {
        continue;
      }
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const payload = await response.json().catch(() => ({}));
        const videoUrl = this.extractVideoUrl(payload);
        if (videoUrl) {
          return videoUrl;
        }
        continue;
      }
      const blob = await response.blob();
      if (!blob.size || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
        continue;
      }
      return URL.createObjectURL(blob);
    }
    return "";
  }
  async generateVideoViaNewApi(options, keySlot, cleanBase) {
    const submitUrl = `${cleanBase}/videos`;
    const headers = this.buildHeaders(keySlot, false);
    const formData = new FormData();
    formData.append("model", options.modelId);
    formData.append("prompt", options.prompt);
    const seconds = this.getDurationSeconds(options);
    if (seconds) {
      formData.append("seconds", String(seconds));
    }
    const size = this.getVideoSizeString(options);
    if (size) {
      formData.append("size", size);
    }
    if (options.imageUrl) {
      await this.appendInputReference(formData, options.imageUrl);
    }
    if (options.aspectRatio || options.resolution || options.size || options.imageTailUrl || options.videoUrl) {
      console.warn("[VideoCompatibleAdapter] new-api \u4E25\u683C\u6A21\u5F0F\u4EC5\u8F6C\u53D1\u6587\u6863\u5B57\u6BB5 model / prompt / seconds / input_reference\uFF0C\u5176\u4ED6\u89C6\u9891\u5B57\u6BB5\u4E0D\u518D\u79C1\u81EA\u6539\u5199\u3002");
    }
    const response = await fetch(submitUrl, {
      method: "POST",
      headers,
      body: formData,
      signal: options.signal
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`\u89C6\u9891 API \u9519\u8BEF ${response.status}: ${errText.slice(0, 300)}`);
    }
    const payload = await response.json().catch(() => ({}));
    const taskId = this.extractTaskId(payload);
    const directUrl = this.extractVideoUrl(payload);
    const status = this.extractStatus(payload);
    if (taskId) {
      options.onTaskId?.(taskId);
    }
    if (directUrl && (!status || this.isSuccessStatus(status))) {
      return {
        url: directUrl,
        taskId,
        status: "success",
        provider: this.provider,
        providerName: keySlot.name || this.provider,
        model: options.modelId
      };
    }
    if (!taskId) {
      throw new Error("\u89C6\u9891\u63A5\u53E3\u8FD4\u56DE\u6210\u529F\uFF0C\u4F46\u672A\u63D0\u4F9B\u4EFB\u52A1 ID \u6216\u53EF\u7528\u89C6\u9891\u5730\u5740");
    }
    return this.pollNewApiTask(taskId, options, keySlot, cleanBase);
  }
  async pollNewApiTask(taskId, options, keySlot, cleanBase) {
    const headers = this.buildHeaders(keySlot, false);
    const pollUrls = [
      `${cleanBase}/videos/${encodeURIComponent(taskId)}`,
      `${cleanBase}/video/generations/${encodeURIComponent(taskId)}`
    ];
    const maxDurationMs = 30 * 60 * 1e3;
    const startTime = Date.now();
    let pollInterval = 3e3;
    const maxInterval = 15e3;
    while (Date.now() - startTime < maxDurationMs) {
      if (options.signal?.aborted) {
        throw new Error("\u89C6\u9891\u751F\u6210\u5DF2\u53D6\u6D88");
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      pollInterval = Math.min(Math.round(pollInterval * 1.5), maxInterval);
      let response;
      let fatalError = null;
      for (const pollUrl of pollUrls) {
        response = await fetch(pollUrl, {
          headers,
          signal: options.signal
        });
        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          if (response.status >= 500 || response.status === 404) {
            continue;
          }
          fatalError = new Error(`\u7459\u55DB\uE576\u675E\uE1BF\uE1D7\u95BF\u6B12\uE1E4 ${response.status}: ${errText.slice(0, 200)}`);
          break;
        }
        break;
      }
      if (!response || !response.ok) {
        const errText = response ? await response.text().catch(() => "") : "";
        if (response?.status >= 500 || response?.status === 404) {
          continue;
        }
        if (fatalError) {
          throw fatalError;
        }
        throw new Error(`\u89C6\u9891\u8F6E\u8BE2\u9519\u8BEF ${response.status}: ${errText.slice(0, 200)}`);
      }
      const payload = await response.json().catch(() => ({}));
      const status = this.extractStatus(payload);
      const directUrl = this.extractVideoUrl(payload);
      if (directUrl && this.isSuccessStatus(status || "SUCCESS")) {
        return {
          url: directUrl,
          taskId,
          status: "success",
          provider: this.provider,
          providerName: keySlot.name || this.provider,
          model: options.modelId
        };
      }
      if (this.isSuccessStatus(status)) {
        const contentUrl = await this.fetchContentUrl(cleanBase, taskId, headers, options.signal);
        if (contentUrl) {
          return {
            url: contentUrl,
            taskId,
            status: "success",
            provider: this.provider,
            providerName: keySlot.name || this.provider,
            model: options.modelId
          };
        }
        throw new Error("\u89C6\u9891\u4EFB\u52A1\u5DF2\u6210\u529F\u5B8C\u6210\uFF0C\u4F46\u672A\u53D6\u56DE\u53EF\u7528\u7684\u89C6\u9891\u5185\u5BB9");
      }
      if (this.isFailureStatus(status)) {
        const reason = payload?.error || payload?.message || payload?.data?.error || JSON.stringify(payload);
        throw new Error(`\u89C6\u9891\u751F\u6210\u5931\u8D25: ${reason}`);
      }
    }
    throw new Error("\u89C6\u9891\u751F\u6210\u8D85\u65F6\uFF0830 \u5206\u949F\uFF09");
  }
  async generateVideoViaLegacyProxy(options, keySlot, cleanBase) {
    const submitUrl = `${cleanBase}/videos/generations`;
    const headers = this.buildHeaders(keySlot, true);
    const body = {
      model: options.modelId,
      prompt: options.prompt
    };
    if (options.aspectRatio && String(options.aspectRatio).toLowerCase() !== "auto") {
      body.aspect_ratio = options.aspectRatio;
    }
    if (options.resolution) {
      body.resolution = options.resolution;
    }
    if (options.size) {
      body.size = options.size;
    }
    if (this.getDurationSeconds(options)) {
      body.duration = this.getDurationSeconds(options);
    }
    if (options.imageUrl) {
      body.images = [options.imageUrl];
    }
    if (options.imageTailUrl) {
      body.images = Array.isArray(body.images) ? body.images : [];
      body.images.push(options.imageTailUrl);
    }
    if (options.videoUrl) {
      body.videos = [options.videoUrl];
    }
    if (options.watermark !== void 0) {
      body.watermark = options.watermark;
    }
    const response = await fetch(submitUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: options.signal
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`\u89C6\u9891 API \u9519\u8BEF ${response.status}: ${errText.slice(0, 300)}`);
    }
    const payload = await response.json().catch(() => ({}));
    const taskId = this.extractTaskId(payload);
    const directUrl = this.extractVideoUrl(payload);
    const status = this.extractStatus(payload);
    if (taskId) {
      options.onTaskId?.(taskId);
    }
    if (directUrl && (!status || this.isSuccessStatus(status))) {
      return {
        url: directUrl,
        taskId,
        status: "success",
        provider: this.provider,
        providerName: keySlot.name || this.provider,
        model: options.modelId
      };
    }
    if (!taskId) {
      return {
        url: directUrl || "",
        status: directUrl ? "success" : "processing",
        provider: this.provider,
        providerName: keySlot.name || this.provider,
        model: options.modelId
      };
    }
    const pollHeaders = this.buildHeaders(keySlot, false);
    const pollUrl = `${submitUrl}/${encodeURIComponent(taskId)}`;
    const maxDurationMs = 30 * 60 * 1e3;
    const startTime = Date.now();
    let pollInterval = 3e3;
    const maxInterval = 15e3;
    while (Date.now() - startTime < maxDurationMs) {
      if (options.signal?.aborted) {
        throw new Error("\u89C6\u9891\u751F\u6210\u5DF2\u53D6\u6D88");
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      pollInterval = Math.min(Math.round(pollInterval * 1.5), maxInterval);
      const pollResponse = await fetch(pollUrl, {
        headers: pollHeaders,
        signal: options.signal
      });
      if (!pollResponse.ok) {
        if (pollResponse.status >= 500) {
          continue;
        }
        const errText = await pollResponse.text().catch(() => "");
        throw new Error(`\u89C6\u9891\u8F6E\u8BE2\u9519\u8BEF ${pollResponse.status}: ${errText.slice(0, 200)}`);
      }
      const pollPayload = await pollResponse.json().catch(() => ({}));
      const pollStatus = this.extractStatus(pollPayload);
      const pollVideoUrl = this.extractVideoUrl(pollPayload);
      if (pollVideoUrl && this.isSuccessStatus(pollStatus || "SUCCESS")) {
        return {
          url: pollVideoUrl,
          taskId,
          status: "success",
          provider: this.provider,
          providerName: keySlot.name || this.provider,
          model: options.modelId
        };
      }
      if (this.isFailureStatus(pollStatus)) {
        const reason = pollPayload?.error || pollPayload?.message || pollPayload?.data?.error || JSON.stringify(pollPayload);
        throw new Error(`\u89C6\u9891\u751F\u6210\u5931\u8D25: ${reason}`);
      }
    }
    throw new Error("\u89C6\u9891\u751F\u6210\u8D85\u65F6\uFF0830 \u5206\u949F\uFF09");
  }
};
export {
  VideoCompatibleAdapter
};
