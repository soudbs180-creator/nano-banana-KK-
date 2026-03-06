/**
 * 🔒 图片本地备份服务
 * 实现原图的本地文档系统备份，作为IndexedDB的第二层防护
 */

import { getAllImageIds, getOriginalImage } from '../storage/imageStorage';
import { notify } from '../system/notificationService';

/**
 * 🔒 批量导出所有原图到本地文档夹
 * 使用 File System Access API 让用户选择保存位置
 */
export async function exportAllOriginalImages(): Promise<void> {
    try {
        // 检查浏览器是否支持 File System Access API
        if (!('showDirectoryPicker' in window)) {
            notify.error(
                '浏览器不支持',
                '您的浏览器不支持文档系统访问API。请使用最新版Chrome、Edge或支持的浏览器。'
            );
            return;
        }

        // 1. 获取所有图片ID
        const imageIds = await getAllImageIds();

        if (imageIds.length === 0) {
            notify.info('无图片', '当前没有可导出的图片');
            return;
        }

        // 2. 让用户选择保存文档夹
        const dirHandle = await (window as any).showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'downloads'
        });

        console.log(`[Backup] 🔒 Starting export of ${imageIds.length} images...`);
        notify.info('导出中', `正在导出 ${imageIds.length} 张原图...`);

        let successCount = 0;
        let failCount = 0;

        // 3. 逐个导出图片
        for (let i = 0; i < imageIds.length; i++) {
            const id = imageIds[i];
            try {
                const dataURL = await getOriginalImage(id);

                if (!dataURL) {
                    console.warn(`[Backup] 🔒 Skipping ${id} (not found)`);
                    failCount++;
                    continue;
                }

                // 转换data URL为Blob
                const response = await fetch(dataURL);
                const blob = await response.blob();

                // 创建文档
                const filename = `kk_original_${id}.png`;
                const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();

                successCount++;
                console.log(`[Backup] 🔒 ✅ Exported ${i + 1}/${imageIds.length}: ${filename}`);
            } catch (err) {
                console.error(`[Backup] 🔒 ❌ Failed to export ${id}:`, err);
                failCount++;
            }
        }

        // 4. 显示结果
        if (successCount > 0) {
            notify.success(
                '导出成功',
                `已成功导出 ${successCount} 张原图${failCount > 0 ? `，失败 ${failCount} 张` : ''}`
            );
        } else {
            notify.error('导出失败', '没有成功导出任何图片');
        }

        console.log(`[Backup] 🔒 Export complete: ${successCount} success, ${failCount} failed`);
    } catch (err: any) {
        if (err.name === 'AbortError') {
            console.log('[Backup] 🔒 User cancelled export');
            notify.info('已取消', '您已取消导出操作');
        } else {
            console.error('[Backup] 🔒 ❌ Export failed:', err);
            notify.error('导出失败', err.message || '未知错误');
        }
    }
}

/**
 * 🔒 单张图片自动备份到下载文档夹
 * @param id 图片ID
 * @param dataURL 图片数据URL
 */
export async function autoBackupImage(id: string, dataURL: string): Promise<void> {
    try {
        // 转换为Blob
        const response = await fetch(dataURL);
        const blob = await response.blob();

        // 触发下载
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kk_backup_${id}.png`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();

        // 清理
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        console.log(`[Backup] 🔒 ✅ Auto-backed up ${id}`);
    } catch (err) {
        console.error('[Backup] 🔒 ❌ Auto-backup failed:', err);
    }
}

/**
 * 🔒 单张图片导出（用于右键菜单等）
 * @param id 图片ID
 * @param filename 可选文档名
 */
export async function exportSingleImage(id: string, filename?: string): Promise<void> {
    try {
        const dataURL = await getOriginalImage(id);

        if (!dataURL) {
            notify.error('导出失败', '找不到原图');
            return;
        }

        // 转换为Blob
        const response = await fetch(dataURL);
        const blob = await response.blob();

        // 触发下载
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `kk_original_${id}.png`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();

        // 清理
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        notify.success('导出成功', '原图已下载到本地');
        console.log(`[Backup] 🔒 ✅ Exported single image: ${id}`);
    } catch (err: any) {
        console.error('[Backup] 🔒 ❌ Export failed:', err);
        notify.error('导出失败', err.message || '未知错误');
    }
}
