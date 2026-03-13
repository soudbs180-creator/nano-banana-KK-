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
function resolveProviderKeyType(provider, baseUrl) {
  const normalizedProvider = normalizeProviderName(provider);
  const strategy = resolveProviderStrategy(provider, baseUrl);
  const host = normalizeHost(baseUrl);
  const googleHost = matchesAny(PROVIDER_STRATEGIES.find((item) => item.id === "google")?.hostPatterns, host) || /googleapis\.com$/i.test(host);
  if (normalizedProvider === "google" && (!normalizeBaseUrl(baseUrl) || googleHost || strategy.id === "google")) {
    return "official";
  }
  if (normalizedProvider === "google") {
    return "proxy";
  }
  return "third-party";
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
export {
  isGeminiFamilyModel,
  resolveProviderKeyType,
  resolveProviderRuntime,
  resolveProviderStrategy
};
