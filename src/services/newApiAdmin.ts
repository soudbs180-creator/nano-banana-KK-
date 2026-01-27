export type NewApiAdminConfig = {
  baseUrl: string;
  token: string;
  authHeader?: string;
  tokenPrefix?: string;
  adminPath?: string;
};

export type NewApiAdminProfile = NewApiAdminConfig & {
  id: string;
  name: string;
};

type NewApiAdminState = {
  activeProfileId: string | null;
  profiles: NewApiAdminProfile[];
};

const STORAGE_KEY = 'kk_newapi_admin_config';

const normalizeBaseUrl = (input: string): string => {
  let value = (input || '').trim();
  if (!value) return '';
  if (value.endsWith('/')) value = value.slice(0, -1);
  if (value.endsWith('/api')) value = value.slice(0, -4);
  if (value.endsWith('/v1')) value = value.slice(0, -3);
  if (value.endsWith('/v1beta')) value = value.slice(0, -7);
  if (value.endsWith('/')) value = value.slice(0, -1);
  return value;
};

const normalizeProfile = (profile: NewApiAdminProfile): NewApiAdminProfile => ({
  ...profile,
  baseUrl: normalizeBaseUrl(profile.baseUrl),
  token: profile.token || '',
  authHeader: profile.authHeader || 'Authorization',
  tokenPrefix: profile.tokenPrefix !== undefined
    ? profile.tokenPrefix
    : (profile.authHeader || 'Authorization') === 'Authorization' ? 'Bearer ' : '',
  adminPath: profile.adminPath || '/api'
});

const migrateLegacyState = (raw: any): NewApiAdminState => {
  if (raw?.profiles) {
    const profiles = Array.isArray(raw.profiles) ? raw.profiles.map(normalizeProfile) : [];
    return {
      activeProfileId: raw.activeProfileId || profiles[0]?.id || null,
      profiles
    };
  }

  const legacyBaseUrl = raw?.baseUrl || '';
  const legacyToken = raw?.token || '';
  const legacyProfile: NewApiAdminProfile = normalizeProfile({
    id: 'default',
    name: '默认连接',
    baseUrl: legacyBaseUrl,
    token: legacyToken,
    adminPath: '/api'
  });

  return {
    activeProfileId: legacyProfile.id,
    profiles: [legacyProfile]
  };
};

export const getNewApiAdminState = (): NewApiAdminState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        activeProfileId: null,
        profiles: []
      };
    }
    const parsed = JSON.parse(raw);
    return migrateLegacyState(parsed);
  } catch {
    return {
      activeProfileId: null,
      profiles: []
    };
  }
};

export const setNewApiAdminState = (state: NewApiAdminState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const saveNewApiAdminProfile = (profile: NewApiAdminProfile) => {
  const state = getNewApiAdminState();
  const normalized = normalizeProfile(profile);
  const existingIndex = state.profiles.findIndex(p => p.id === normalized.id);
  if (existingIndex >= 0) state.profiles[existingIndex] = normalized;
  else state.profiles.push(normalized);
  state.activeProfileId = normalized.id;
  setNewApiAdminState(state);
  return state;
};

export const deleteNewApiAdminProfile = (id: string) => {
  const state = getNewApiAdminState();
  state.profiles = state.profiles.filter(p => p.id !== id);
  if (state.activeProfileId === id) {
    state.activeProfileId = state.profiles[0]?.id || null;
  }
  setNewApiAdminState(state);
  return state;
};

export const setActiveNewApiAdminProfile = (id: string) => {
  const state = getNewApiAdminState();
  if (state.profiles.some(p => p.id === id)) {
    state.activeProfileId = id;
    setNewApiAdminState(state);
  }
  return state;
};

export const getActiveNewApiAdminConfig = (): NewApiAdminConfig => {
  const state = getNewApiAdminState();
  const active = state.profiles.find(p => p.id === state.activeProfileId);
  return active ? normalizeProfile(active) : { baseUrl: '', token: '', authHeader: 'Authorization', tokenPrefix: 'Bearer ', adminPath: '/api' };
};

export const newApiAdminRequest = async <T = unknown>(
  config: NewApiAdminConfig,
  path: string,
  method: string = 'GET',
  body?: unknown
): Promise<T> => {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  if (!baseUrl) throw new Error('请先填写 New API Base URL');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const adminPath = (config.adminPath || '/api').trim();
  let normalizedAdminPath = adminPath
    ? (adminPath.startsWith('/') ? adminPath : `/${adminPath}`).replace(/\/$/, '')
    : '';
  if (normalizedAdminPath === '/') normalizedAdminPath = '';
  const shouldPrefix = normalizedAdminPath
    && !normalizedPath.startsWith(normalizedAdminPath + '/')
    && normalizedPath !== normalizedAdminPath;
  const url = `${baseUrl}${shouldPrefix ? normalizedAdminPath : ''}${normalizedPath}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (config.token) {
    const headerName = config.authHeader || 'Authorization';
    const prefix = config.tokenPrefix !== undefined
      ? config.tokenPrefix
      : headerName === 'Authorization' ? 'Bearer ' : '';
    headers[headerName] = `${prefix}${config.token}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
};
