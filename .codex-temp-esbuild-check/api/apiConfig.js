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
  authorizationValueFormat: "bearer",
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
    authorizationValueFormat: "raw",
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
    authorizationValueFormat: "bearer",
    defaultCompatibilityMode: "standard",
    imageProfile: "openai-strict",
    videoApiStyle: "openai-v1-videos",
    autoGeminiNativeForGeminiModels: true,
    respectProviderOnCustomHost: true,
    uiProvider: "12AI"
  },
  {
    id: "wuyinkeji",
    label: "Wuyin Keji",
    known: true,
    basePatterns: [/api\.wuyinkeji\.com/i, /wuyinkeji/i],
    defaultFormat: "openai",
    defaultAuthMethod: "header",
    geminiAuthMethod: "query",
    defaultHeaderName: AUTHORIZATION_HEADER,
    authorizationValueFormat: "raw",
    defaultCompatibilityMode: "standard",
    imageProfile: "openai-strict",
    videoApiStyle: "openai-v1-videos",
    autoGeminiNativeForGeminiModels: false,
    respectProviderOnCustomHost: true,
    uiProvider: "OpenAI"
  },
  {
    id: "newapi",
    label: "NewAPI / OneAPI",
    known: true,
    providerPatterns: [/^newapi$/i, /^oneapi$/i, /^cherry(\s+studio)?$/i],
    hostPatterns: [/^ai\.newapi\.pro$/i, /^docs\.newapi\.pro$/i, /(^|\.)newapi\./i, /(^|\.)oneapi\./i],
    basePatterns: [/newapi/i, /oneapi/i, /vodeshop/i, /future-api/i],
    defaultFormat: "openai",
    defaultAuthMethod: "header",
    geminiAuthMethod: "header",
    defaultHeaderName: AUTHORIZATION_HEADER,
    authorizationValueFormat: "bearer",
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
  const authorizationValueFormat = strategy.authorizationValueFormat || "bearer";
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
    authorizationValueFormat,
    compatibilityMode,
    geminiNative,
    imageProfile: strategy.imageProfile || "openai-strict",
    videoApiStyle: strategy.videoApiStyle || "openai-v1-videos",
    isKnownProvider: strategy.known,
    uiProvider: strategy.uiProvider || "OpenAI"
  };
}

// src/services/api/apiConfig.ts
var DEFAULT_PROVIDERS = [
  {
    id: "google",
    name: "Google Official",
    baseUrl: "https://generativelanguage.googleapis.com",
    authMethod: "query",
    headerName: "x-goog-api-key"
  },
  {
    id: "custom",
    name: "Custom Proxy",
    baseUrl: "",
    authMethod: "header",
    headerName: "Authorization"
  }
];
var GOOGLE_API_BASE = "https://generativelanguage.googleapis.com";
function normalizeApiProtocolFormat(format, fallback = "auto") {
  const normalized = String(format || "").trim().toLowerCase();
  if (normalized === "openai" || normalized === "gemini" || normalized === "auto") {
    return normalized;
  }
  return fallback;
}
function resolveApiProtocolFormat(format, baseUrl, fallback = "openai", provider) {
  return resolveProviderRuntime({
    provider,
    baseUrl,
    format,
    fallbackFormat: fallback
  }).resolvedFormat;
}
function getApiKeyToken(apiKey) {
  return String(apiKey || "").trim().replace(/^Bearer\s+/i, "").trim();
}
function formatAuthorizationHeaderValue(apiKey, valueFormat = "bearer") {
  const token = getApiKeyToken(apiKey);
  if (valueFormat === "raw") {
    return token;
  }
  return /^Bearer\s+/i.test(apiKey) ? apiKey : `Bearer ${token}`;
}
function buildApiUrl(baseUrl, model, action, authMethod, apiKey) {
  const base = baseUrl || GOOGLE_API_BASE;
  const normalizedModel = model.replace(/^models\//, "");
  const useBeta = normalizedModel.includes("preview") || normalizedModel.includes("exp") || normalizedModel.includes("gemini-2") || normalizedModel.includes("gemini-3") || normalizedModel.includes("ultra");
  const apiVersion = useBeta ? "v1beta" : "v1";
  const url = `${base}/${apiVersion}/models/${normalizedModel}:${action}`;
  return authMethod === "query" && apiKey ? `${url}?key=${encodeURIComponent(getApiKeyToken(apiKey))}` : url;
}
function buildHeaders(authMethod, apiKey, headerName, authorizationValueFormat = "bearer") {
  const headers = {
    "Content-Type": "application/json"
  };
  if (authMethod === "header") {
    const effectiveHeaderName = headerName || "x-goog-api-key";
    headers[effectiveHeaderName] = effectiveHeaderName === "Authorization" ? formatAuthorizationHeaderValue(apiKey, authorizationValueFormat) : getApiKeyToken(apiKey);
  }
  return headers;
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
function usesGeminiQueryAuth(baseUrl, provider) {
  return resolveProviderRuntime({
    provider,
    baseUrl,
    format: "gemini"
  }).authMethod === "query";
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
function buildGeminiHeaders(authMethod, apiKey, headerName, authorizationValueFormat = "bearer") {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json"
  };
  if (authMethod !== "header") {
    return headers;
  }
  const effectiveHeaderName = headerName || "Authorization";
  headers[effectiveHeaderName] = effectiveHeaderName === "Authorization" ? formatAuthorizationHeaderValue(apiKey, authorizationValueFormat) : getApiKeyToken(apiKey);
  return headers;
}
function buildProxyHeaders(authMethod, apiKey, headerName = "Authorization", group, authorizationValueFormat = "bearer") {
  const headers = {
    "Content-Type": "application/json"
  };
  if (authMethod === "header" && apiKey) {
    if (headerName === "Authorization" && !/^Bearer\s+/i.test(apiKey)) {
      headers[headerName] = formatAuthorizationHeaderValue(apiKey, authorizationValueFormat);
    } else {
      headers[headerName] = headerName === "Authorization" ? formatAuthorizationHeaderValue(apiKey, authorizationValueFormat) : apiKey;
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
function resolveApiHeaderName(provider, baseUrl, authMethod, format = "auto") {
  return resolveProviderRuntime({
    provider,
    baseUrl,
    authMethod,
    format
  }).headerName;
}
function getDefaultAuthMethod(baseUrl, options) {
  return resolveProviderRuntime({
    provider: options?.provider,
    baseUrl,
    format: options?.format,
    modelId: options?.modelId
  }).authMethod;
}
export {
  DEFAULT_PROVIDERS,
  GOOGLE_API_BASE,
  buildApiUrl,
  buildGeminiEndpoint,
  buildGeminiHeaders,
  buildGeminiModelsEndpoint,
  buildHeaders,
  buildOpenAIEndpoint,
  buildProxyHeaders,
  formatAuthorizationHeaderValue,
  getApiKeyToken,
  getDefaultAuthMethod,
  normalizeApiProtocolFormat,
  normalizeGeminiBaseUrl,
  normalizeGeminiModelId,
  normalizeOpenAIBaseUrl,
  normalizeProxyBaseUrl,
  resolveApiHeaderName,
  resolveApiProtocolFormat,
  resolveGeminiAuthMethod,
  usesGeminiQueryAuth
};
