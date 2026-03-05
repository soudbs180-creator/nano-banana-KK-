/**
 * 🚀 Blob URL 工具函数
 * 将Base64转换为Blob，避免占用JS堆内存
 */

/**
 * 将Data URL转换为Blob
 * 支持 data: URL 和 blob: URL
 * 如果失败返回 null 而不是抛出异常
 */
export async function dataURLToBlob(dataURL: string): Promise<Blob | null> {
    // 如果是 blob: URL，尝试获取，但可能会失败（过期或无效）
    if (dataURL.startsWith('blob:')) {
        try {
            const response = await fetch(dataURL);
            if (response.ok) {
                return response.blob();
            }
        } catch (e) {
            // blob URL 已过期或无效
            console.warn('[blobUtils] Blob URL invalid or expired:', dataURL.slice(0, 50));
        }
        return null;
    }
    
    // 如果是 data: URL，直接解析
    if (dataURL.startsWith('data:')) {
        try {
            const [header, base64] = dataURL.split(',');
            if (!base64) {
                console.warn('[blobUtils] Invalid data URL format');
                return null;
            }
            
            const mimeMatch = header.match(/data:([^;]+)/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
            
            // 处理 Base64（清理非法字符如换行符、空格）
            const cleanBase64 = base64.replace(/[\s\r\n]+/g, '');
            const byteString = atob(cleanBase64);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            
            return new Blob([ab], { type: mimeType });
        } catch (e) {
            console.error('[blobUtils] Failed to parse data URL:', e);
            return null;
        }
    }
    
    // 未知格式
    console.warn('[blobUtils] Unknown URL format:', dataURL.slice(0, 50));
    return null;
}

/**
 * 将Blob转换为Data URL（用于兼容旧代码）
 */
export async function blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * 创建Blob URL（不占用JS内存）
 */
export function createBlobURL(blob: Blob): string {
    return URL.createObjectURL(blob);
}

/**
 * 释放Blob URL
 */
export function revokeBlobURL(url: string): void {
    if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
    }
}
