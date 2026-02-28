import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                shelfwatch: resolve(__dirname, 'shelfwatch.html'),
                pixtools: resolve(__dirname, 'pixtools.html'),
                statusmonitor: resolve(__dirname, 'statusmonitor.html'),
                crawlerrag: resolve(__dirname, 'crawler-rag.html'),
            },
        },
    },
});
