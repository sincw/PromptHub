import path from 'node:path';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8'));

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@web-runtime-app': path.resolve(
        __dirname,
        'vendor/renderer/App.tsx',
      ),
      '@web-runtime-toast-provider': path.resolve(
        __dirname,
        'vendor/renderer/components/ui/Toast.tsx',
      ),
      '@web-runtime-i18n': path.resolve(
        __dirname,
        'src/client/i18n.ts',
      ),
      '@web-runtime-globals-css': path.resolve(
        __dirname,
        'vendor/renderer/styles/globals.css',
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
