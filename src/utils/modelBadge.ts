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

// 供应商颜色：基于 provider 名称定义专属颜色，或回退到哈希颜色
export function getProviderBadgeColor(provider?: string): string {
  const providerLower = provider?.toLowerCase() || '';
  if (providerLower.includes('12ai')) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  if (providerLower.includes('official') || providerLower.includes('google')) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (providerLower.includes('custom')) return 'bg-gray-500/20 text-gray-400 border-gray-500/30';

  if (!provider) return PROVIDER_PALETTE[0];
  return PROVIDER_PALETTE[hashString(provider) % PROVIDER_PALETTE.length];
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

  // 使用模型ID哈希来决定纯文字颜色，不带背景高亮
  const textColorClass = MODEL_TEXT_PALETTE[hashString(id) % MODEL_TEXT_PALETTE.length];

  return { colorClass: textColorClass, text: baseName };
}
