/**
 * Region Service
 * 
 * Handles geographic region detection and provides appropriate 12AI API endpoints.
 * Logic:
 * - Keep the user's explicit 12AI host when provided
 * - Otherwise use region-aware defaults
 */

export class RegionService {
    private static isCNCache: boolean | null = null;

    /**
     * Detects if the user is in China based on Browser Timezone.
     * This is a non-invasive, fast way to guess the region.
     */
    static isChina(): boolean {
        if (this.isCNCache !== null) return this.isCNCache;

        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const cnTimezones = [
                'Asia/Shanghai',
                'Asia/Chongqing',
                'Asia/Harbin',
                'Asia/Urumqi',
                'Asia/Hong_Kong',
                'Asia/Macau',
                'Asia/Taipei',
                'PRC'
            ];

            const isCN = cnTimezones.includes(tz);
            console.log(`[RegionService] Detected Timezone: ${tz}, isChina: ${isCN}`);
            this.isCNCache = isCN;
            return isCN;
        } catch (e) {
            console.warn('[RegionService] Timezone detection failed, defaulting to Global', e);
            this.isCNCache = false;
            return false;
        }
    }

    /**
     * Returns the default 12AI Base URL.
     */
    static get12AIBaseUrl(): string {
        const CN_GATEWAY = 'https://cdn.12ai.org';
        const GLOBAL_GATEWAY = 'https://new.12ai.org';

        // Priority 1: Environment Variable Override
        const envUrl = import.meta.env.VITE_PAYMENT_GATEWAY_URL;
        if (envUrl && typeof envUrl === 'string' && envUrl.startsWith('http')) {
            return this.normalizeUrl(envUrl);
        }

        // Priority 2: Region Based Dynamic Routing
        const base = this.isChina() ? CN_GATEWAY : GLOBAL_GATEWAY;
        // 🚀 [修复] 统一使用 normalizeUrl 确保返回的是干净的绝对路径
        return this.normalizeUrl(base);
    }

    /**
     * Optional Backup endpoint if the primary fails
     */
    static getBackupUrl(): string {
        return 'https://hk.12ai.org';
    }

    /**
     * 🚀 [防错增强] 确保返回的是带协议头的完整基础 URL
     * 注意：对于后端转发，应返回基础域名，由 Adapter 拼接具体路径
     */
    private static normalizeUrl(url: string | undefined | null): string {
        const CN_GATEWAY = 'https://cdn.12ai.org';
        const GLOBAL_GATEWAY = 'https://new.12ai.org';

        if (!url || typeof url !== 'string') {
            return this.isChina() ? CN_GATEWAY : GLOBAL_GATEWAY;
        }

        let clean = url.trim().replace(/\/+$/, '');

        // 如果没有协议头，强制加上 https
        if (!clean.startsWith('http')) {
            clean = 'https://' + clean;
        }

        // 🚀 [Critical Fix] 移除所有硬编码的路径后缀，只保留基础 Base URL
        // 具体的 /api/v1/generate 或 /v1beta 等由具体的 Adapter 决定
        const noisySuffixes = ['/api/pay', '/api/v1/generate', '/v1', '/v1beta'];
        noisySuffixes.forEach(suffix => {
            const lowerClean = clean.toLowerCase();
            if (lowerClean.endsWith(suffix)) {
                clean = clean.substring(0, clean.length - suffix.length).replace(/\/+$/, '');
            }
        });

        try {
            const parsed = new URL(clean);
            if (/(^|\.)12ai\.(org|xyz|io|net)$/i.test(parsed.hostname)) {
                return `${parsed.protocol}//${parsed.host}`;
            }
        } catch {
            return this.isChina() ? CN_GATEWAY : GLOBAL_GATEWAY;
        }

        return clean;
    }
}
