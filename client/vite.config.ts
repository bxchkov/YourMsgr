import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appVersion = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, './package.json'), 'utf8'),
).version as string

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(appVersion),
    },
    plugins: [vue()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    optimizeDeps: {
        include: ['tweetnacl'],
    },
    css: {
        preprocessorOptions: {
            scss: {
                api: 'modern-compiler',
            },
        },
    },
    test: {
        environment: 'node',
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
