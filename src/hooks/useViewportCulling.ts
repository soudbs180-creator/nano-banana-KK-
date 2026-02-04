/**
 * 视口裁剪Hook - 计算哪些节点在可见视口内
 * 
 * 用于画布虚拟化：只渲染可见区域的卡片，大幅提升性能
 */

import { useMemo } from 'react';

export interface CullingNode {
    id: string;
    position: { x: number; y: number };
    size?: { width: number; height: number };
}

export interface ViewportTransform {
    x: number;  // 画布平移X
    y: number;  // 画布平移Y
    scale: number;  // 缩放比例
}

export interface ContainerSize {
    width: number;
    height: number;
}

// 默认卡片尺寸（用于未指定size的节点）
const DEFAULT_CARD_SIZE = { width: 320, height: 240 };
// 视口缓冲区（像素） - 预加载边缘外的卡片
const VIEWPORT_BUFFER = 300;

/**
 * 计算视口范围内可见的节点ID集合
 * 
 * @param nodes 所有节点（包含位置信息）
 * @param transform 画布变换（平移+缩放）
 * @param containerSize 容器尺寸
 * @returns 可见节点ID的Set
 */
export function useViewportCulling(
    nodes: CullingNode[],
    transform: ViewportTransform,
    containerSize: ContainerSize
): Set<string> {
    return useMemo(() => {
        const visibleIds = new Set<string>();

        if (!containerSize.width || !containerSize.height) {
            // 容器尺寸未知时，返回所有节点（安全回退）
            nodes.forEach(n => visibleIds.add(n.id));
            return visibleIds;
        }

        const { x: offsetX, y: offsetY, scale } = transform;

        // 计算视口在画布坐标系中的边界（含缓冲区）
        const viewportLeft = (-offsetX - VIEWPORT_BUFFER) / scale;
        const viewportTop = (-offsetY - VIEWPORT_BUFFER) / scale;
        const viewportRight = (-offsetX + containerSize.width + VIEWPORT_BUFFER) / scale;
        const viewportBottom = (-offsetY + containerSize.height + VIEWPORT_BUFFER) / scale;

        for (const node of nodes) {
            const size = node.size || DEFAULT_CARD_SIZE;
            const nodeLeft = node.position.x;
            const nodeTop = node.position.y;
            const nodeRight = nodeLeft + size.width;
            const nodeBottom = nodeTop + size.height;

            // AABB碰撞检测：判断节点是否与视口相交
            const isVisible = !(
                nodeRight < viewportLeft ||
                nodeLeft > viewportRight ||
                nodeBottom < viewportTop ||
                nodeTop > viewportBottom
            );

            if (isVisible) {
                visibleIds.add(node.id);
            }
        }

        // console.log(`[ViewportCulling] ${visibleIds.size}/${nodes.length} nodes visible`);
        return visibleIds;
    }, [nodes, transform.x, transform.y, transform.scale, containerSize.width, containerSize.height]);
}

export default useViewportCulling;
