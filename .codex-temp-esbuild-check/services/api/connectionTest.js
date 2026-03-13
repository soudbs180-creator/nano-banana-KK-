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

// src/services/api/apiConfig.ts
var GOOGLE_API_BASE = "https://generativelanguage.googleapis.com";
function getApiKeyToken(apiKey) {
  return String(apiKey || "").trim().replace(/^Bearer\s+/i, "").trim();
}
function normalizeProxyBaseUrl(url) {
  if (!url) return "";
  let clean = url.trim();
  if (clean.endsWith("/")) clean = clean.slice(0, -1);
  if (clean.endsWith("/v1")) clean = clean.slice(0, -3);
  return clean;
}
function normalizeOpenAIBaseUrl(url) {
  if (!url) return "";
  let clean = url.trim().replace(/\/+$/, "");
  clean = clean.replace(/\/(?:chat\/completions|images\/generations|images\/edits|responses|models)$/i, "");
  if (!/\/v\d[\w.-]*$/i.test(clean)) {
    clean = `${clean}/v1`;
  }
  return clean.replace(/\/+$/, "");
}
function buildOpenAIEndpoint(baseUrl, endpoint) {
  const cleanBase = normalizeOpenAIBaseUrl(baseUrl);
  return `${cleanBase}/${endpoint.replace(/^\/+/, "")}`;
}
function normalizeGeminiBaseUrl(url) {
  let clean = (url || GOOGLE_API_BASE).trim().replace(/\/+$/, "");
  clean = clean.replace(/\/v1beta\/models\/[^/?]+:(?:generateContent|streamGenerateContent)$/i, "").replace(/\/v1\/models\/[^/?]+:(?:generateContent|streamGenerateContent)$/i, "").replace(/\/+$/, "");
  const suffixes = [
    "/v1beta/models",
    "/v1/models",
    "/models",
    "/v1beta",
    "/v1"
  ];
  let stripped = true;
  while (stripped) {
    stripped = false;
    const lower = clean.toLowerCase();
    for (const suffix of suffixes) {
      if (lower.endsWith(suffix)) {
        clean = clean.slice(0, -suffix.length).replace(/\/+$/, "");
        stripped = true;
        break;
      }
    }
  }
  return clean || GOOGLE_API_BASE;
}
function normalizeGeminiModelId(model) {
  return String(model || "").trim().replace(/^models\//i, "");
}
function resolveGeminiAuthMethod(baseUrl, preferred, provider) {
  return resolveProviderRuntime({
    provider,
    baseUrl,
    format: "gemini",
    authMethod: preferred
  }).authMethod;
}
function buildGeminiEndpoint(baseUrl, model, action, apiKey, authMethod, provider) {
  const cleanBase = normalizeGeminiBaseUrl(baseUrl);
  const normalizedModel = normalizeGeminiModelId(model);
  const endpoint = `${cleanBase}/v1beta/models/${encodeURIComponent(normalizedModel)}:${action}`;
  if (resolveGeminiAuthMethod(baseUrl, authMethod, provider) === "query") {
    const encodedKey = encodeURIComponent(getApiKeyToken(apiKey));
    return `${endpoint}?key=${encodedKey}`;
  }
  return endpoint;
}
function buildGeminiModelsEndpoint(baseUrl, apiKey, authMethod, provider) {
  const cleanBase = normalizeGeminiBaseUrl(baseUrl);
  const endpoint = `${cleanBase}/v1beta/models`;
  if (resolveGeminiAuthMethod(baseUrl, authMethod, provider) === "query") {
    const encodedKey = encodeURIComponent(getApiKeyToken(apiKey));
    return `${endpoint}?key=${encodedKey}`;
  }
  return endpoint;
}
function buildGeminiHeaders(authMethod, apiKey, headerName) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json"
  };
  if (authMethod !== "header") {
    return headers;
  }
  const effectiveHeaderName = headerName || "Authorization";
  headers[effectiveHeaderName] = effectiveHeaderName === "Authorization" ? /^Bearer\s+/i.test(apiKey) ? apiKey : `Bearer ${getApiKeyToken(apiKey)}` : getApiKeyToken(apiKey);
  return headers;
}
function buildProxyHeaders(authMethod, apiKey, headerName = "Authorization", group) {
  const headers = {
    "Content-Type": "application/json"
  };
  if (authMethod === "header" && apiKey) {
    if (headerName === "Authorization" && !/^Bearer\s+/i.test(apiKey)) {
      headers[headerName] = `Bearer ${apiKey}`;
    } else {
      headers[headerName] = apiKey;
    }
  }
  if (apiKey.startsWith("sk-or-") || headerName.toLowerCase() === "authorization") {
    if (typeof window !== "undefined") {
      headers["HTTP-Referer"] = window.location.origin;
      headers["X-Title"] = "KK Studio";
    }
  }
  if (group) {
    headers["X-Group"] = group;
  }
  return headers;
}

// src/services/api/errorClassification.ts
function normalizeText(value) {
  return String(value || "").trim();
}
function extractStatusCode(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value && typeof value === "object") {
    const candidate = value.status ?? value.statusCode ?? value.code;
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  const text = normalizeText(value);
  const match = text.match(/\b(401|403|408|409|413|422|429|500|502|503|504|524|530)\b/);
  if (match) {
    return Number.parseInt(match[1], 10);
  }
  return void 0;
}
function extractApiErrorDetail(input) {
  const responseText = normalizeText(input.responseText);
  if (!responseText) {
    return normalizeText(input.fallback);
  }
  try {
    const parsed = JSON.parse(responseText);
    const errorObj = parsed?.error || parsed;
    return normalizeText(
      errorObj?.message || errorObj?.error || parsed?.message || input.fallback || responseText
    );
  } catch {
    return responseText || normalizeText(input.fallback);
  }
}
function hasAuthErrorMarkers(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return false;
  return [
    "401",
    "403",
    "unauthorized",
    "forbidden",
    "invalid token",
    "invalid api key",
    "api key invalid",
    "invalid authentication",
    "authentication failed",
    "authentication error",
    "access token",
    "permission denied",
    "permission_denied",
    "invalid key",
    "token invalid",
    "expired token",
    "invalid credential",
    "invalid credentials",
    "\u65E0\u6548\u7684\u4EE4\u724C",
    "\u4EE4\u724C\u65E0\u6548",
    "\u5BC6\u94A5\u65E0\u6548",
    "api\u5BC6\u94A5\u65E0\u6548",
    "api key \u65E0\u6548",
    "\u8BA4\u8BC1\u5931\u8D25",
    "\u9274\u6743\u5931\u8D25",
    "\u6743\u9650\u4E0D\u8DB3",
    "\u8BBF\u95EE\u4EE4\u724C",
    "\u5DF2\u8FC7\u671F"
  ].some((marker) => text.includes(marker));
}
function hasTimeoutMarkers(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return false;
  return [
    "timeout",
    "timed out",
    "request timeout",
    "524",
    "etimedout",
    "\u8D85\u65F6",
    "\u8BF7\u6C42\u8D85\u65F6",
    "\u8FDE\u63A5\u8D85\u65F6"
  ].some((marker) => text.includes(marker));
}
function hasNetworkErrorMarkers(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return false;
  return [
    "failed to fetch",
    "network error",
    "network request failed",
    "fetch failed",
    "econnreset",
    "enotfound",
    "econnrefused",
    "socket hang up",
    "cors",
    "dns",
    "\u7F51\u7EDC\u9519\u8BEF",
    "\u7F51\u7EDC\u5F02\u5E38",
    "\u7F51\u7EDC\u8FDE\u63A5\u5931\u8D25",
    "\u65E0\u6CD5\u8FDE\u63A5",
    "\u8FDE\u63A5\u5931\u8D25"
  ].some((marker) => text.includes(marker));
}
function classifyApiFailure(input) {
  const errorText = normalizeText(
    input.error instanceof Error ? input.error.message : input.error
  );
  const detail = extractApiErrorDetail({
    responseText: input.responseText,
    fallback: errorText || input.fallbackMessage
  });
  const rawMessage = detail || errorText || normalizeText(input.fallbackMessage);
  const status = input.status ?? extractStatusCode(input.error) ?? extractStatusCode(rawMessage);
  if (status === 401 || status === 403 || hasAuthErrorMarkers(rawMessage)) {
    return { kind: "auth", status, rawMessage, detail };
  }
  if (status === 408 || status === 524 || hasTimeoutMarkers(rawMessage)) {
    return { kind: "timeout", status, rawMessage, detail };
  }
  if (status === 429 || rawMessage.toLowerCase().includes("rate limit")) {
    return { kind: "rate_limit", status, rawMessage, detail };
  }
  if ([500, 502, 503, 504, 530].includes(status || 0)) {
    return { kind: "server", status, rawMessage, detail };
  }
  if ([400, 404, 405, 409, 413, 415, 422].includes(status || 0)) {
    return { kind: "request", status, rawMessage, detail };
  }
  if (hasNetworkErrorMarkers(rawMessage)) {
    return { kind: "network", status, rawMessage, detail };
  }
  return { kind: "unknown", status, rawMessage, detail };
}
function buildUserFacingApiErrorMessage(info) {
  switch (info.kind) {
    case "auth":
      return `\u8BA4\u8BC1\u5931\u8D25${info.status ? ` (${info.status})` : ""}: ${info.detail || "\u8BF7\u68C0\u67E5 API Key / Token \u662F\u5426\u6B63\u786E\u3001\u662F\u5426\u8FC7\u671F\uFF0C\u4EE5\u53CA\u5F53\u524D\u6E20\u9053\u4F7F\u7528\u7684\u9274\u6743\u65B9\u5F0F\u662F\u5426\u5339\u914D\u6587\u6863\u3002"}`;
    case "timeout":
      return `\u8BF7\u6C42\u8D85\u65F6${info.status ? ` (${info.status})` : ""}: ${info.detail || "\u8BF7\u68C0\u67E5\u7F51\u7EDC\u3001\u4EE3\u7406\u6216\u76EE\u6807\u670D\u52A1\u72B6\u6001\u3002"}`;
    case "network":
      return `\u7F51\u7EDC\u9519\u8BEF: ${info.detail || "\u65E0\u6CD5\u8FDE\u63A5\u5230\u76EE\u6807\u670D\u52A1\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u3001\u4EE3\u7406\u6216\u57FA\u7840\u5730\u5740\u3002"}`;
    case "rate_limit":
      return `\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41${info.status ? ` (${info.status})` : ""}: ${info.detail || "\u8BF7\u7A0D\u540E\u91CD\u8BD5\u6216\u5207\u6362\u6E20\u9053\u3002"}`;
    case "server":
      return `\u670D\u52A1\u7AEF\u9519\u8BEF${info.status ? ` (${info.status})` : ""}: ${info.detail || "\u76EE\u6807\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528\u3002"}`;
    case "request":
      return `\u8BF7\u6C42\u9519\u8BEF${info.status ? ` (${info.status})` : ""}: ${info.detail || "\u8BF7\u68C0\u67E5\u63A5\u53E3\u5730\u5740\u3001\u6A21\u578B\u6216\u8BF7\u6C42\u53C2\u6570\u662F\u5426\u7B26\u5408\u6587\u6863\u3002"}`;
    default:
      return info.detail || info.rawMessage || "\u672A\u77E5\u9519\u8BEF";
  }
}

// src/services/api/connectionTest.ts
function getCleanBaseUrl(baseUrl) {
  return normalizeProxyBaseUrl(baseUrl) || String(baseUrl || "").replace(/\/$/, "");
}
function getModelId(config) {
  return String(config.model || "gemini-2.5-flash").trim();
}
function resolveConnectionRuntime(config, cleanBase) {
  return resolveProviderRuntime({
    provider: config.provider,
    baseUrl: cleanBase,
    format: config.format,
    authMethod: config.authMethod,
    headerName: config.headerName,
    compatibilityMode: config.compatibilityMode,
    modelId: getModelId(config)
  });
}
function isVideoModel(modelId) {
  return /(veo|sora|seedance|runway|luma|kling|pika|video)/i.test(modelId);
}
function isImageOnlyNativeModel(modelId) {
  const lower = modelId.toLowerCase();
  return lower.startsWith("imagen-") || lower.startsWith("veo-");
}
function buildFailureResult(params) {
  const failure = classifyApiFailure({
    error: params.error,
    status: params.status,
    responseText: params.responseText,
    fallbackMessage: params.fallbackMessage
  });
  return {
    success: false,
    message: buildUserFacingApiErrorMessage(failure),
    details: {
      status: failure.status,
      detail: failure.detail,
      kind: failure.kind
    },
    responseTime: Date.now() - params.startTime
  };
}
async function runGeminiGenerateContentTest(cleanBase, config) {
  const requestedModel = getModelId(config);
  const testModel = requestedModel.toLowerCase().startsWith("gemini-") ? requestedModel : "gemini-2.5-flash";
  const runtime = resolveConnectionRuntime(config, cleanBase);
  const authMethod = runtime.authMethod;
  const apiUrl = buildGeminiEndpoint(cleanBase, testModel, "generateContent", config.apiKey, authMethod, config.provider);
  return fetch(apiUrl, {
    method: "POST",
    headers: buildGeminiHeaders(authMethod, config.apiKey, runtime.headerName),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "Test connection" }] }]
    }),
    signal: AbortSignal.timeout(3e4)
  });
}
async function runOpenAIChatTest(cleanBase, config) {
  const base = cleanBase || "https://api.openai.com";
  const apiUrl = buildOpenAIEndpoint(base, "/chat/completions");
  const runtime = resolveConnectionRuntime(config, cleanBase);
  return fetch(apiUrl, {
    method: "POST",
    headers: buildProxyHeaders(runtime.authMethod, config.apiKey, runtime.headerName),
    body: JSON.stringify({
      model: getModelId(config),
      stream: false,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Test connection" }]
        }
      ],
      max_tokens: 10
    }),
    signal: AbortSignal.timeout(3e4)
  });
}
async function testCherryConnection(config) {
  const startTime = Date.now();
  try {
    const cleanBase = getCleanBaseUrl(config.baseUrl);
    const modelId = getModelId(config);
    const runtime = resolveConnectionRuntime(config, cleanBase);
    const nativeGemini = runtime.geminiNative;
    const responseTime = () => Date.now() - startTime;
    if (isVideoModel(modelId)) {
      const listTest = await testModelsList(config);
      return {
        ...listTest,
        message: listTest.success ? "\u89C6\u9891\u94FE\u8DEF\u9274\u6743\u6210\u529F\uFF0C\u5DF2\u8DF3\u8FC7\u521B\u5EFA\u4EFB\u52A1\u6D4B\u8BD5\u4EE5\u907F\u514D\u8BA1\u8D39" : `\u89C6\u9891\u94FE\u8DEF\u6D4B\u8BD5\u5931\u8D25: ${listTest.message}`,
        details: listTest.success ? {
          model: modelId,
          responseFormat: "models"
        } : listTest.details,
        responseTime: responseTime()
      };
    }
    if (nativeGemini && isImageOnlyNativeModel(modelId)) {
      const listTest = await testModelsList(config);
      return {
        ...listTest,
        message: listTest.success ? "\u539F\u751F\u56FE\u50CF\u94FE\u8DEF\u9274\u6743\u6210\u529F\uFF0C\u5DF2\u8DF3\u8FC7\u751F\u6210\u6D4B\u8BD5\u4EE5\u907F\u514D\u8BA1\u8D39" : `\u539F\u751F\u56FE\u50CF\u94FE\u8DEF\u6D4B\u8BD5\u5931\u8D25: ${listTest.message}`,
        details: listTest.success ? {
          model: modelId,
          responseFormat: "native-models"
        } : listTest.details,
        responseTime: responseTime()
      };
    }
    if (!nativeGemini && config.compatibilityMode === "standard") {
      const listTest = await testModelsList(config);
      return {
        ...listTest,
        message: listTest.success ? "\u6807\u51C6\u6A21\u5F0F\u9274\u6743\u6210\u529F\uFF0C\u5DF2\u8DF3\u8FC7\u56FE\u50CF\u751F\u6210\u6D4B\u8BD5\u4EE5\u907F\u514D\u8BA1\u8D39" : `\u6807\u51C6\u6A21\u5F0F\u6D4B\u8BD5\u5931\u8D25: ${listTest.message}`,
        details: listTest.success ? {
          model: modelId,
          responseFormat: "models"
        } : listTest.details,
        responseTime: responseTime()
      };
    }
    const response = nativeGemini ? await runGeminiGenerateContentTest(cleanBase, config) : await runOpenAIChatTest(cleanBase, config);
    const elapsed = responseTime();
    const responseText = await response.text();
    if (!response.ok) {
      return buildFailureResult({
        startTime,
        status: response.status,
        responseText,
        fallbackMessage: `HTTP ${response.status}`
      });
    }
    const result = JSON.parse(responseText);
    if (nativeGemini) {
      const parts = result.candidates?.[0]?.content?.parts || [];
      const textPreview = parts.map((part) => part?.text).filter((value) => typeof value === "string" && value.trim()).join(" ").slice(0, 100);
      return {
        success: true,
        message: "\u539F\u751F Gemini \u94FE\u8DEF\u8FDE\u63A5\u6210\u529F",
        details: {
          model: modelId,
          responseFormat: "generate-content",
          responsePreview: textPreview ? `${textPreview}...` : "Native generateContent responded successfully."
        },
        responseTime: elapsed
      };
    }
    if (Array.isArray(result.choices) && result.choices.length > 0) {
      return {
        success: true,
        message: "API \u8FDE\u63A5\u6210\u529F",
        details: {
          model: modelId,
          responseFormat: "chat-completions",
          responsePreview: `${String(result.choices[0].message?.content || "").slice(0, 100)}...`
        },
        responseTime: elapsed
      };
    }
    return {
      success: false,
      message: nativeGemini ? "\u539F\u751F\u54CD\u5E94\u683C\u5F0F\u5F02\u5E38\uFF0C\u7F3A\u5C11 candidates \u5B57\u6BB5" : "\u54CD\u5E94\u683C\u5F0F\u5F02\u5E38\uFF0C\u7F3A\u5C11 choices \u5B57\u6BB5",
      details: { response: result },
      responseTime: elapsed
    };
  } catch (error) {
    return buildFailureResult({
      startTime,
      error,
      fallbackMessage: error?.message || "Connection failed"
    });
  }
}
async function testModelsList(config) {
  const startTime = Date.now();
  try {
    const cleanBase = getCleanBaseUrl(config.baseUrl);
    const runtime = resolveConnectionRuntime(config, cleanBase);
    const nativeGemini = runtime.geminiNative;
    const listUrl = nativeGemini ? buildGeminiModelsEndpoint(cleanBase, config.apiKey, runtime.authMethod, config.provider) : buildOpenAIEndpoint(cleanBase || "https://api.openai.com", "/models");
    const headers = nativeGemini ? buildGeminiHeaders(runtime.authMethod, config.apiKey, runtime.headerName) : buildProxyHeaders(runtime.authMethod, config.apiKey, runtime.headerName);
    const response = await fetch(listUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(15e3)
    });
    const responseTime = Date.now() - startTime;
    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      const failure = classifyApiFailure({
        status: response.status,
        responseText,
        fallbackMessage: `HTTP ${response.status}`
      });
      return {
        success: false,
        message: `\u65E0\u6CD5\u83B7\u53D6\u6A21\u578B\u5217\u8868: ${buildUserFacingApiErrorMessage(failure)}`,
        details: {
          status: response.status,
          detail: failure.detail,
          kind: failure.kind
        },
        responseTime
      };
    }
    const data = await response.json();
    const models = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : Array.isArray(data) ? data : [];
    return {
      success: true,
      message: `\u6210\u529F\u83B7\u53D6 ${models.length} \u4E2A\u6A21\u578B`,
      details: {
        modelCount: models.length,
        models: models.slice(0, 5).map((model) => model.id || model.name || model.model || String(model))
      },
      responseTime
    };
  } catch (error) {
    const failure = classifyApiFailure({
      error,
      fallbackMessage: error?.message || "Model list request failed"
    });
    return {
      success: false,
      message: `\u83B7\u53D6\u6A21\u578B\u5217\u8868\u5931\u8D25: ${buildUserFacingApiErrorMessage(failure)}`,
      details: {
        status: failure.status,
        detail: failure.detail,
        kind: failure.kind
      },
      responseTime: Date.now() - startTime
    };
  }
}
async function comprehensiveConnectionTest(config) {
  const results = [];
  const basicTest = await testModelsList(config);
  results.push({
    ...basicTest,
    message: `\u57FA\u7840\u8FDE\u63A5: ${basicTest.message}`
  });
  let apiTest;
  try {
    apiTest = await testCherryConnection(config);
  } catch (error) {
    apiTest = {
      success: false,
      message: error.message || "Unknown error",
      responseTime: 0
    };
  }
  results.push({
    ...apiTest,
    message: `API\u529F\u80FD: ${apiTest.message}`
  });
  if (!basicTest.success && apiTest.success) {
    console.warn("[ConnectionTest] Model list failed but protocol test passed. Treating channel as usable.");
  }
  return results;
}
export {
  comprehensiveConnectionTest,
  testCherryConnection,
  testModelsList
};
