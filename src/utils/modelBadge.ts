export type ModelBadge = { colorClass: string; text: string }

// 模型颜色映射（仅文字颜色，不再包含背景高亮）
const MODEL_TEXT_PALETTE: string[] = [
  "text-purple-400",
  "text-yellow-400",
  "text-red-400",
  "text-green-400",
  "text-pink-400",
  "text-indigo-400",
  "text-teal-400",
  "text-orange-400",
]

// 供应商颜色映射（用于供应商标签，包含背景和边框）
const PROVIDER_PALETTE: string[] = [
  "bg-blue-600/20 text-blue-400 border-blue-500/30",
  "bg-yellow-600/20 text-yellow-400 border-yellow-500/30",
  "bg-green-600/20 text-green-400 border-green-500/30",
  "bg-purple-600/20 text-purple-400 border-purple-500/30",
  "bg-pink-600/20 text-pink-400 border-pink-500/30",
  "bg-indigo-600/20 text-indigo-400 border-indigo-500/30",
]

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h = (h ^ str.charCodeAt(i)) * 16777619;
  }
  return Math.abs(h);
}

const MODEL_COLOR_MAP_KEY = 'kk_model_color_map_v1';
const PROVIDER_COLOR_MAP_KEY = 'kk_provider_color_map_v1';

let modelColorMapCache: Record<string, string> | null = null;
let providerColorMapCache: Record<string, string> | null = null;

function readMap(key: string): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(key: string, map: Record<string, string>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // ignore storage quota / private mode
  }
}

function normalizeModelKey(id?: string, label?: string): string {
  const raw = (id || label || '').toLowerCase().trim();
  // Keep model family stable across providers/suffix noise
  const noProvider = raw.split('@')[0];
  return noProvider
    .replace(/-\d{8}$/i, '')
    .replace(/-(16[x-]9|9[x-]16|1[x-]1|4[x-]3|3[x-]4|21[x-]9|9[x-]21|3[x-]2|2[x-]3|4[x-]5|5[x-]4)$/i, '')
    .replace(/-(4k|2k|1k|high|hd|ultra|medium|low|standard)$/i, '')
    .trim();
}

function normalizeProviderKey(provider?: string): string {
  return (provider || 'unknown').toLowerCase().trim();
}

function getStableClass(
  key: string,
  palette: string[],
  storageKey: string,
  cacheRef: 'model' | 'provider'
): string {
  let map = cacheRef === 'model' ? modelColorMapCache : providerColorMapCache;
  if (!map) {
    map = readMap(storageKey);
    if (cacheRef === 'model') modelColorMapCache = map;
    else providerColorMapCache = map;
  }

  if (map[key]) return map[key];

  const used = new Set(Object.values(map));
  const available = palette.find(c => !used.has(c));
  const cls = available || palette[hashString(key) % palette.length];
  map[key] = cls;
  writeMap(storageKey, map);
  return cls;
}

// 供应商颜色：基于 provider 名称定义专属颜色，或回退到哈希颜色
export function getProviderBadgeColor(provider?: string): string {
  const providerLower = provider?.toLowerCase() || '';
  if (providerLower.includes('12ai')) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  if (providerLower.includes('official') || providerLower.includes('google')) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (providerLower.includes('custom')) return 'bg-gray-500/20 text-gray-400 border-gray-500/30';

  if (!provider) return PROVIDER_PALETTE[0];
  const key = normalizeProviderKey(provider);
  return getStableClass(key, PROVIDER_PALETTE, PROVIDER_COLOR_MAP_KEY, 'provider');
}

// 从标签样式中提取纯文字颜色
function extractTextColor(badgeClass: string): string {
  const match = badgeClass.match(/text-\S+/);
  return match ? match[0] : 'text-gray-400';
}

// 模型颜色：随机分配文字颜色，保持不同模型之间的文字颜色区分度
export function getModelBadgeInfo(model: { id: string; label?: string; provider?: string; }): ModelBadge {
  const id = model.id ?? '';
  const baseName = model.label ?? id;

  // Same model ID should keep same color across refreshes
  const modelKey = normalizeModelKey(id, baseName) || id || baseName;
  const textColorClass = getStableClass(modelKey, MODEL_TEXT_PALETTE, MODEL_COLOR_MAP_KEY, 'model');

  return { colorClass: textColorClass, text: baseName };
}
