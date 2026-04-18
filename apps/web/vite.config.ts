import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@desktop-renderer-app': path.resolve(
        __dirname,
        '../desktop/src/renderer/App.tsx',
      ),
      '@desktop-toast-provider': path.resolve(
        __dirname,
        '../desktop/src/renderer/components/ui/Toast.tsx',
      ),
      '@desktop-renderer-i18n': path.resolve(
        __dirname,
        'src/client/i18n.ts',
      ),
      '@desktop-renderer-globals-css': path.resolve(
        __dirname,
        '../desktop/src/renderer/styles/globals.css',
      ),
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
