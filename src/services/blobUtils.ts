/**
 * 🚀 Blob URL 工具函数
 * 将Base64转换为Blob，避免占用JS堆内存
 */

/**
 * 将Data URL转换为Blob
 */
export async function dataURLToBlob(dataURL: string): Promise<Blob> {
    const response = await fetch(dataURL);
    return response.blob();
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
