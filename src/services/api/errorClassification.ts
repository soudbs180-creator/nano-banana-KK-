export type ApiFailureKind =
  | 'auth'
  | 'network'
  | 'timeout'
  | 'rate_limit'
  | 'server'
  | 'request'
  | 'unknown';

export interface ApiFailureInfo {
  kind: ApiFailureKind;
  status?: number;
  rawMessage: string;
  detail: string;
}

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

export function extractStatusCode(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value === 'object') {
    const candidate = (value as any).status ?? (value as any).statusCode ?? (value as any).code;
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  const text = normalizeText(value);
  const match = text.match(/\b(401|403|408|409|413|422|429|500|502|503|504|524|530)\b/);
  if (match) {
    return Number.parseInt(match[1], 10);
  }

  return undefined;
}

export function extractApiErrorDetail(input: {
  responseText?: string;
  fallback?: string;
}): string {
  const responseText = normalizeText(input.responseText);
  if (!responseText) {
    return normalizeText(input.fallback);
  }

  try {
    const parsed = JSON.parse(responseText);
    const errorObj = parsed?.error || parsed;
    return normalizeText(
      errorObj?.message ||
      errorObj?.error ||
      parsed?.message ||
      input.fallback ||
      responseText
    );
  } catch {
    return responseText || normalizeText(input.fallback);
  }
}

export function hasAuthErrorMarkers(value: unknown): boolean {
  const text = normalizeText(value).toLowerCase();
  if (!text) return false;

  return [
    '401',
    '403',
    'unauthorized',
    'forbidden',
    'invalid token',
    'invalid api key',
    'api key invalid',
    'invalid authentication',
    'authentication failed',
    'authentication error',
    'access token',
    'permission denied',
    'permission_denied',
    'invalid key',
    'token invalid',
    'expired token',
    'invalid credential',
    'invalid credentials',
    '无效的令牌',
    '令牌无效',
    '密钥无效',
    'api密钥无效',
    'api key 无效',
    '认证失败',
    '鉴权失败',
    '权限不足',
    '访问令牌',
    '已过期',
  ].some(marker => text.includes(marker));
}

export function hasTimeoutMarkers(value: unknown): boolean {
  const text = normalizeText(value).toLowerCase();
  if (!text) return false;

  return [
    'timeout',
    'timed out',
    'request timeout',
    '524',
    'etimedout',
    '超时',
    '请求超时',
    '连接超时',
  ].some(marker => text.includes(marker));
}

export function hasNetworkErrorMarkers(value: unknown): boolean {
  const text = normalizeText(value).toLowerCase();
  if (!text) return false;

  return [
    'failed to fetch',
    'network error',
    'network request failed',
    'fetch failed',
    'econnreset',
    'enotfound',
    'econnrefused',
    'socket hang up',
    'cors',
    'dns',
    '网络错误',
    '网络异常',
    '网络连接失败',
    '无法连接',
    '连接失败',
  ].some(marker => text.includes(marker));
}

export function classifyApiFailure(input: {
  error?: unknown;
  status?: number;
  responseText?: string;
  fallbackMessage?: string;
}): ApiFailureInfo {
  const errorText = normalizeText(
    input.error instanceof Error
      ? input.error.message
      : input.error
  );
  const detail = extractApiErrorDetail({
    responseText: input.responseText,
    fallback: errorText || input.fallbackMessage,
  });
  const rawMessage = detail || errorText || normalizeText(input.fallbackMessage);
  const status = input.status ?? extractStatusCode(input.error) ?? extractStatusCode(rawMessage);

  if (status === 401 || status === 403 || hasAuthErrorMarkers(rawMessage)) {
    return { kind: 'auth', status, rawMessage, detail };
  }
  if (status === 408 || status === 524 || hasTimeoutMarkers(rawMessage)) {
    return { kind: 'timeout', status, rawMessage, detail };
  }
  if (status === 429 || rawMessage.toLowerCase().includes('rate limit')) {
    return { kind: 'rate_limit', status, rawMessage, detail };
  }
  if ([500, 502, 503, 504, 530].includes(status || 0)) {
    return { kind: 'server', status, rawMessage, detail };
  }
  if ([400, 404, 405, 409, 413, 415, 422].includes(status || 0)) {
    return { kind: 'request', status, rawMessage, detail };
  }
  if (hasNetworkErrorMarkers(rawMessage)) {
    return { kind: 'network', status, rawMessage, detail };
  }

  return { kind: 'unknown', status, rawMessage, detail };
}

export function buildUserFacingApiErrorMessage(info: ApiFailureInfo): string {
  switch (info.kind) {
    case 'auth':
      return `认证失败${info.status ? ` (${info.status})` : ''}: ${info.detail || '请检查 API Key / Token 是否正确、是否过期，以及当前渠道使用的鉴权方式是否匹配文档。'}`;
    case 'timeout':
      return `请求超时${info.status ? ` (${info.status})` : ''}: ${info.detail || '请检查网络、代理或目标服务状态。'}`;
    case 'network':
      return `网络错误: ${info.detail || '无法连接到目标服务，请检查网络、代理或基础地址。'}`;
    case 'rate_limit':
      return `请求过于频繁${info.status ? ` (${info.status})` : ''}: ${info.detail || '请稍后重试或切换渠道。'}`;
    case 'server':
      return `服务端错误${info.status ? ` (${info.status})` : ''}: ${info.detail || '目标服务暂时不可用。'}`;
    case 'request':
      return `请求错误${info.status ? ` (${info.status})` : ''}: ${info.detail || '请检查接口地址、模型或请求参数是否符合文档。'}`;
    default:
      return info.detail || info.rawMessage || '未知错误';
  }
}
