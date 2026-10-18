import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  base: './',
  plugins: [solid(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8080', ws: true, changeOrigin: false },
    },
  },
  build: {
    target: 'es2023',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
