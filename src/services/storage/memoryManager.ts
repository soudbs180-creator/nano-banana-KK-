/**
 * Memory Manager Service
 * 
 * 管理图片内存，实现激进的垃圾回收策略
 * 优化移动端内存使用，防止OOM崩溃
 */

// 内存使用统计
interface MemoryStats {
    blobUrlCount: number;
    estimatedBytes: number;
    revokedCount: number;
}

// 活跃的Blob URL追踪
const activeBlobUrls = new Map<string, {
    url: string;
    createdAt: number;
    size: number;
    lastAccessed: number;
    priority: 'high' | 'normal' | 'low';
}>();

// 内存限制配置（字节）
const MEMORY_LIMITS = {
    MOBILE: 150 * 1024 * 1024,    // 150MB
    DESKTOP: 500 * 1024 * 1024,   // 500MB
    CRITICAL: 50 * 1024 * 1024,   // 50MB - 紧急清理阈值
};

// 设备检测
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const memoryLimit = isMobile ? MEMORY_LIMITS.MOBILE : MEMORY_LIMITS.DESKTOP;

let totalEstimatedBytes = 0;
let revokedCount = 0;

/**
 * 注册Blob URL用于追踪
 */
export function registerBlobUrl(
    id: string,
    url: string,
    options: {
        size?: number;
        priority?: 'high' | 'normal' | 'low';
    } = {}
): void {
    const { size = 0, priority = 'normal' } = options;

    // 如果已存在，先释放旧的
    if (activeBlobUrls.has(id)) {
        releaseBlobUrl(id);
    }

    activeBlobUrls.set(id, {
        url,
        createdAt: Date.now(),
        size,
        lastAccessed: Date.now(),
        priority
    });

    totalEstimatedBytes += size;

    // 检查是否需要内存清理
    checkMemoryPressure();
}

/**
 * 更新Blob URL访问时间
 */
export function touchBlobUrl(id: string): void {
    const entry = activeBlobUrls.get(id);
    if (entry) {
        entry.lastAccessed = Date.now();
    }
}

/**
 * 释放单个Blob URL
 */
export function releaseBlobUrl(id: string): boolean {
    const entry = activeBlobUrls.get(id);
    if (!entry) return false;

    try {
        URL.revokeObjectURL(entry.url);
        totalEstimatedBytes -= entry.size;
        revokedCount++;
        activeBlobUrls.delete(id);
        return true;
    } catch (e) {
        console.warn(`[MemoryManager] Failed to revoke URL for ${id}`, e);
        activeBlobUrls.delete(id);
        return false;
    }
}

/**
 * 批量释放Blob URLs
 */
export function releaseBlobUrls(ids: string[]): number {
    let released = 0;
    for (const id of ids) {
        if (releaseBlobUrl(id)) released++;
    }
    console.log(`[MemoryManager] Released ${released} Blob URLs`);
    return released;
}

/**
 * 检查内存压力并执行清理
 */
function checkMemoryPressure(): void {
    if (totalEstimatedBytes < memoryLimit) return;

    console.warn(`[MemoryManager] Memory pressure detected: ${formatBytes(totalEstimatedBytes)} / ${formatBytes(memoryLimit)}`);

    // 按优先级和访问时间排序
    const entries = Array.from(activeBlobUrls.entries())
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => {
            // 低优先级优先释放
            const priorityOrder = { low: 0, normal: 1, high: 2 };
            const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            if (priorityDiff !== 0) return priorityDiff;
            // 最久未访问的优先释放
            return a.lastAccessed - b.lastAccessed;
        });

    // 释放直到低于阈值
    const targetBytes = memoryLimit * 0.7; // 目标降到70%
    let releasedCount = 0;

    for (const entry of entries) {
        if (totalEstimatedBytes <= targetBytes) break;
        if (entry.priority === 'high') continue; // 不释放高优先级

        if (releaseBlobUrl(entry.id)) {
            releasedCount++;
        }
    }

    console.log(`[MemoryManager] Cleaned up ${releasedCount} entries, now ${formatBytes(totalEstimatedBytes)}`);
}

/**
 * 紧急内存清理
 * 释放所有非高优先级的Blob URL
 */
export function emergencyCleanup(): number {
    console.warn('[MemoryManager] 🚨 Emergency cleanup triggered');

    const entriesToRelease = Array.from(activeBlobUrls.entries())
        .filter(([_, data]) => data.priority !== 'high')
        .map(([id]) => id);

    return releaseBlobUrls(entriesToRelease);
}

/**
 * 释放视口外的图片资源
 */
export function releaseOutOfViewport(visibleIds: Set<string>): number {
    const entriesToRelease = Array.from(activeBlobUrls.entries())
        .filter(([id, data]) => !visibleIds.has(id) && data.priority !== 'high')
        .map(([id]) => id);

    if (entriesToRelease.length > 0) {
        console.log(`[MemoryManager] Releasing ${entriesToRelease.length} out-of-viewport images`);
    }

    return releaseBlobUrls(entriesToRelease);
}

/**
 * 获取内存统计
 */
export function getMemoryStats(): MemoryStats {
    return {
        blobUrlCount: activeBlobUrls.size,
        estimatedBytes: totalEstimatedBytes,
        revokedCount
    };
}

/**
 * 格式化字节数
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================
// 页面可见性监听 - 后台时激进清理
// ============================================

let visibilityCleanupEnabled = true;

export function setVisibilityCleanup(enabled: boolean): void {
    visibilityCleanupEnabled = enabled;
}

function handleVisibilityChange(): void {
    if (!visibilityCleanupEnabled) return;

    if (document.hidden) {
        console.log('[MemoryManager] Page hidden, performing cleanup');
        // 页面隐藏时，释放低优先级资源
        const lowPriorityEntries = Array.from(activeBlobUrls.entries())
            .filter(([_, data]) => data.priority === 'low')
            .map(([id]) => id);

        releaseBlobUrls(lowPriorityEntries);
    }
}

// 自动监听页面可见性
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
}

// ============================================
// 内存警告监听（如果浏览器支持）
// ============================================

if (typeof navigator !== 'undefined' && 'memory' in performance) {
    // Chrome的performance.memory API
    setInterval(() => {
        const memory = (performance as any).memory;
        if (memory) {
            const usedRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
            if (usedRatio > 0.9) {
                console.warn(`[MemoryManager] High JS heap usage: ${(usedRatio * 100).toFixed(1)}%`);
                emergencyCleanup();
            }
        }
    }, 30000); // 每30秒检查一次
}

// ============================================
// 导出用于测试
// ============================================

export const _internal = {
    activeBlobUrls,
    memoryLimit,
    isMobile
};
