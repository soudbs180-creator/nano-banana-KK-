import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
        server: {
            port: 3000,
            strictPort: true, // Fail if port 3000 is in use (don't auto-switch)
            host: '0.0.0.0',
            open: true, // Auto-open browser on start
        },
        plugins: [react()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'src'),
            }
        },

        build: {
            // 确保构建时清理旧文件
            emptyOutDir: true,
        }
    };
});
