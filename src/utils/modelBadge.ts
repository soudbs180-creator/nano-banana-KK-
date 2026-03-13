import type { CSSProperties } from 'react';

export type ModelBadge = { colorClass: string; text: string };

const MODEL_TEXT_PALETTE = [
  'text-purple-400',
  'text-yellow-400',
  'text-red-400',
  'text-green-400',
  'text-pink-400',
  'text-indigo-400',
  'text-teal-400',
  'text-orange-400',
];

const PROVIDER_PALETTE = [
  'bg-blue-600/20 text-blue-400 border-blue-500/30',
  'bg-yellow-600/20 text-yellow-400 border-yellow-500/30',
  'bg-green-600/20 text-green-400 border-green-500/30',
  'bg-purple-600/20 text-purple-400 border-purple-500/30',
  'bg-pink-600/20 text-pink-400 border-pink-500/30',
  'bg-indigo-600/20 text-indigo-400 border-indigo-500/30',
];

const MODEL_COLOR_MAP_KEY = 'kk_model_color_map_v1';
const PROVIDER_COLOR_MAP_KEY = 'kk_provider_color_map_v1';
const PROVIDERS_STORAGE_KEY = 'kk_studio_third_party_providers';

let modelColorMapCache: Record<string, string> | null = null;
let providerColorMapCache: Record<string, string> | null = null;
let configuredProviderColorCache: Record<string, string> | null = null;
let configuredProviderColorRaw = '';

function hashString(str: string): number {
  let hash = 2166136261;
  for (let index = 0; index < str.length; index += 1) {
    hash = (hash ^ str.charCodeAt(index)) * 16777619;
  }
  return Math.abs(hash);
}

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
    return;
  }
}

function normalizeModelKey(id?: string, label?: string): string {
  const raw = (id || label || '').toLowerCase().trim();
  const withoutProvider = raw.split('@')[0];
  return withoutProvider
    .replace(/-\d{8}$/i, '')
    .replace(/-(16[x-]9|9[x-]16|1[x-]1|4[x-]3|3[x-]4|21[x-]9|9[x-]21|3[x-]2|2[x-]3|4[x-]5|5[x-]4)$/i, '')
    .replace(/-(4k|2k|1k|high|hd|ultra|medium|low|standard)$/i, '')
    .trim();
}

function normalizeProviderKey(provider?: string): string {
  return (provider || 'unknown').toLowerCase().trim();
}

function normalizeHexColor(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^#[A-Fa-f0-9]{3,8}$/.test(trimmed)) return trimmed;
  if (/^[A-Fa-f0-9]{3,8}$/.test(trimmed)) return `#${trimmed}`;
  return null;
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((item) => item + item).join('')
    : normalized.slice(0, 6);
  const red = parseInt(expanded.slice(0, 2), 16);
  const green = parseInt(expanded.slice(2, 4), 16);
  const blue = parseInt(expanded.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
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
  const available = palette.find((item) => !used.has(item));
  const resolved = available || palette[hashString(key) % palette.length];
  map[key] = resolved;
  writeMap(storageKey, map);
  return resolved;
}

function extractTextColor(badgeClass: string): string {
  const match = badgeClass.match(/text-\S+/);
  return match ? match[0] : 'text-gray-400';
}

export function getConfiguredProviderColor(provider?: string): string | null {
  if (typeof window === 'undefined' || !provider) return null;

  const raw = localStorage.getItem(PROVIDERS_STORAGE_KEY) || '';
  if (configuredProviderColorCache && raw === configuredProviderColorRaw) {
    return configuredProviderColorCache[normalizeProviderKey(provider)] || null;
  }

  configuredProviderColorRaw = raw;
  configuredProviderColorCache = {};

  try {
    const providers = JSON.parse(raw);
    if (Array.isArray(providers)) {
      providers.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const key = normalizeProviderKey(String(item.name || item.provider || ''));
        if (!key) return;
        const color = normalizeHexColor(item.providerColor || item.badgeColor);
        if (color) {
          configuredProviderColorCache![key] = color;
        }
      });
    }
  } catch {
    configuredProviderColorCache = {};
  }

  return configuredProviderColorCache[normalizeProviderKey(provider)] || null;
}

export function getProviderBadgeColor(provider?: string): string {
  const providerLower = provider?.toLowerCase() || '';
  if (providerLower.includes('official') || providerLower.includes('google')) {
    return 'bg-green-500/20 text-green-400 border-green-500/30';
  }
  if (providerLower.includes('custom')) {
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
  if (!provider) return PROVIDER_PALETTE[0];
  return getStableClass(normalizeProviderKey(provider), PROVIDER_PALETTE, PROVIDER_COLOR_MAP_KEY, 'provider');
}

export function getProviderBadgeStyle(provider?: string): CSSProperties | undefined {
  const configuredColor = getConfiguredProviderColor(provider);
  if (!configuredColor) return undefined;

  return {
    color: configuredColor,
    backgroundColor: hexToRgba(configuredColor, 0.18),
    borderColor: hexToRgba(configuredColor, 0.36),
  };
}

export function getModelBadgeInfo(model: {
  id: string;
  label?: string;
  provider?: string;
  colorStart?: string;
  colorEnd?: string;
  textColor?: 'white' | 'black';
}): ModelBadge {
  const id = model.id ?? '';
  const text = model.label ?? id;

  if (model.colorStart || model.colorEnd) {
    return {
      colorClass: model.textColor === 'black' ? 'text-slate-900' : 'text-white',
      text,
    };
  }

  const modelKey = normalizeModelKey(id, text);
  const providerBadge = getProviderBadgeColor(model.provider);
  const fallbackTextColor = extractTextColor(providerBadge);
  const colorClass = getStableClass(modelKey, MODEL_TEXT_PALETTE, MODEL_COLOR_MAP_KEY, 'model') || fallbackTextColor;
  return { colorClass, text };
}
