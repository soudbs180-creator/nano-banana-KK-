/**
 * 图片下载工具类
 */

/**
 * 将 Base64 字符串转换为 Blob 对象
 * @param base64 Base64 数据字符串（带或不带 data: 前缀）
 * @param contentType 可选的 MIME 类型
 */
export function base64ToBlob(base64: string, contentType: string = ''): Blob {
    // 处理带前缀的情况 data:image/png;base64,xxxx
    let pureBase64 = base64;
    if (base64.includes(',')) {
        const parts = base64.split(',');
        pureBase64 = parts[1];
        if (!contentType) {
            const match = parts[0].match(/:(.*?);/);
            contentType = match ? match[1] : '';
        }
    }

    const byteCharacters = atob(pureBase64);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: contentType });
}

/**
 * 触发浏览器下载
 * @param blobOrUrl Blob 对象或 URL
 * @param filename 下载文件名
 */
export function triggerDownload(blobOrUrl: Blob | string, filename: string): void {
    const url = typeof blobOrUrl === 'string'
        ? blobOrUrl
        : URL.createObjectURL(blobOrUrl);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // 如果是 Blob URL，下载触发后延迟释放，防止下载尚未开始就被销毁
    if (typeof blobOrUrl !== 'string') {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

/**
 * 生成符合规范的下载文件名
 * 格式: KKStudio_{类别}_{随机英文数字混合10位以内}.{扩展名}
 * @param type 类别，如 'Image' | 'Video' | 'Audio'
 * @param extension 扩展名，包含点（例如 '.png'）
 */
export function generateDownloadFilename(type: 'Image' | 'Video' | 'Audio', extension: string = '.png'): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomString = '';
    for (let i = 0; i < 10; i++) {
        randomString += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `KKStudio_${type}_${randomString}${extension}`;
}
