/**
 * 生成标签颜色 - 基于 Design System v2.0
 * 8种固定颜色，相同名称的标签颜色一致
 * 
 * @param tagName 标签名称
 * @returns 包含内联样式的颜色对象
 */

export interface TagColor {
    bg: string;      // 背景色（inline style）
    text: string;    // 文本色（inline style）
    border: string;  // 边框色（inline style）
}

/**
 * Design System v2.0 - 8色标签系统
 * 颜色顺序：红/橙/黄/绿/青/蓝/紫/粉
 */
const TAG_COLORS: TagColor[] = [
    { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },   // 红
    { bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316', border: 'rgba(249, 115, 22, 0.3)' }, // 橙
    { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308', border: 'rgba(234, 179, 8, 0.3)' },   // 黄
    { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', border: 'rgba(34, 197, 94, 0.3)' },   // 绿
    { bg: 'rgba(6, 182, 212, 0.15)', text: '#06b6d4', border: 'rgba(6, 182, 212, 0.3)' },   // 青
    { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' }, // 蓝
    { bg: 'rgba(139, 92, 246, 0.15)', text: '#8b5cf6', border: 'rgba(139, 92, 246, 0.3)' }, // 紫
    { bg: 'rgba(236, 72, 153, 0.15)', text: '#ec4899', border: 'rgba(236, 72, 153, 0.3)' }, // 粉
];

/**
 * 根据标签名生成稳定颜色
 * 相同名称永远返回相同颜色
 */
export const generateTagColor = (tagName: string): TagColor => {
    // 使用字符码相加的哈希算法
    const hash = tagName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return TAG_COLORS[hash % TAG_COLORS.length];
};

/**
 * 获取所有可用的标签颜色（用于预览/选择）
 */
export const getAllTagColors = (): TagColor[] => {
    return TAG_COLORS;
};
