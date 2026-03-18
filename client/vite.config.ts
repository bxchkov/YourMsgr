import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            'libsodium-wrappers': path.resolve(__dirname, 'node_modules/libsodium-wrappers/dist/modules/libsodium-wrappers.js'),
        },
    },
    optimizeDeps: {
        include: ['libsodium-wrappers'],
    },
    css: {
        preprocessorOptions: {
            scss: {
                api: 'modern-compiler',
            },
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/auth': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
            '/ws': {
                target: 'http://localhost:3000',
                ws: true,
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('libsodium')) {
                        return 'crypto'
                    }

                    if (id.includes('node_modules')) {
                        if (
                            id.includes('/@vue/') ||
                            id.includes('\\@vue\\') ||
                            id.includes('/vue/') ||
                            id.includes('\\vue\\') ||
                            id.includes('vue-router') ||
                            id.includes('pinia')
                        ) {
                            return 'vue-vendor'
                        }
                    }
                },
            },
        },
    },
})
